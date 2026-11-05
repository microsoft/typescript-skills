import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { gitHasHead, isWithin, runGit, skillDirectory } from './workspace.mjs';

// The "contract" is the part of a repository that a change must not quietly
// weaken: package.json scripts, TypeScript compiler strictness and module
// settings, suppression comments, and peer-dependency install overrides.

const strictFamily = [
	'noImplicitAny',
	'strictNullChecks',
	'strictFunctionTypes',
	'strictBindCallApply',
	'strictPropertyInitialization',
	'strictBuiltinIteratorReturn',
	'noImplicitThis',
	'useUnknownInCatchVariables',
	'alwaysStrict',
];
const stricterWhenTrue = [
	'checkJs',
	'noUnusedLocals',
	'noUnusedParameters',
	'noImplicitReturns',
	'noFallthroughCasesInSwitch',
	'noUncheckedIndexedAccess',
	'exactOptionalPropertyTypes',
	'noImplicitOverride',
	'noPropertyAccessFromIndexSignature',
];
const looserWhenTrue = [
	'skipLibCheck',
	'skipDefaultLibCheck',
	'suppressImplicitAnyIndexErrors',
	'suppressExcessPropertyErrors',
	'noStrictGenericChecks',
];
const moduleOptions = ['module', 'moduleResolution'];
const watchedOptions = ['strict', 'allowJs', ...strictFamily, ...stricterWhenTrue, ...looserWhenTrue, ...moduleOptions];
const canonicalOption = new Map(watchedOptions.map(name => [name.toLowerCase(), name]));
const nodeModuleSetting = /^node(16|18|20|next)$/;

