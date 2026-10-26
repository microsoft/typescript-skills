/* eslint-disable */
// Part of the typescript-build-references skill, not of the repository it runs in.
// Applies TypeScript's "Add all missing type annotations" quick fix (fixMissingTypeAnnotationOnExports)
// to every file of a project. Uses only Node built-ins and the repository's own installed `typescript`.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const usage = `Usage: node add-missing-annotations.mjs -p <tsconfig.json> [-p <tsconfig.json> ...] [options]

For each project, analyzes its files with isolatedDeclarations and declaration enabled (even if the
tsconfig does not enable them yet), applies TypeScript's own "Add all missing type annotations" fix
(the types the compiler infers, i.e. what it would emit in .d.ts), repeats until nothing changes,
then prints the isolatedDeclarations errors that remain (fix those by hand) and the inserted
annotations worth reviewing (containing "any", import("...") types, {} type arguments, or very
long types). A file whose edits would introduce a syntax error is restored and reported.
Requires the repository's TypeScript >= 5.5. Run projects in dependency order.

Exit code: 0 when every fix applied cleanly (remaining errors are listed, not failures),
1 when a fix failed or was rolled back, 2 for usage or setup errors.

Options:
  -p, --project <tsconfig>  Project to fix (repeatable; a directory means <dir>/tsconfig.json).
  --dry-run                 Report what would change without writing files.
  --max-passes <n>          Maximum fix passes per project (default 5).
  -h, --help                Show this help.`;

// TS9007-TS9039 are the isolatedDeclarations diagnostics that the fix handles.
const isIsolatedDeclarationsError = d => d.code >= 9007 && d.code <= 9039;
const fixable = /\.(?:[cm]?ts|tsx)$/;
const declarationFile = /\.d\.(?:[cm]?ts|[^/]*\.ts)$/;

function fatal(message) {
	console.error(`add-missing-annotations: ${message}`);
	process.exit(2);
}

function parseArgs(argv) {
	const options = { projects: [], dryRun: false, maxPasses: 5 };
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
		} else if (arg === '--dry-run') {
			options.dryRun = true;
		} else if (arg === '--max-passes') {
			options.maxPasses = Number(value());
			if (!Number.isInteger(options.maxPasses) || options.maxPasses < 1) {
				fatal('--max-passes needs a positive integer');
			}
		} else if (arg === '-h' || arg === '--help') {
			console.log(usage);
			process.exit(0);
		} else if (!arg.startsWith('-')) {
			options.projects.push(arg);
		} else {
			fatal(`unknown option ${arg}\n\n${usage}`);
		}
	}
	if (options.projects.length === 0) {
		fatal(`no project given\n\n${usage}`);
	}
	return options;
}

function loadTypeScript(fromDir) {
	let ts;
	try {
		ts = createRequire(path.join(fromDir, 'package.json'))('typescript');
	} catch (error) {
		fatal(`cannot load the repository's "typescript" package from ${fromDir} (${error.message}). Run the repo's frozen install first.`);
	}
	const [major, minor] = ts.version.split('.').map(Number);
	if (major < 5 || (major === 5 && minor < 5)) {
		fatal(`TypeScript ${ts.version} has no isolatedDeclarations support (needs 5.5+).`);
	}
	if (typeof ts.createLanguageService !== 'function') {
		fatal(`TypeScript ${ts.version} does not expose the language service API this script needs.`);
	}
	return ts;
}

function formatSettings(ts, text) {
	const newLine = text.includes('\r\n') ? '\r\n' : '\n';
	const indents = [...text.matchAll(/^( +|\t+)\S/gm)].map(m => m[1]);
	const tabs = indents.filter(i => i.startsWith('\t')).length > indents.length / 2;
	const spaceIndents = indents.filter(i => i.startsWith(' ')).map(i => i.length);
	const size = tabs ? 4 : spaceIndents.length ? Math.max(2, Math.min(...spaceIndents)) : 4;
	return { ...ts.getDefaultFormatCodeSettings(newLine), convertTabsToSpaces: !tabs, indentSize: size, tabSize: size };
}

function lineOf(text, position) {
	let line = 1;
	for (let i = 0; i < position && i < text.length; i++) {
		if (text.charCodeAt(i) === 10) {
			line++;
		}
	}
	return line;
}

function fixProject(configArg, options) {
	const abs = path.resolve(configArg);
	const configFile = fs.existsSync(abs) && fs.statSync(abs).isDirectory() ? path.join(abs, 'tsconfig.json') : abs;
	if (!fs.existsSync(configFile)) {
		fatal(`${configArg}: no such tsconfig`);
	}
	const ts = loadTypeScript(path.dirname(configFile));
	const norm = f => f.replace(/\\/g, '/');
	const display = f => path.relative(process.cwd(), f).split(path.sep).join('/') || f;
	const parseHost = { ...ts.sys, onUnRecoverableConfigFileDiagnostic: d => fatal(ts.flattenDiagnosticMessageText(d.messageText, '\n')) };
	const parsed = ts.getParsedCommandLineOfConfigFile(configFile, { isolatedDeclarations: true, declaration: true }, parseHost);
	const targets = parsed.fileNames.map(norm).filter(f => fixable.test(f) && !declarationFile.test(f) && !f.includes('/node_modules/'));

	const contents = new Map();
	const versions = new Map();
	const read = f => (contents.has(norm(f)) ? contents.get(norm(f)) : ts.sys.readFile(f));
	const host = {
		getCompilationSettings: () => parsed.options,
		getScriptFileNames: () => parsed.fileNames,
		getProjectReferences: () => parsed.projectReferences,
		getParsedCommandLine: f => ts.getParsedCommandLineOfConfigFile(f, undefined, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} }),
		getScriptVersion: f => String(versions.get(norm(f)) ?? 0),
		getScriptSnapshot: f => {
			const text = read(f);
			return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
		},
		getCurrentDirectory: () => path.dirname(configFile),
		getDefaultLibFileName: o => ts.getDefaultLibFilePath(o),
		fileExists: f => contents.has(norm(f)) || ts.sys.fileExists(f),
		readFile: read,
		readDirectory: ts.sys.readDirectory,
		directoryExists: ts.sys.directoryExists,
		getDirectories: ts.sys.getDirectories,
		realpath: ts.sys.realpath,
		useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
		// Read referenced projects from source, so their declarations need not be built yet.
		useSourceOfProjectReferenceRedirect: () => true,
	};
	const service = ts.createLanguageService(host, ts.createDocumentRegistry());
	const isolatedErrors = (program, f) => {
		const sf = program.getSourceFile(f);
		return sf ? program.getDeclarationDiagnostics(sf).filter(isIsolatedDeclarationsError) : [];
	};

	let before = 0;
	const otherBefore = new Map();
	const changed = new Set();
	const review = [];
	const failures = [];
	const skipped = [];
	const rolledBack = new Set();
	const importsAdded = new Set();
	let passes = 0;
	for (let pass = 1; pass <= options.maxPasses; pass++) {
		passes = pass;
		const program = service.getProgram();
		const edits = new Map();
		for (const f of targets) {
			const diagnostics = isolatedErrors(program, f);
			if (pass === 1) {
				before += diagnostics.length;
			}
			if (diagnostics.length === 0 || rolledBack.has(f)) {
				continue;
			}
			if (!otherBefore.has(f)) {
				otherBefore.set(f, new Set(service.getSemanticDiagnostics(f).map(d => `${d.code}:${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`)));
			}
			try {
				const fix = service.getCombinedCodeFix({ type: 'file', fileName: f }, 'fixMissingTypeAnnotationOnExports', formatSettings(ts, read(f)), { quotePreference: 'auto' });
				for (const change of fix.changes) {
					const file = norm(change.fileName);
					edits.set(file, [...(edits.get(file) ?? []), ...change.textChanges]);
				}
			} catch (error) {
				failures.push(`${display(f)}: ${error.message}`);
			}
		}
		let applied = 0;
		for (const [file, textChanges] of edits) {
			if (rolledBack.has(file)) {
				continue;
			}
			const original = read(file);
			const sourceFile = program.getSourceFile(file);
			let text = original;
			let lastStart = Infinity;
			let addsImport = false;
			const fileReview = [];
			// Apply back to front. Edits at the same position must keep their original relative order
			// (e.g. "," then "\n  Name" when extending a named import), so later edits go first.
			const ordered = textChanges.map((change, index) => ({ change, index }))
				.sort((a, b) => b.change.span.start - a.change.span.start || b.index - a.index);
			for (const { change } of ordered) {
				if (change.span.start + change.span.length > lastStart) {
					skipped.push(`${display(file)}:${lineOf(original, change.span.start)}`);
					continue;
				}
				lastStart = change.span.start;
				text = text.slice(0, change.span.start) + change.newText + text.slice(change.span.start + change.span.length);
				const statement = sourceFile?.statements.find(s => s.getStart(sourceFile) <= change.span.start && change.span.start <= s.end);
				if (/^\s*import\s/m.test(change.newText) || (statement && ts.isImportDeclaration(statement))) {
					addsImport = true;
					continue;
				}
				const why = [
					/\bany\b/.test(change.newText) && 'contains `any`',
					/\bimport\(/.test(change.newText) && 'uses an import("...") type',
					/[<,]\s*\{\s*\}\s*(?=[,>])/.test(change.newText) && 'has `{}` type arguments (often rejected by lint)',
					change.newText.length > 300 && `long type (${change.newText.length} chars)`,
				].filter(Boolean);
				if (why.length) {
					fileReview.push(`${display(file)}:${lineOf(original, change.span.start)} ${why.join(', ')}: ${change.newText.trim().replace(/\s+/g, ' ').slice(0, 160)}`);
				}
			}
			if (text === original) {
				continue;
			}
			const syntaxBefore = service.getSyntacticDiagnostics(file).length;
			contents.set(file, text);
			versions.set(file, (versions.get(file) ?? 0) + 1);
			const introducedSyntax = service.getSyntacticDiagnostics(file);
			if (introducedSyntax.length > syntaxBefore) {
				contents.set(file, original);
				versions.set(file, versions.get(file) + 1);
				const d = introducedSyntax[0];
				const { line, character } = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
				failures.push(`${display(file)}: introduced syntax error TS${d.code} at ${line + 1}:${character + 1} (${ts.flattenDiagnosticMessageText(d.messageText, ' ')}); restored this pass's edits to the file`);
				rolledBack.add(file);
				continue;
			}
			review.push(...fileReview);
			if (addsImport) {
				importsAdded.add(file);
			}
			changed.add(file);
			applied++;
			if (!options.dryRun) {
				fs.writeFileSync(file, text);
			}
		}
		if (applied === 0) {
			break;
		}
	}

	const program = service.getProgram();
	const remaining = targets.flatMap(f => isolatedErrors(program, f));
	const introduced = [];
	for (const f of changed) {
		if (!targets.includes(f)) {
			continue;
		}
		const old = otherBefore.get(f) ?? new Set();
		for (const d of service.getSemanticDiagnostics(f)) {
			if (!old.has(`${d.code}:${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`)) {
				introduced.push(d);
			}
		}
	}
	const where = d => {
		if (!d.file) {
			return '';
		}
		const { line, character } = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
		return `${display(d.file.fileName)}:${line + 1}:${character + 1}`;
	};
	const describe = d => `${where(d)} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`;

	console.log(`${display(configFile)} (TypeScript ${ts.version})`);
	console.log(`  isolatedDeclarations errors: ${before} before, ${remaining.length} after; ${changed.size} file(s) ${options.dryRun ? 'would change' : 'changed'} in ${passes} pass(es)`);
	if (remaining.length) {
		console.log(`  Remaining errors (fix by hand, writing the type the compiler inferred):`);
		for (const d of remaining.slice(0, 100)) {
			console.log(`    ${describe(d)}`);
		}
		if (remaining.length > 100) {
			console.log(`    ... ${remaining.length - 100} more`);
		}
	}
	if (introduced.length) {
		console.log(`  New type errors in changed files (fix them, e.g. export or import the named type):`);
		for (const d of introduced.slice(0, 50)) {
			console.log(`    ${describe(d)}`);
		}
	}
	if (review.length) {
		console.log(`  Review these inserted annotations (prefer existing named types; never widen to any/unknown):`);
		for (const line of review.slice(0, 50)) {
			console.log(`    ${line}`);
		}
		if (review.length > 50) {
			console.log(`    ... ${review.length - 50} more`);
		}
	}
	if (importsAdded.size) {
		console.log(`  Added named type imports in ${importsAdded.size} file(s). Declaration output may now print \`T\` instead of \`import("m").T\`: a printer-only change for API/declaration snapshots.`);
	}
	if (skipped.length) {
		console.log(`  Skipped ${skipped.length} overlapping edit(s); rerun the script to retry them: ${skipped.slice(0, 10).join(', ')}`);
	}
	for (const failure of failures) {
		console.log(`  Fix failed: ${failure}`);
	}
	return { before, remaining: remaining.length, changed: changed.size, introduced: introduced.length, failed: failures.length };
}

const options = parseArgs(process.argv.slice(2));
let remaining = 0;
let failed = 0;
for (const project of options.projects) {
	const result = fixProject(project, options);
	remaining += result.remaining;
	failed += result.failed;
}
if (options.projects.length > 1) {
	console.log(`\nTotal remaining isolatedDeclarations errors: ${remaining}`);
}
if (failed > 0) {
	console.log(`\n${failed} fix(es) failed or were rolled back; see "Fix failed" above.`);
	process.exitCode = 1;
}
