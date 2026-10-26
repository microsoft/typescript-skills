/* eslint-disable */
// Part of the typescript-build-references skill, not of the repository it runs in.
// Structural lint for a TypeScript project-reference (tsc -b) graph in a repo or workspace.
// Uses only Node built-ins, git, and the repository's own installed `typescript`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const usage = `Usage: node check-reference-graph.mjs [options]

Run from the repository root. Checks the tsc -b project graph:
  * which root package.json script reaches "tsc -b", and which configs it builds
  * projects that include files from another package, or set rootDir above their package
  * each package's original library files (tracked in git at --base) that none of its projects include
  * library projects that are not composite or do not enable isolatedDeclarations
  * missing direct "references" (from package.json dependencies and from imports)

Options:
  -p, --project <tsconfig>  Entry config(s) to check (repeatable). Default: the configs that the root
                            build/typecheck scripts pass to "tsc -b".
  --base <git-ref>          Commit whose tracked files are the original inputs (default: HEAD).
  --root <dir>              Repository root (default: current directory).
  --json                    Print a JSON report.
  -h, --help                Show this help.

Exit code is 1 when any ERROR is reported. This is a structural lint: it does not replace
running the repo's real build, typecheck, and tests.`;

const tsExtension = /\.(?:[cm]?ts|tsx)$/;
const declarationFile = /\.d\.(?:[cm]?ts|[^/]*\.ts)$/;
// Paths (relative to a package) that are tests, demos, tooling, or output rather than library source.
const nonLibrary =
	/(?:^|\/)(?:tests?|__tests__|__mocks__|__fixtures__|fixtures?|test[-_]?(?:[Uu]tils?|[Hh]elpers?)|demos?|playground|scripts|dist|coverage|node_modules)(?:\/|$)|(?:^|\/)[^/]*\.config(?:\.[^/]+)*\.[cm]?[jt]sx?$|(?:^|\/)test-setup\.|\.(?:test|spec|bench|stories)\.[cm]?tsx?$/;
const entryScripts = ['build', 'compile', 'typecheck', 'type-check', 'types:check', 'check-types', 'tsc'];
const dependencySections = ['dependencies', 'peerDependencies', 'optionalDependencies'];

function fatal(message) {
	console.error(`check-reference-graph: ${message}`);
	process.exit(2);
}

function parseArgs(argv) {
	const options = { projects: [], base: 'HEAD', root: process.cwd(), json: false };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const value = () => {
			if (i + 1 >= argv.length) {
				fatal(`${arg} needs a value`);
			}
			return argv[++i];
		};
		if (arg === '-p' || arg === '--project') {
			options.projects.push(value());
		} else if (arg === '--base') {
			options.base = value();
		} else if (arg === '--root') {
			options.root = value();
		} else if (arg === '--json') {
			options.json = true;
		} else if (arg === '-h' || arg === '--help') {
			console.log(usage);
			process.exit(0);
		} else if (!arg.startsWith('-')) {
			options.projects.push(arg);
		} else {
			fatal(`unknown option ${arg}\n\n${usage}`);
		}
	}
	options.root = path.resolve(options.root);
	return options;
}

const toPosix = p => p.split(path.sep).join('/');

function readJson(file) {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch {
		return undefined;
	}
}

function loadTypeScript(root) {
	try {
		return createRequire(path.join(root, 'package.json'))('typescript');
	} catch (error) {
		fatal(`cannot load the repository's "typescript" package from ${root} (${error.message}). Run the repo's frozen install first.`);
	}
}

function configPath(root, p) {
	const abs = path.resolve(root, p);
	return fs.existsSync(abs) && fs.statSync(abs).isDirectory() ? path.join(abs, 'tsconfig.json') : abs;
}