const tsconfigName = /^(tsconfig(\..+)?|jsconfig)\.json$/i;
const ignoredDirectory = /(^|\/)(node_modules|dist|build|out|coverage|\.git)\//;
const sourcePathspecs = [
	'*.ts', '*.tsx', '*.mts', '*.cts', '*.js', '*.jsx', '*.mjs', '*.cjs', '*.vue', '*.svelte',
	':(exclude)*.min.js',
	':(exclude)node_modules/*', ':(exclude)*/node_modules/*',
	':(exclude)dist/*', ':(exclude)*/dist/*',
	':(exclude)build/*', ':(exclude)*/build/*',
	':(exclude)coverage/*', ':(exclude)*/coverage/*',
];
const suppressionPatterns = [
	'@ts-(ignore|expect-error|nocheck)',
	'(eslint|oxlint)-disable|biome-ignore',
	':[[:space:]]*any[[:space:]]*([];,)=|&>}[]|$)',
	'(^|[^A-Za-z0-9_$.])as[[:space:]]+any([^A-Za-z0-9_$]|$)',
	'[<,|&][[:space:]]*any[[:space:]]*([];,)=|&>[]|$)',
	'(^|[^A-Za-z0-9_$.])as[[:space:]]+unknown[[:space:]]+as[[:space:]]',
	'declare[[:space:]]+module[[:space:]]+[\'"][^\'"*]+[\'"]',
];
export const suppressionKinds = {
	tsIgnore: '@ts-ignore comments',
	tsExpectError: '@ts-expect-error comments',
	tsNocheck: '@ts-nocheck comments',
	lintDisable: 'lint-disable comments',
	explicitAny: 'explicit `any` annotations/casts',
	doubleAssertion: '`as unknown as` double assertions',
	ambientModule: 'ambient `declare module \'<package>\'` stubs',
};
const suppressionAdvice = {
	doubleAssertion: 'Type the value correctly (a typed helper, a type guard, or a correct interface) instead of '
		+ 'forcing it through unknown.',
	ambientModule: 'These replace a package\'s types with a hand-written stub. Install @types/<package>, build the '
		+ 'workspace package so its declarations exist, or import its types instead. (Augmenting a package from a '
		+ 'file that imports or exports is not counted.) A stub is only acceptable for a package that has no types '
		+ 'at all; then --accept this finding and name the package in the final message.',
};
const declarationFile = /\.d\.[cm]?ts$/;
const topLevelImportOrExport = /^(import|export)[\s{*'"]/m;
const typeScriptFile = /\.(ts|tsx|mts|cts)$/;
const javaScriptFile = /\.(js|jsx|mjs|cjs)$/i;
const nonSourceDirectory = /(^|\/)(node_modules|dist|build|out|coverage|vendor|fixtures?|__fixtures__|__mocks__|public|static)\/|(^|\/)\.[^/]+\//;
const testFile = /(^|\/)(tests?|__tests__|specs?|e2e)\/|\.(test|spec)\.[cm]?jsx?$/i;
const javaScriptConfigFile = /(^|\/)([^/]+\.config\.[cm]?js|\.[^/]+|[Gg]runtfile\.[cm]?js|[Gg]ulpfile\.[cm]?js|[^/]+\.min\.js)$/;
const listedJavaScriptFiles = 50;

export function worktreeSource(gitRoot) {
	return {
		label: 'working tree',
		readText(filePath) {
			return readFileOrNull(filePath);
		},
		listFiles(directory) {
			if (gitRoot) {
				const result = runGit(
					['ls-files', '--cached', '--others', '--exclude-standard', '--full-name', '-z', '--', '.'],
					directory,
				);
				if (result.status === 0) {
					return splitNul(result.stdout)
						.map(file => path.join(gitRoot, file))
						.filter(file => existsSync(file));
				}
			}
			return listDirectoryFiles(directory);
		},
		grep(directory) {
			if (!gitRoot) {
				return null;
			}
			return parseGrep(runGit([
				'grep', '--untracked', '-I', '--full-name', '-o', '-z', '-E',
				...suppressionPatterns.flatMap(pattern => ['-e', pattern]),
				'--', ...sourcePathspecs, ...skillExclusion(directory),
			], directory), '');
		},
	};
}

export function headSource(gitRoot) {
	return {
		label: 'HEAD',
		readText(filePath) {
			if (!isWithin(gitRoot, filePath) || filePath.split(path.sep).includes('node_modules')) {
				return readFileOrNull(filePath);
			}
			const relative = path.relative(gitRoot, filePath).split(path.sep).join('/');
			const result = runGit(['show', `HEAD:${relative}`], gitRoot);
			return result.status === 0 ? result.stdout : null;
		},
		listFiles(directory) {
			const result = runGit(['ls-tree', '-r', '--name-only', '--full-name', '-z', 'HEAD', '--', '.'], directory);
			return result.status === 0
				? splitNul(result.stdout).map(file => path.join(gitRoot, file))
				: [];
		},
		grep(directory) {
			return parseGrep(runGit([
				'grep', '-I', '--full-name', '-o', '-z', '-E',
				...suppressionPatterns.flatMap(pattern => ['-e', pattern]),
				'HEAD', '--', ...sourcePathspecs, ...skillExclusion(directory),
			], directory), 'HEAD:');
		},
	};
}

export function snapshotContract(workspace, source) {
	const { packageDirectory, workspaceRoot } = workspace;
	const directories = [...new Set([workspaceRoot, packageDirectory])];
	const key = file => path.relative(workspaceRoot, file).split(path.sep).join('/');

	const scripts = {};
	const npmrc = {};
	for (const directory of directories) {
		const manifestPath = path.join(directory, 'package.json');
		const manifest = parseJsonOrNull(source.readText(manifestPath));
		if (manifest && isObject(manifest.scripts)) {
			scripts[key(manifestPath)] = Object.fromEntries(Object.entries(manifest.scripts)
				.filter(([, command]) => typeof command === 'string'));
		}
		const npmrcPath = path.join(directory, '.npmrc');
		const npmrcText = source.readText(npmrcPath);
		if (npmrcText !== null) {
			npmrc[key(npmrcPath)] = parseNpmrc(npmrcText);
		}
	}

	const packageFiles = source.listFiles(packageDirectory);
	const packageRelative = file => path.relative(packageDirectory, file).split(path.sep).join('/');
	const tsconfigFiles = new Set(packageFiles.filter(file =>
		tsconfigName.test(path.basename(file))
		&& !ignoredDirectory.test(packageRelative(file))));
	if (workspaceRoot !== packageDirectory) {
		for (const name of listDirectoryNames(workspaceRoot, source)) {
			if (tsconfigName.test(name)) {
				tsconfigFiles.add(path.join(workspaceRoot, name));
			}
		}
	}
	const tsconfigs = {};
	for (const file of [...tsconfigFiles].sort()) {
		const resolved = readTsconfig(file, source, new Set());
		if (resolved) {
			tsconfigs[key(file)] = resolved;
		}
	}

	let suppressions = null;
	const matches = source.grep(packageDirectory);
	if (matches) {
		suppressions = Object.fromEntries(Object.keys(suppressionKinds).map(kind => [kind, { total: 0, files: {} }]));
		const moduleFiles = new Map();
		const isModule = file => {
			if (!moduleFiles.has(file)) {
				const text = workspace.gitRoot ? source.readText(path.join(workspace.gitRoot, file)) : null;
				moduleFiles.set(file, text !== null && topLevelImportOrExport.test(text));
			}
			return moduleFiles.get(file);
		};
		for (const { file, match } of matches) {
			const kind = classifySuppression(file, match);
			// In a module, `declare module 'x'` augments x's real types rather than replacing them.
			if (!kind || (kind === 'ambientModule' && isModule(file))) {
				continue;
			}
			const relative = workspace.gitRoot
				? key(path.join(workspace.gitRoot, file))
				: file;
			suppressions[kind].total++;
			suppressions[kind].files[relative] = (suppressions[kind].files[relative] ?? 0) + 1;
		}
	}

	const packageManifest = parseJsonOrNull(source.readText(path.join(packageDirectory, 'package.json')));
	const typescript = {
		tsconfig: [...tsconfigFiles].some(file =>
			isWithin(packageDirectory, file) && /^tsconfig(\..+)?\.json$/i.test(path.basename(file))),
		dependency: Boolean(packageManifest?.dependencies?.typescript ?? packageManifest?.devDependencies?.typescript),
	};
	const javaScriptFiles = packageFiles
		.filter(file => !isWithin(skillDirectory, file))
		.map(packageRelative)
		.filter(isJavaScriptSource)
		.sort();
	const javaScriptSources = javaScriptFiles.filter(file => !testFile.test(file));
	const javascript = {
		total: javaScriptSources.length,
		files: javaScriptSources.slice(0, listedJavaScriptFiles),
		tests: javaScriptFiles.length - javaScriptSources.length,
	};

	return {
		version: 1,
		package: key(packageDirectory) || '.',
		scripts,
		tsconfigs,
		npmrc,
		suppressions,
		typescript,
		javascript,
	};
}

function isJavaScriptSource(relative) {
	return javaScriptFile.test(relative)
		&& !nonSourceDirectory.test(relative)
		&& !javaScriptConfigFile.test(relative);
}

export function diffContracts(before, after) {
	const findings = [];

	for (const [file, beforeScripts] of Object.entries(before.scripts ?? {})) {
		const afterScripts = after.scripts?.[file] ?? {};
		for (const [name, command] of Object.entries(beforeScripts)) {
			if (!(name in afterScripts)) {
				findings.push({
					id: `script-removed:${file}:${name}`,
					kind: 'script-removed',
					file,
					message: `${file} script "${name}" was removed (was: ${truncate(command, 100)}). `
						+ 'Keep it working by pointing it at the new tool; removing or renaming an existing script is a regression.',
				});
			}
		}
	}

	const previousTsconfigs = Object.entries(before.tsconfigs ?? {})
		.filter(([file]) => !/(^|\/)jsconfig\.json$/i.test(file));
	const strictExpected = previousTsconfigs.length === 0
		|| previousTsconfigs.some(([, entry]) => entry.options?.strict === true);
	for (const [file, current] of Object.entries(after.tsconfigs ?? {})) {
		const previous = before.tsconfigs?.[file];
		if (!current.options || current.solution) {
			continue;
		}
		if (previous?.options) {
			findings.push(...diffCompilerOptions(file, previous.options, current.options));
		} else if (!previous) {
			findings.push(...weakNewCompilerOptions(file, current, strictExpected));
		}
	}

	if (adoptedTypeScript(before, after) && after.javascript?.total > 0) {
		const { total, files, tests = 0 } = after.javascript;
		const shown = files.slice(0, 10).join(', ');
		findings.push({
			id: `js-sources-remaining:${after.package ?? '.'}`,
			kind: 'conversion-incomplete',
			file: null,
			message: `${total} JavaScript source file(s) remain after the package adopted TypeScript: `
				+ `${shown}${total > 10 ? ', …' : ''}. Converting a package means every source file becomes `
				+ '.ts/.tsx and allowJs ends off; do not narrow the request to keep the build green. If a file must '
				+ 'stay JavaScript (a toolchain config, a bin shim that loads the build output), --accept this '
				+ 'finding and name each file and its reason in the final message.'
				+ `${tests > 0 ? ` (${tests} JavaScript test file(s) are not counted; converting them is optional.)` : ''}`,
		});
	}

	for (const [file, current] of Object.entries(after.npmrc ?? {})) {
		const previous = before.npmrc?.[file] ?? {};
		for (const name of ['legacy-peer-deps', 'force']) {
			if (current[name] === 'true' && previous[name] !== 'true') {
				findings.push({
					id: `npmrc:${file}:${name}`,
					kind: 'install-override',
					file,
					message: `${file} sets ${name}=true. Resolve the peer-dependency conflict instead of overriding it.`,
				});
			}
		}
		if (previous['strict-peer-deps'] === 'true' && current['strict-peer-deps'] !== 'true') {
			findings.push({
				id: `npmrc:${file}:strict-peer-deps`,
				kind: 'install-override',
				file,
				message: `${file} no longer sets strict-peer-deps=true.`,
			});
		}
	}

	if (before.suppressions && after.suppressions) {
		for (const [kind, label] of Object.entries(suppressionKinds)) {
			const previous = before.suppressions[kind] ?? { total: 0, files: {} };
			const current = after.suppressions[kind] ?? { total: 0, files: {} };
			if (current.total <= previous.total) {
				continue;
			}
			const increased = Object.entries(current.files)
				.map(([file, count]) => [file, count - (previous.files[file] ?? 0)])
				.filter(([, delta]) => delta > 0)
				.sort((left, right) => right[1] - left[1]);
			const shown = increased.slice(0, 5).map(([file, delta]) => `${file} +${delta}`).join(', ');
			findings.push({
				id: `suppression:${kind}`,
				kind: 'suppression-added',
				file: null,
				message: `${label} increased ${previous.total} → ${current.total}`
					+ `${shown ? ` (${shown}${increased.length > 5 ? ', …' : ''})` : ''}. `
					+ (suppressionAdvice[kind] ?? 'Fix the underlying type or lint error instead.'),
			});
		}
	}
	return findings;
}

/** True when the package had neither a tsconfig nor a typescript dependency before and has one now. */
function adoptedTypeScript(before, after) {
	return Boolean(before?.typescript && after?.typescript
		&& !before.typescript.tsconfig && !before.typescript.dependency
		&& (after.typescript.tsconfig || after.typescript.dependency));
}

function diffCompilerOptions(file, before, after) {
	const findings = [];
	const push = (option, detail) => findings.push({
		id: `compiler-option:${file}:${option}`,
		kind: 'compiler-option-loosened',
		file,
		message: `${file}: ${detail}`,
	});

	if (before.strict === true && after.strict !== true) {
		push('strict', `strict changed true → ${show(after.strict)}.`);
	}
	for (const option of strictFamily) {
		const effectiveBefore = before[option] ?? before.strict;
		if (after[option] === false && effectiveBefore !== false) {
			push(option, `${option} disabled (was ${show(effectiveBefore)}).`);
		} else if (before[option] === true && after[option] === undefined && after.strict !== true) {
			push(option, `${option} removed (was true) and strict is not enabled.`);
		}
	}
	for (const option of stricterWhenTrue) {
		if (before[option] === true && after[option] !== true) {
			push(option, `${option} changed true → ${show(after[option])}.`);
		}
	}
	for (const option of looserWhenTrue) {
		if (before[option] !== true && after[option] === true) {
			push(option, `${option} enabled (was ${show(before[option])}).`);
		}
	}
	if (before.allowJs !== true && after.allowJs === true && after.checkJs !== true) {
		push('allowJs', uncheckedJavaScript('enables'));
	}
	const moduleChanges = moduleOptions.filter(option =>
		nodeModuleSetting.test(normalizeSetting(before[option]))
		&& !nodeModuleSetting.test(normalizeSetting(after[option])));
	moduleChanges.forEach((option, index) => {
		const detail = `${option} changed ${normalizeSetting(before[option])} → ${normalizeSetting(after[option]) || 'unset'}.`;
		push(option, index < moduleChanges.length - 1
			? detail
			: `${detail} Code that Node runs directly needs node16/nodenext; use bundler only when a bundler `
				+ 'consumes the output. Fix the import errors instead.');
	});
	return findings;
}

function weakNewCompilerOptions(file, entry, strictExpected) {
	const { options } = entry;
	const findings = [];
	const push = (option, detail) => findings.push({
		id: `compiler-option:${file}:${option}`,
		kind: 'compiler-option-loosened',
		file,
		message: `new ${file}: ${detail}`,
	});
	if (options.strict === false) {
		push('strict', 'sets strict: false. Start new configs from strict: true.');
	} else if (options.strict !== true && strictExpected && !entry.unresolvedExtends) {
		push('strict', 'does not enable strict (TypeScript defaults it to false). Set "strict": true and fix '
			+ 'the errors.');
	}
	for (const option of strictFamily) {
		if (options[option] === false) {
			push(option, `sets ${option}: false.`);
		}
	}
	for (const option of looserWhenTrue) {
		if (options[option] === true) {
			push(option, `sets ${option}: true.`);
		}
	}
	if (options.allowJs === true && options.checkJs !== true) {
		push('allowJs', uncheckedJavaScript('sets'));
	}
	return findings;
}

function uncheckedJavaScript(verb) {
	return `${verb} allowJs without checkJs, so JavaScript sources are compiled unchecked (checkJs defaults `
		+ 'to false; removing "checkJs": false changes nothing). Convert the JavaScript files to TypeScript and '
		+ 'turn allowJs off.';
}

function readTsconfig(filePath, source, seen) {
	if (seen.has(filePath) || seen.size > 16) {
		return { options: {} };
	}
	seen.add(filePath);
	const text = source.readText(filePath);
	if (text === null) {
		return null;
	}
	let json;
	try {
		json = parseJsonc(text);
	} catch {
		return { parseError: true };
	}
	if (!isObject(json)) {
		return { parseError: true };
	}
	let options = {};
	let unresolvedExtends = false;
	const parents = typeof json.extends === 'string'
		? [json.extends]
		: Array.isArray(json.extends) ? json.extends.filter(entry => typeof entry === 'string') : [];
	for (const parent of parents) {
		const parentPath = resolveExtends(parent, path.dirname(filePath), source);
		const resolved = parentPath ? readTsconfig(parentPath, source, seen) : null;
		if (resolved?.options) {
			options = { ...options, ...resolved.options };
		}
		if (!resolved?.options || resolved.unresolvedExtends) {
			unresolvedExtends = true;
		}
	}
	const solution = Array.isArray(json.files) && json.files.length === 0 && Array.isArray(json.references);
	return {
		options: { ...options, ...pickWatchedOptions(json.compilerOptions) },
		...(unresolvedExtends ? { unresolvedExtends } : {}),
		...(solution ? { solution } : {}),
	};
}

function pickWatchedOptions(compilerOptions) {
	if (!isObject(compilerOptions)) {
		return {};
	}
	const picked = {};
	for (const [name, value] of Object.entries(compilerOptions)) {
		const canonical = canonicalOption.get(name.toLowerCase());
		if (canonical) {
			picked[canonical] = typeof value === 'string' ? value.toLowerCase() : value;
		}
	}
	return picked;
}

function resolveExtends(specifier, directory, source) {
	const candidatesFor = base => base.endsWith('.json')
		? [base]
		: [base, `${base}.json`, path.join(base, 'tsconfig.json')];
	if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
		return candidatesFor(path.resolve(directory, specifier))
			.find(candidate => source.readText(candidate) !== null) ?? null;
	}
	let current = directory;
	while (true) {
		for (const candidate of candidatesFor(path.join(current, 'node_modules', specifier))) {
			if (isFile(candidate)) {
				return candidate;
			}
		}
		const parent = path.dirname(current);
		if (parent === current) {
			return null;
		}
		current = parent;
	}
}

function skillExclusion(directory) {
	if (directory === skillDirectory || !isWithin(directory, skillDirectory)) {
		return [];
	}
	return [`:(exclude)${path.relative(directory, skillDirectory).split(path.sep).join('/')}/*`];
}

function classifySuppression(file, match) {
	if (/^declare\s+module\s/.test(match)) {
		return typeScriptFile.test(file) && !/^declare\s+module\s+['"]\./.test(match) ? 'ambientModule' : null;
	}
	if (declarationFile.test(file)) {
		return null;
	}
	if (/as\s+unknown\s+as\s/.test(match)) {
		return typeScriptFile.test(file) ? 'doubleAssertion' : null;
	}
	if (match.includes('@ts-ignore')) {
		return 'tsIgnore';
	}
	if (match.includes('@ts-expect-error')) {
		return 'tsExpectError';
	}
	if (match.includes('@ts-nocheck')) {
		return 'tsNocheck';
	}
	if (/(eslint|oxlint)-disable|biome-ignore/.test(match)) {
		return 'lintDisable';
	}
	return typeScriptFile.test(file) ? 'explicitAny' : null;
}

function parseGrep(result, prefix) {
	if (result.status === 1) {
		return [];
	}
	if (result.status !== 0) {
		return null;
	}
	const matches = [];
	for (const line of result.stdout.split('\n')) {
		const separator = line.indexOf('\0');
		if (separator < 0) {
			continue;
		}
		let file = line.slice(0, separator);
		if (prefix && file.startsWith(prefix)) {
			file = file.slice(prefix.length);
		}
		matches.push({ file, match: line.slice(separator + 1) });
	}
	return matches;
}

/** Parses JSON with comments and trailing commas, as tsconfig.json allows. */
export function parseJsonc(text) {
	let output = '';
	let index = 0;
	while (index < text.length) {
		const character = text[index];
		if (character === '"') {
			let end = index + 1;
			while (end < text.length && text[end] !== '"') {
				end += text[end] === '\\' ? 2 : 1;
			}
			output += text.slice(index, end + 1);
			index = end + 1;
		} else if (character === '/' && text[index + 1] === '/') {
			while (index < text.length && text[index] !== '\n') {
				index++;
			}
		} else if (character === '/' && text[index + 1] === '*') {
			const end = text.indexOf('*/', index + 2);
			index = end < 0 ? text.length : end + 2;
		} else if (character === ',') {
			let next = index + 1;
			while (next < text.length && /\s/.test(text[next])) {
				next++;
			}
			if (text[next] !== '}' && text[next] !== ']') {
				output += character;
			}
			index++;
		} else {
			output += character;
			index++;
		}
	}
	return JSON.parse(output.replace(/^\uFEFF/, ''));
}

function parseNpmrc(text) {
	const values = {};
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#') || line.startsWith(';')) {
			continue;
		}
		const separator = line.indexOf('=');
		if (separator > 0) {
			values[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim().toLowerCase();
		}
	}
	return values;
}

function listDirectoryNames(directory, source) {
	return source.listFiles(directory)
		.filter(file => path.dirname(file) === directory)
		.map(file => path.basename(file));
}

function listDirectoryFiles(directory) {
	try {
		return readdirSync(directory, { withFileTypes: true })
			.filter(entry => entry.isFile())
			.map(entry => path.join(directory, entry.name));
	} catch {
		return [];
	}
}

function readFileOrNull(filePath) {
	try {
		return readFileSync(filePath, 'utf8');
	} catch {
		return null;
	}
}

function parseJsonOrNull(text) {
	if (text === null) {
		return null;
	}
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function isFile(filePath) {
	try {
		return statSync(filePath).isFile();
	} catch {
		return false;
	}
}

function splitNul(text) {
	return text.split('\0').filter(Boolean);
}

function normalizeSetting(value) {
	return typeof value === 'string' ? value.toLowerCase() : '';
}

function show(value) {
	return value === undefined ? 'unset' : JSON.stringify(value);
}

function truncate(text, length) {
	return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}

function isObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Compares the current working tree with a reference contract: the baseline
 * snapshot in compare mode, or HEAD in standalone mode.
 */
export function evaluateContract({ workspace, mode, baselineSnapshot = null, accept = [] }) {
	const current = snapshotContract(workspace, worktreeSource(workspace.gitRoot));
	if (mode === 'baseline') {
		return { reference: null, snapshot: current, findings: [], regressions: 0, accepted: 0 };
	}
	let reference = null;
	let referenceSnapshot = null;
	if (mode === 'compare' && baselineSnapshot) {
		reference = 'baseline';
		referenceSnapshot = baselineSnapshot;
	} else if (workspace.gitRoot && gitHasHead(workspace.packageDirectory)) {
		reference = 'HEAD';
		referenceSnapshot = snapshotContract(workspace, headSource(workspace.gitRoot));
	}
	if (!referenceSnapshot) {
		return {
			reference: null,
			unavailableReason: 'no baseline snapshot and no git HEAD to compare against',
			findings: [],
			regressions: 0,
			accepted: 0,
		};
	}
	const acceptedIds = new Set(accept);
	const findings = diffContracts(referenceSnapshot, current)
		.map(finding => ({ ...finding, accepted: acceptedIds.has(finding.id) }));
	const matched = new Set(findings.map(finding => finding.id));
	return {
		reference,
		findings,
		typescriptAdopted: adoptedTypeScript(referenceSnapshot, current),
		regressions: findings.filter(finding => !finding.accepted).length,
		accepted: findings.filter(finding => finding.accepted).length,
		unmatchedAccepts: accept.filter(id => !matched.has(id)),
	};
}
