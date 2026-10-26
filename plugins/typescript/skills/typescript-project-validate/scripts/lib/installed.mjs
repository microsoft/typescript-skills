import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

// Detects an installed dependency tree that no longer matches package.json:
// a dependency added or bumped without an install that succeeded, so checks
// run against versions the user and CI will not get.

const sections = ['dependencies', 'devDependencies'];
const listedMismatches = 8;

/**
 * Returns a warning when a declared dependency of the package (or the
 * workspace root) is missing from node_modules or installed at a version
 * outside its declared range, or null. Yarn PnP installs, non-registry
 * specifiers (workspace:, file:, git, tags), overridden packages and
 * workspace links are not checked.
 */
export function staleDependencyInstall(packageDirectory, workspaceRoot = packageDirectory) {
	const mismatches = [];
	for (const directory of [...new Set([workspaceRoot, packageDirectory])]) {
		mismatches.push(...manifestMismatches(directory, workspaceRoot));
	}
	if (mismatches.length === 0) {
		return null;
	}
	const shown = mismatches.slice(0, listedMismatches).join('; ');
	return `installed dependencies do not match package.json: ${shown}`
		+ `${mismatches.length > listedMismatches ? `; … ${mismatches.length - listedMismatches} more` : ''}. `
		+ 'Checks would run against a different tree than a fresh install gets. Run the package manager\'s '
		+ 'install (npm install, yarn install, pnpm install), confirm it exits 0 and that node_modules has the '
		+ 'declared versions, then rerun. If it fails with ERESOLVE or a peer conflict, pick compatible '
		+ 'versions instead of using --force or --legacy-peer-deps.';
}

function manifestMismatches(directory, workspaceRoot) {
	const manifest = readJson(path.join(directory, 'package.json'));
	if (!manifest || usesPlugAndPlay(directory)) {
		return [];
	}
	const overridden = overriddenNames(directory);
	const bundled = new Set(Array.isArray(manifest.bundleDependencies) ? manifest.bundleDependencies : []);
	const label = path.relative(workspaceRoot, directory).split(path.sep).join('/') || 'package.json';
	const missing = [];
	const mismatched = [];
	let installedCount = 0;
	for (const section of sections) {
		for (const [name, specifier] of Object.entries(manifest[section] ?? {})) {
			if (typeof specifier !== 'string' || overridden.has(name) || bundled.has(name)) {
				continue;
			}
			const range = registryRange(specifier);
			const installed = findInstalled(directory, name);
			if (installed) {
				installedCount++;
			}
			if (range === null || (installed && installed.linked)) {
				continue;
			}
			if (!installed) {
				missing.push(`${label}: ${name} ${specifier} (not installed)`);
			} else if (!satisfies(installed.version, range)) {
				mismatched.push(`${label}: ${name} ${specifier} (installed ${installed.version})`);
			}
		}
	}
	// A tree with none of the manifest's dependencies is a missing install,
	// which missingDependencyInstall reports; it may also omit devDependencies.
	return installedCount > 0 ? [...mismatched, ...missing] : mismatched;
}

function usesPlugAndPlay(directory) {
	let current = directory;
	while (true) {
		if (existsSync(path.join(current, '.pnp.cjs')) || existsSync(path.join(current, '.pnp.js'))) {
			return true;
		}
		const parent = path.dirname(current);
		if (parent === current) {
			return false;
		}
		current = parent;
	}
}

/**
 * Names overridden by any package.json or pnpm-workspace.yaml from the
 * manifest's directory up, since the install root may sit anywhere above it.
 */
function overriddenNames(directory) {
	const names = new Set();
	let current = directory;
	while (true) {
		for (const name of overrideNames(readJson(path.join(current, 'package.json')))) {
			names.add(name);
		}
		for (const name of pnpmWorkspaceOverrides(path.join(current, 'pnpm-workspace.yaml'))) {
			names.add(name);
		}
		const parent = path.dirname(current);
		if (parent === current) {
			return names;
		}
		current = parent;
	}
}