function globToRegExp(glob) {
	let source = '';
	const g = glob.replace(/^\.\//, '').replace(/\/+$/, '');
	for (let i = 0; i < g.length; i++) {
		const c = g[i];
		if (c === '*' && g[i + 1] === '*') {
			source += '.*';
			i++;
			if (g[i + 1] === '/') {
				source += '(?:/|$)';
				i++;
			}
		} else if (c === '*') {
			source += '[^/]*';
		} else if (c === '?') {
			source += '[^/]';
		} else {
			source += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
		}
	}
	return new RegExp(`^${source}$`);
}

function workspaceGlobs(root, manifest) {
	const globs = [];
	const ws = manifest?.workspaces;
	if (Array.isArray(ws)) {
		globs.push(...ws);
	} else if (Array.isArray(ws?.packages)) {
		globs.push(...ws.packages);
	}
	const pnpm = path.join(root, 'pnpm-workspace.yaml');
	if (fs.existsSync(pnpm)) {
		let inPackages = false;
		const unquote = s => s.trim().replace(/^['"]|['"]$/g, '');
		for (const line of fs.readFileSync(pnpm, 'utf8').split(/\r?\n/)) {
			if (/^packages\s*:/.test(line)) {
				const inline = /\[(.*)\]/.exec(line);
				if (inline) {
					globs.push(...inline[1].split(',').map(unquote).filter(Boolean));
				} else {
					inPackages = true;
				}
				continue;
			}
			if (inPackages) {
				const item = /^\s*-\s*(.+?)\s*(?:#.*)?$/.exec(line);
				if (item) {
					globs.push(unquote(item[1]));
				} else if (/^\S/.test(line)) {
					inPackages = false;
				}
			}
		}
	}
	const lerna = readJson(path.join(root, 'lerna.json'));
	if (Array.isArray(lerna?.packages)) {
		globs.push(...lerna.packages);
	}
	return globs;
}

function splitCommands(script) {
	const segments = [];
	let quote = '';
	let start = 0;
	for (let i = 0; i < script.length; i++) {
		const c = script[i];
		if (quote) {
			if (c === quote) {
				quote = '';
			}
			continue;
		}
		if (c === '"' || c === "'") {
			quote = c;
		} else if (c === ';' || c === '\n' || ((c === '&' || c === '|') && script[i + 1] === c)) {
			segments.push(script.slice(start, i));
			if (c === '&' || c === '|') {
				i++;
			}
			start = i + 1;
		}
	}
	segments.push(script.slice(start));
	return segments.map(s => s.trim()).filter(Boolean);
}

function tokenize(command) {
	return (command.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(t => t.replace(/^["']|["']$/g, ''));
}

function walk(root, skip = []) {
	const out = [];
	const visit = dir => {
		for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
			const relPath = dir ? `${dir}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				if (!['node_modules', '.git'].includes(entry.name) && !skip.includes(relPath)) {
					visit(relPath);
				}
			} else if (entry.isFile()) {
				out.push(relPath);
			}
		}
	};
	visit('');
	return out;
}

function main() {
	const options = parseArgs(process.argv.slice(2));
	const root = options.root;
	const ts = loadTypeScript(root);
	const errors = [];
	const warnings = [];
	const info = [];
	const rel = abs => toPosix(path.relative(root, abs)) || '.';
	const insideRoot = abs => {
		const r = path.relative(root, abs);
		return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
	};

	// Files tracked at the base commit are the "original inputs".
	let tracked;
	try {
		tracked = execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', options.base], {
			cwd: root,
			encoding: 'utf8',
			maxBuffer: 512 * 1024 * 1024,
			stdio: ['ignore', 'pipe', 'pipe'],
		})
			.split('\0')
			.filter(Boolean);
	} catch {
		warnings.push(`Could not list files tracked at "${options.base}" with git; original inputs are taken from the working tree instead.`);
	}

	// Packages: the root manifest plus workspace packages.
	const rootManifest = readJson(path.join(root, 'package.json'));
	const manifestPaths = (tracked ?? walk(root)).filter(f => /(?:^|\/)package\.json$/.test(f) && !f.includes('node_modules/'));
	const globs = workspaceGlobs(root, rootManifest);
	const includeGlobs = globs.filter(g => !g.startsWith('!')).map(globToRegExp);
	const excludeGlobs = globs.filter(g => g.startsWith('!')).map(g => globToRegExp(g.slice(1)));
	const packages = [];
	for (const manifestPath of manifestPaths) {
		const dir = path.posix.dirname(manifestPath) === '.' ? '' : path.posix.dirname(manifestPath);
		if (dir !== '') {
			const isWorkspace = includeGlobs.length > 0
				? includeGlobs.some(r => r.test(dir)) && !excludeGlobs.some(r => r.test(dir))
				: !nonLibrary.test(`${dir}/`);
			if (!isWorkspace) {
				continue;
			}
		}
		const manifest = readJson(path.join(root, manifestPath));
		if (manifest) {
			packages.push({ dir, name: typeof manifest.name === 'string' ? manifest.name : dir || '(root)', manifest });
		}
	}
	if (!packages.some(p => p.dir === '')) {
		packages.push({ dir: '', name: '(root)', manifest: rootManifest ?? {} });
	}
	packages.sort((a, b) => b.dir.length - a.dir.length);
	const byName = new Map(packages.filter(p => p.manifest?.name).map(p => [p.manifest.name, p]));
	const packageOf = relFile => packages.find(p => p.dir === '' || relFile === p.dir || relFile.startsWith(`${p.dir}/`));
	const label = p => (p.dir ? `${p.name} (${p.dir})` : 'the root package');

	// Build entry points: root scripts that reach `tsc -b`.
	const entries = new Map();
	const findBuildCommands = (scripts, name, chain, seen) => {
		if (seen.has(name) || typeof scripts[name] !== 'string') {
			return;
		}
		seen.add(name);
		for (const command of splitCommands(scripts[name])) {
			const tokens = tokenize(command);
			while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0] ?? '') || tokens[0] === 'cross-env') {
				tokens.shift();
			}
			const tool = tokens[0];
			if (['npm', 'pnpm', 'yarn', 'bun', 'nr'].includes(tool)) {
				const index = tool !== 'nr' && tokens[1] === 'run' ? 2 : 1;
				if (typeof scripts[tokens[index]] === 'string') {
					findBuildCommands(scripts, tokens[index], [...chain, tokens[index]], seen);
					continue;
				}
				tokens.splice(0, tokens[1] === 'exec' ? 2 : 1);
			} else if (['run-s', 'run-p', 'npm-run-all'].includes(tool)) {
				for (const t of tokens.slice(1).filter(t => !t.startsWith('-'))) {
					findBuildCommands(scripts, t, [...chain, t], seen);
				}
				continue;
			} else if (tool === 'npx' || tool === 'bunx') {
				tokens.shift();
				while (tokens[0]?.startsWith('-')) {
					tokens.shift();
				}
			}
			if (/(?:^|\/)(?:tsc|vue-tsc|tsgo)$/.test(tokens[0] ?? '') && (tokens[1] === '-b' || tokens[1] === '--build')) {
				const parsed = ts.parseBuildCommand(tokens.slice(1));
				const bo = parsed.buildOptions;
				if (bo.clean || bo.dry || bo.watch || bo.force) {
					warnings.push(`Script "${chain.join('" -> "')}" runs "${command}", which is not a normal incremental build.`);
				}
				for (const p of parsed.projects.length ? parsed.projects : ['.']) {
					const file = configPath(root, p);
					if (!entries.has(file)) {
						entries.set(file, `root script "${chain.join('" -> "')}": ${command}`);
					}
				}
			}
		}
	};
	const rootScripts = rootManifest?.scripts ?? {};
	for (const name of entryScripts) {
		findBuildCommands(rootScripts, name, [name], new Set());
	}
	for (const [file, how] of entries) {
		info.push(`Build entry ${rel(file)} is reached from ${how}`);
	}
	if (entries.size === 0) {
		const packageEntries = packages
			.filter(p => p.dir !== '')
			.flatMap(p => Object.entries(p.manifest.scripts ?? {})
				.filter(([, s]) => /\b(?:tsc|vue-tsc|tsgo)\s+(?:-b|--build)\b/.test(String(s)))
				.map(([n]) => `${p.dir}#${n}`));
		const where = entryScripts.map(s => `"${s}"`).join(', ');
		if (packageEntries.length > 0) {
			warnings.push(`No root ${where} script runs "tsc -b" directly. Package scripts do (${packageEntries.slice(0, 10).join(', ')}); make sure the root build/typecheck actually runs them, or call "tsc -b <solution>" from the root build or typecheck script.`);
		} else {
			errors.push(`No root ${where} script reaches "tsc -b"/"tsc --build". Wire the solution build into the existing root build or typecheck script.`);
		}
	}
	for (const p of options.projects) {
		const file = configPath(root, p);
		if (!entries.has(file)) {
			entries.set(file, 'command line');
		}
	}
	if (entries.size === 0) {
		return finish(options, { errors, warnings, info });
	}

	// Walk the reference graph.
	const projects = new Map();
	const flatten = d => ts.flattenDiagnosticMessageText(d.messageText, '\n');
	const visiting = new Set();
	const visit = (file, from) => {
		if (visiting.has(file)) {
			errors.push(`Reference cycle through ${rel(file)}`);
			return;
		}
		if (projects.has(file)) {
			return;
		}
		const where = from ? rel(from) : 'Entry';
		if (!insideRoot(file)) {
			errors.push(`${where}: references ${file}, which is outside the repository`);
			return;
		}
		if (!fs.existsSync(file)) {
			errors.push(`${where}: referenced config ${rel(file)} does not exist`);
			return;
		}
		const unrecoverable = [];
		const parsed = ts.getParsedCommandLineOfConfigFile(file, undefined, {
			...ts.sys,
			onUnRecoverableConfigFileDiagnostic: d => unrecoverable.push(d),
		});
		if (!parsed) {
			errors.push(`${rel(file)}: ${unrecoverable.map(flatten).join('; ') || 'cannot be parsed'}`);
			return;
		}
		for (const d of [...unrecoverable, ...parsed.errors]) {
			errors.push(`${rel(file)}: TS${d.code} ${flatten(d)}`);
		}
		const relFile = rel(file);
		const files = parsed.fileNames.map(f => path.resolve(f)).filter(f => !f.split(path.sep).includes('node_modules'));
		const refs = (parsed.projectReferences ?? []).map(r => path.resolve(ts.resolveProjectReferencePath(r)));
		projects.set(file, { file, rel: relFile, dir: path.dirname(file), pkg: packageOf(relFile), parsed, files, refs });
		visiting.add(file);
		for (const ref of refs) {
			visit(ref, file);
		}
		visiting.delete(file);
	};
	for (const file of entries.keys()) {
		visit(file);
	}
	const emits = p => p.parsed.options.composite === true && p.parsed.options.noEmit !== true;
	const isRootSolution = p => p.dir === root && !emits(p) && p.refs.length > 0;

	// Package boundaries.
	for (const p of projects.values()) {
		const foreign = new Map();
		for (const f of p.files) {
			if (!insideRoot(f)) {
				errors.push(`${p.rel}: includes ${f}, which is outside the repository`);
				continue;
			}
			const owner = packageOf(rel(f));
			if (owner !== p.pkg && !declarationFile.test(f)) {
				foreign.set(owner, [...(foreign.get(owner) ?? []), rel(f)]);
			}
		}
		for (const [owner, files] of foreign) {
			const message = `${p.rel}: includes ${files.length} file(s) from ${label(owner)}, e.g. ${files.slice(0, 3).join(', ')}. Keep each package's files in that package's own project and add a "references" entry instead.`;
			if (emits(p) || p.pkg.dir !== '') {
				errors.push(message);
			} else {
				warnings.push(`${message} (A non-emitting root project is fine only if it is the repo's pre-existing broad checker.)`);
			}
		}
		const rootDir = p.parsed.options.rootDir;
		if (rootDir && p.pkg.dir !== '') {
			const fromPkg = path.relative(path.join(root, p.pkg.dir), path.resolve(rootDir));
			if (fromPkg.startsWith('..') || path.isAbsolute(fromPkg)) {
				errors.push(`${p.rel}: rootDir ${rel(path.resolve(rootDir))} is outside its package directory ${p.pkg.dir}. Never set rootDir above the package.`);
			}
		}
	}

	// Original library inputs of each in-scope package.
	const outputDirs = [...projects.values()].flatMap(p =>
		[p.parsed.options.outDir, p.parsed.options.declarationDir].filter(Boolean).map(d => rel(path.resolve(d))));
	const candidates = (tracked ?? walk(root, outputDirs)).filter(f => tsExtension.test(f) && !f.includes('node_modules/'));
	const libraryFiles = new Map();
	for (const f of candidates) {
		const owner = packageOf(f);
		if (!nonLibrary.test(owner.dir ? f.slice(owner.dir.length + 1) : f)) {
			libraryFiles.set(owner, [...(libraryFiles.get(owner) ?? []), f]);
		}
	}
	const projectsOf = new Map();
	const includedBy = new Map();
	for (const p of projects.values()) {
		projectsOf.set(p.pkg, [...(projectsOf.get(p.pkg) ?? []), p]);
		for (const f of p.files) {
			includedBy.set(rel(f), [...(includedBy.get(rel(f)) ?? []), p]);
		}
	}
	const version = ts.version.split('.').map(Number);
	const supportsIsolated = version[0] > 5 || (version[0] === 5 && version[1] >= 5);
	const libraryOwners = new Map();
	const inScope = new Set();
	for (const [pkg, files] of libraryFiles) {
		const own = (projectsOf.get(pkg) ?? []).filter(p => p.files.length > 0 && !isRootSolution(p));
		if (own.length === 0 && !files.some(f => includedBy.has(f))) {
			continue;
		}
		if (pkg.dir === '' && packages.length > 1 && own.every(p => !emits(p))) {
			continue;
		}
		inScope.add(pkg);
		const fileSet = new Set(files);
		const owners = own.filter(p => p.files.some(f => fileSet.has(rel(f))));
		libraryOwners.set(pkg, owners);
		const covered = new Set(owners.flatMap(p => p.files.map(rel)));
		const missing = files.filter(f => !covered.has(f) || !fs.existsSync(path.join(root, f)));
		info.push(`${label(pkg)}: ${files.length} library input(s) tracked at ${options.base}; ${missing.length} not included by its own projects`);
		if (owners.length === 0) {
			errors.push(`${label(pkg)}: no project in the graph owns this package's library files. Give it its own emission project inside the package and reference it.`);
			continue;
		}
		if (missing.length > 0) {
			const details = missing.slice(0, 20).map(f => {
				if (!fs.existsSync(path.join(root, f))) {
					return `${f} (deleted)`;
				}
				const elsewhere = includedBy.get(f);
				return elsewhere ? `${f} (included by ${elsewhere.map(p => p.rel).join(', ')} instead)` : f;
			});
			const tsOnlyGlobs = owners.some(p => Array.isArray(p.parsed.raw?.include) && p.parsed.raw.include.every(s => /\.ts$/.test(s)));
			const hint = missing.some(f => /\.(?:mts|cts|tsx)$/.test(f)) && tsOnlyGlobs
				? ' Note: "**/*.ts" does not match .mts/.cts/.tsx files; use directory includes such as ["src"].'
				: '';
			errors.push(`${label(pkg)}: ${missing.length} original library input(s) are not included by the package's own project(s) (${owners.map(p => p.rel).join(', ')}): ${details.join(', ')}${missing.length > 20 ? ', ...' : ''}. Include them; don't move or exclude package sources to reduce errors.${hint}`);
		}
		for (const p of owners) {
			if (!emits(p)) {
				errors.push(`${p.rel}: includes library files of ${label(pkg)} but is not a composite, declaration-emitting project. Library sources belong in a composite project; test/tooling projects should reference it instead of including its sources.`);
			} else if (supportsIsolated && p.parsed.options.isolatedDeclarations !== true) {
				warnings.push(`${p.rel}: isolatedDeclarations is not enabled.`);
			}
		}
	}
	for (const pkg of packages) {
		if (pkg.dir === '' || inScope.has(pkg) || !libraryFiles.has(pkg)) {
			continue;
		}
		const configs = (tracked ?? walk(root)).filter(f => packageOf(f) === pkg && /(?:^|\/)tsconfig[^/]*\.json$/.test(f));
		if (configs.length > 0) {
			warnings.push(`${label(pkg)} has TypeScript sources and ${configs.slice(0, 3).join(', ')}, but no project in the build graph covers it. Fine only if it is out of scope for this task.`);
		}
	}

	// Direct references: manifest dependencies and imports.
	const warned = new Set();
	for (const p of projects.values()) {
		const needed = new Map();
		if ((libraryOwners.get(p.pkg) ?? []).includes(p)) {
			for (const section of dependencySections) {
				for (const name of Object.keys(p.pkg.manifest?.[section] ?? {})) {
					const dep = byName.get(name);
					if (dep && dep !== p.pkg && !needed.has(dep)) {
						needed.set(dep, `${section} in ${p.pkg.dir ? `${p.pkg.dir}/` : ''}package.json`);
					}
				}
			}
		}
		for (const f of p.files) {
			if (packageOf(rel(f)) !== p.pkg) {
				continue;
			}
			let text;
			try {
				text = fs.readFileSync(f, 'utf8');
			} catch {
				continue;
			}
			for (const { fileName: spec } of ts.preProcessFile(text, true, true).importedFiles) {
				let dep;
				if (spec.startsWith('.')) {
					const target = path.resolve(path.dirname(f), spec);
					dep = insideRoot(target) ? packageOf(rel(target)) : undefined;
				} else {
					const parts = spec.split('/');
					dep = byName.get(spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]);
				}
				if (dep && dep !== p.pkg && !needed.has(dep)) {
					needed.set(dep, `import "${spec}" in ${rel(f)}`);
				}
			}
		}
		for (const [dep, reason] of needed) {
			const owners = libraryOwners.get(dep) ?? [];
			const targets = owners.length ? owners : (projectsOf.get(dep) ?? []).filter(t => t.files.length > 0);
			if (targets.length === 0) {
				if (libraryFiles.has(dep) && dep.dir !== '' && !warned.has(dep)) {
					warned.add(dep);
					warnings.push(`${p.rel} depends on ${label(dep)} (${reason}), which has no project in the build graph. Fine only if that package is out of scope or has no TypeScript sources.`);
				}
				continue;
			}
			if (!targets.some(t => p.refs.includes(t.file))) {
				const suggestion = toPosix(path.relative(p.dir, targets[0].file)).replace(/^(?!\.)/, './');
				errors.push(`${p.rel}: missing direct reference to ${label(dep)} (${reason}). Add { "path": "${suggestion}" } to "references".`);
			}
		}
	}

	info.push(`${projects.size} project(s) reachable from ${[...entries.keys()].map(rel).join(', ')}; ${inScope.size} package(s) checked`);
	return finish(options, { errors, warnings, info });
}

function finish(options, report) {
	if (options.json) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		for (const line of report.info) {
			console.log(`INFO  ${line}`);
		}
		for (const line of report.warnings) {
			console.log(`WARN  ${line}`);
		}
		for (const line of report.errors) {
			console.log(`ERROR ${line}`);
		}
		console.log(`\n${report.errors.length} error(s), ${report.warnings.length} warning(s).${report.errors.length ? ' Fix the graph (not by moving or excluding sources) and run this again.' : ''}`);
	}
	process.exitCode = report.errors.length ? 1 : 0;
}

main();
