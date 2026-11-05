import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactDirectory, PlanValidationError } from './plan.mjs';

export function runGit(args, cwd) {
	const result = spawnSync('git', args, {
		cwd,
		encoding: 'utf8',
		maxBuffer: 256 * 1024 * 1024,
		windowsHide: true,
	});
	return {
		status: result.error ? null : result.status,
		stdout: result.stdout ?? '',
	};
}

function gitLine(args, cwd) {
	const result = runGit(args, cwd);
	return result.status === 0 ? result.stdout.trim() : null;
}

export function realpathOrResolve(value) {
	const resolved = path.resolve(value);
	try {
		return realpathSync.native(resolved);
	} catch {
		return resolved;
	}
}

/** The installed skill may live inside the repository it validates (for example under `.github/skills`). */
export const skillDirectory = realpathOrResolve(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));

export function isWithin(root, candidate) {
	const relative = path.relative(root, candidate);
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function gitTopLevel(directory) {
	const output = gitLine(['rev-parse', '--show-toplevel'], directory);
	return output ? realpathOrResolve(output) : null;
}

export function gitHasHead(directory) {
	return gitLine(['rev-parse', '--verify', '--quiet', 'HEAD'], directory) !== null;
}

/**
 * Resolves the directories a plan may use. Relative `cwd` and `prependPath`
 * entries resolve from the package directory and may reach any directory
 * inside the workspace root: the plan's `workspaceRoot`, else the enclosing
 * git repository, else the package directory itself.
 */
export function resolveWorkspace(packageDirectory, plan = {}) {
	const root = realpathOrResolve(packageDirectory);
	const gitRoot = gitTopLevel(root);
	let workspaceRoot = root;
	let declared = false;
	if (plan.workspaceRoot !== undefined) {
		const candidate = realpathOrResolve(path.isAbsolute(plan.workspaceRoot)
			? plan.workspaceRoot
			: path.resolve(root, plan.workspaceRoot));
		if (!isWithin(candidate, root)) {
			throw new PlanValidationError([
				`workspaceRoot must be packageDirectory or one of its ancestors: ${plan.workspaceRoot}`,
			]);
		}
		workspaceRoot = candidate;
		declared = true;
	} else if (gitRoot && isWithin(gitRoot, root)) {
		workspaceRoot = gitRoot;
	}
	return { packageDirectory: root, workspaceRoot, workspaceRootDeclared: declared, gitRoot };
}

/**
 * Result files are transient. In a git repository they live under the git
 * directory so they never appear in the working tree or the diff.
 */
export function resultDirectory(packageDirectory) {
	const root = realpathOrResolve(packageDirectory);
	const gitPath = gitLine(
		['rev-parse', '--path-format=absolute', '--git-path', 'typescript-project-validate'],
		root,
	);
	if (!gitPath) {
		return artifactDirectory(root);
	}
	const name = path.basename(root).replace(/[^A-Za-z0-9._-]/g, '_') || 'root';
	const key = createHash('sha256').update(root).digest('hex').slice(0, 12);
	return path.join(path.resolve(root, gitPath), `${name}-${key}`);
}

/**
 * Adds the plan directory to `.git/info/exclude` so the plan is never
 * committed by accident. Returns the excluded pattern, or null.
 */
export async function excludePlanDirectory(packageDirectory) {
	const root = realpathOrResolve(packageDirectory);
	const gitRoot = gitTopLevel(root);
	if (!gitRoot) {
		return null;
	}
	const excludePath = gitLine(
		['rev-parse', '--path-format=absolute', '--git-path', 'info/exclude'],
		root,
	);
	if (!excludePath) {
		return null;
	}
	const relative = path.relative(gitRoot, artifactDirectory(root)).split(path.sep).join('/');
	const pattern = `/${relative}/`;
	try {
		let existing = '';
		try {
			existing = await readFile(excludePath, 'utf8');
		} catch (error) {
			if (error.code !== 'ENOENT') {
				throw error;
			}
		}
		if (!existing.split(/\r?\n/).includes(pattern)) {
			await mkdir(path.dirname(excludePath), { recursive: true });
			const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
			await appendFile(
				excludePath,
				`${separator}# typescript-project-validate (transient validation plan)\n${pattern}\n`,
				'utf8',
			);
		}
		return pattern;
	} catch {
		return null;
	}
}

/**
 * Returns a reason when the package declares dependencies but no
 * `node_modules` (or Yarn PnP `.pnp.cjs`) exists in it or any ancestor.
 */
export function missingDependencyInstall(packageDirectory) {
	let manifest;
	try {
		manifest = JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
	} catch {
		return null;
	}
	const declared = Object.keys({
		...manifest?.dependencies,
		...manifest?.devDependencies,
	}).length;
	if (declared === 0) {
		return null;
	}
	let current = packageDirectory;
	while (true) {
		if (existsSync(path.join(current, 'node_modules')) || existsSync(path.join(current, '.pnp.cjs'))) {
			return null;
		}
		const parent = path.dirname(current);
		if (parent === current) {
			break;
		}
		current = parent;
	}
	return `dependencies are not installed: package.json declares ${declared} dependencies but no node_modules `
		+ 'exists. Run the frozen-lockfile install (npm ci, yarn install --immutable, pnpm install '
		+ '--frozen-lockfile) before the baseline.';
}

/** Counts changed paths in the package directory, ignoring the plan and skill directories. */
export function countWorkingTreeChanges(packageDirectory) {
	const gitRoot = gitTopLevel(packageDirectory);
	const result = runGit(['status', '--porcelain', '-z', '--untracked-files=all', '--', '.'], packageDirectory);
	if (!gitRoot || result.status !== 0) {
		return null;
	}
	const entries = result.stdout.split('\0');
	let count = 0;
	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index];
		if (entry.length <= 3) {
			continue;
		}
		if (/^[RC]/.test(entry)) {
			index++;
		}
		const file = entry.slice(3);
		if (!/(^|\/)\.copilot\/typescript-project-validate\//.test(file)
			&& !isWithin(skillDirectory, path.join(gitRoot, file))) {
			count++;
		}
	}
	return count;
}