/** Reads the keys of the top-level `overrides:` map without a YAML parser. */
function pnpmWorkspaceOverrides(filePath) {
	let text;
	try {
		text = readFileSync(filePath, 'utf8');
	} catch {
		return [];
	}
	const keys = {};
	let inOverrides = false;
	for (const line of text.split(/\r?\n/)) {
		if (/^overrides:\s*(#.*)?$/.test(line)) {
			inOverrides = true;
		} else if (/^\S/.test(line)) {
			inOverrides = false;
		} else if (inOverrides) {
			const match = /^\s+(['"]?)(.+?)\1\s*:/.exec(line);
			if (match) {
				keys[match[2]] = '';
			}
		}
	}
	return overrideNames({ overrides: keys });
}

function overrideNames(manifest) {
	if (!manifest) {
		return [];
	}
	const names = [];
	const collect = table => {
		if (!table || typeof table !== 'object') {
			return;
		}
		for (const [key, value] of Object.entries(table)) {
			// "a>b", "a/b", "**/b", "@scope/b@1": any trailing path segment may name the package.
			for (const segment of key.split('>')) {
				const pieces = segment.replace(/^\*\*\//, '').split('/');
				for (let index = 0; index < pieces.length; index++) {
					names.push(pieces.slice(index).join('/').replace(/(.)@.*$/, '$1'));
				}
			}
			collect(value);
		}
	};
	collect(manifest.overrides);
	collect(manifest.resolutions);
	collect(manifest.pnpm?.overrides);
	return names;
}

/** Finds the copy of `name` that Node resolves from `directory`. */
function findInstalled(directory, name) {
	let current = directory;
	while (true) {
		const packageDirectory = path.join(current, 'node_modules', name);
		const manifest = readJson(path.join(packageDirectory, 'package.json'));
		if (manifest) {
			let real = packageDirectory;
			try {
				real = realpathSync.native(packageDirectory);
			} catch {
				// Keep the unresolved path.
			}
			return {
				version: typeof manifest.version === 'string' ? manifest.version : '',
				linked: !real.split(path.sep).includes('node_modules'),
			};
		}
		const parent = path.dirname(current);
		if (parent === current) {
			return null;
		}
		current = parent;
	}
}

/** Returns the semver range of a registry specifier, or null when it is not one. */
export function registryRange(specifier) {
	let value = specifier.trim();
	if (value.startsWith('npm:')) {
		const at = value.lastIndexOf('@');
		value = at > 4 ? value.slice(at + 1) : '*';
	}
	if (value === '' || value === '*' || value === 'latest') {
		return null;
	}
	if (/^[a-z+]+:|\/|^[a-z][\w.-]*$/i.test(value) && !/^[xX]$/.test(value)) {
		return null;
	}
	return parseRange(value);
}

function parseRange(range) {
	const alternatives = [];
	for (const part of range.split('||')) {
		const trimmed = part.trim();
		if (trimmed === '' || trimmed === '*') {
			return null;
		}
		const comparators = [];
		const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(trimmed);
		const tokens = hyphen
			? [`>=${hyphen[1]}`, `<=${hyphen[2]}`]
			: trimmed.replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1').split(/\s+/);
		for (const token of tokens) {
			const parsed = parseComparator(token);
			if (parsed === null) {
				return null;
			}
			comparators.push(...parsed);
		}
		alternatives.push(comparators);
	}
	return alternatives;
}

function parseComparator(token) {
	const match = /^(\^|~>?|>=|<=|>|<|=)?v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(token);
	if (!match) {
		return null;
	}
	const operator = match[1] ?? '';
	const parts = [match[2], match[3], match[4]].map(part =>
		part === undefined || /^[xX*]$/.test(part) ? null : Number(part));
	const [major, minor, patch] = parts;
	if (major === null) {
		return operator === '<' ? [['<', [0, 0, 0]]] : [];
	}
	const low = [major, minor ?? 0, patch ?? 0];
	const nextOf = () => minor === null ? [major + 1, 0, 0] : patch === null ? [major, minor + 1, 0] : null;
	switch (operator) {
		case '^': {
			let upper;
			if (major > 0 || minor === null) {
				upper = [major + 1, 0, 0];
			} else if (minor > 0 || patch === null) {
				upper = [0, minor + 1, 0];
			} else {
				upper = [0, 0, patch + 1];
			}
			return [['>=', low], ['<', upper]];
		}
		case '~':
		case '~>':
			return [['>=', low], ['<', minor === null ? [major + 1, 0, 0] : [major, minor + 1, 0]]];
		case '>':
			return nextOf() ? [['>=', nextOf()]] : [['>', low]];
		case '>=':
			return [['>=', low]];
		case '<':
			return [['<', low]];
		case '<=':
			return nextOf() ? [['<', nextOf()]] : [['<=', low]];
		default:
			return nextOf() ? [['>=', low], ['<', nextOf()]] : [['=', low]];
	}
}

export function satisfies(version, range) {
	const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
	if (!match) {
		return true;
	}
	const installed = [Number(match[1]), Number(match[2]), Number(match[3])];
	return range.some(comparators => comparators.every(([operator, bound]) => {
		const order = compare(installed, bound);
		switch (operator) {
			case '>=': return order >= 0;
			case '>': return order > 0;
			case '<': return order < 0;
			case '<=': return order <= 0;
			default: return order === 0;
		}
	}));
}

function compare(left, right) {
	for (let index = 0; index < 3; index++) {
		if (left[index] !== right[index]) {
			return left[index] < right[index] ? -1 : 1;
		}
	}
	return 0;
}

function readJson(filePath) {
	try {
		return JSON.parse(readFileSync(filePath, 'utf8'));
	} catch {
		return null;
	}
}
