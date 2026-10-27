// Normalizes check output into comparable diagnostics, and recognizes failures
// caused by the environment (missing commands, uninstalled or unbuilt
// dependencies, registry access) rather than by the project.

const ansiPattern = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const maxDiagnostics = 2000;
const maxLength = 200;

const environmentPatterns = [
	/command not found/i,
	/: not found$/,
	/is not recognized as an internal or external command/i,
	/Cannot find module '(?![./])[^']+'/,
	/Cannot find module '[^']*[\\/]node_modules[\\/][^']*'/,
	/Cannot find package '/,
	/could not determine executable to run/i,
	/npx canceled due to missing packages/i,
	/need to install the following packages/i,
	/doesn't seem to have been installed/i,
	/Couldn't find the node_modules state file/i,
	/Command "[^"]+" not found/,
	/\bE401\b|\b401 Unauthorized\b|ERR_PNPM_FETCH_401|\bENOTFOUND\b|\bEAI_AGAIN\b/,
];

export function stripAnsi(text) {
	return text.replace(ansiPattern, '');
}

/**
 * Returns the first line that shows the check could not run in this
 * environment, or null. Only meaningful for a failed check.
 */
export function classifyEnvironmentFailure(output, exitCode, error) {
	if (error && /\bENOENT\b/.test(error)) {
		return truncate(error);
	}
	for (const line of stripAnsi(output ?? '').split(/\r?\n/)) {
		const trimmed = line.trim();
		if (environmentPatterns.some(pattern => pattern.test(trimmed))) {
			return truncate(trimmed);
		}
	}
	if (exitCode === 127) {
		return 'exit 127 (command not found)';
	}
	return null;
}

/**
 * Extracts a sorted, location-independent list of diagnostics (repeats kept,
 * so a file with more copies of the same error compares as worse): TypeScript
 * errors, ESLint/Oxlint/Biome/Prettier findings, failing test names, missing
 * scripts and thrown errors. Falls back to error-looking lines with digits
 * normalized when no known format is recognized.
 */
export function extractDiagnostics(output) {
	const lines = stripAnsi(output ?? '').split(/\r?\n/);
	const found = [];
	const add = value => {
		if (found.length < maxDiagnostics) {
			found.push(truncate(value.replace(/\s+/g, ' ').trim()));
		}
	};
	let lintFile = null;
	let pendingOxlint = null;
	const flushOxlint = file => {
		if (pendingOxlint) {
			add(file ? `${file}: ${pendingOxlint}` : pendingOxlint);
			pendingOxlint = null;
		}
	};

	for (const rawLine of lines) {
		const line = rawLine.trimEnd();
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		let match;
		if ((match = /^(.+?)(?:\(\d+,\d+\)|:\d+:\d+)\s*[:-]\s*error\s+(TS\d+):\s*(.*)$/.exec(trimmed))) {
			add(`${match[1]}: ${match[2]}: ${match[3]}`);
		} else if ((match = /^error\s+(TS\d+):\s*(.*)$/.exec(trimmed))) {
			add(`${match[1]}: ${match[2]}`);
		} else if ((match = /^[×⚠!✗x]\s+([\w@/.-]+\([\w@/.-]+\)):\s*(.*)$/.exec(trimmed))) {
			flushOxlint(null);
			pendingOxlint = `${match[1]}: ${match[2]}`;
		} else if ((match = /^[╭┌]─+\[(.+?):\d+:\d+\]/.exec(trimmed))) {
			flushOxlint(match[1]);
		} else if ((match = /^(\d+):(\d+)\s+(error|warning)\s+(.+?)(?:\s{2,}(\S+))?$/.exec(trimmed))
			&& /^\s/.test(line)) {
			add(`${lintFile ?? '?'}: ${match[3]} ${match[5] ?? ''}: ${match[4]}`);
		} else if ((match = /^(.+?):\d+:\d+:\s*(.+?)\s*\[(Error|Warning)\/(\S+)\]$/.exec(trimmed))) {
			add(`${match[1]}: ${match[3].toLowerCase()} ${match[4]}: ${match[2]}`);
		} else if ((match = /^\[(warn|error)\]\s+(.+)$/.exec(trimmed))) {
			if (!/^Code style issues|^Forgot to run Prettier/i.test(match[2])) {
				add(`prettier ${match[1]}: ${match[2].replace(/\s*\(\d+:\d+\)/g, '')}`);
			}
		} else if ((match = /^(\S+?)(?::\d+:\d+)?\s+(format|organizeImports|assist\/\S+|lint\/\S+)(?:\s+[A-Z]+)*\s+━/.exec(trimmed))) {
			add(`${match[1]}: ${match[2]}`);
		} else if ((match = /^FAIL\s+(.+?)(?:\s+\([\d.]+\s*m?s\))?$/.exec(trimmed))) {
			add(`FAIL ${match[1]}`);
		} else if ((match = /^●\s+(.+)$/.exec(trimmed)) && !/^Console\b/.test(match[1])) {
			add(`● ${match[1]}`);
		} else if ((match = /^not ok \d+ - (.+?)(?:\s+#.*)?$/.exec(trimmed))) {
			add(`not ok ${match[1]}`);
		} else if ((match = /^[✕×✗✖✘]\s+(?:\[fail\]:\s*)?(.+?)(?:\s+\(?\d+(?:\.\d+)?\s*m?s\)?)?$/.exec(trimmed))
			&& !/^\d+ problems?\b/.test(match[1])) {
			add(`failed: ${match[1]}`);
		} else if ((match = /(?:Missing script|Couldn't find a script named):?\s*(.+)$/.exec(trimmed))) {
			add(`missing script: ${match[1].replace(/^"|"\.?$/g, '')}`);
		} else if ((match = /^(?:Uncaught\s+)?((?:[A-Z]\w*)?Error)(?:\s+\[([A-Z_0-9]+)\])?:\s+(.+)$/.exec(trimmed))) {
			add(`${match[1]}${match[2] ? ` [${match[2]}]` : ''}: ${match[3]}`);
		} else if (/^\S.*\.(?:[cm]?[jt]sx?|vue|svelte|astro|json|mdx?)$/.test(line) && !/:\s/.test(line)) {
			lintFile = trimmed;
		}
	}
	flushOxlint(null);

	if (found.length === 0) {
		for (const line of lines) {
			const trimmed = line.trim();
			if (/\b(error|errors|failed|failure|fail)\b/i.test(trimmed)) {
				add(`line: ${trimmed.replace(/\d+(\.\d+)?/g, '#')}`);
			}
		}
	}
	return found.sort();
}

function truncate(text) {
	return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

const diagnosticFile = /^(\S[^:]*?\.(?:[cm]?[jt]sx?|vue|svelte|astro|json)): /;

/**
 * Groups diagnostics by source file, most errors first, so a long type error
 * list can be fixed file by file without grepping the output. Accepts the
 * "(×k)" repeat suffix used for new diagnostics.
 */
export function errorsByFile(diagnostics = []) {
	const counts = new Map();
	for (const diagnostic of diagnostics ?? []) {
		const file = diagnosticFile.exec(diagnostic)?.[1];
		if (!file) {
			continue;
		}
		const repeat = /\(×(\d+)\)$/.exec(diagnostic);
		counts.set(file, (counts.get(file) ?? 0) + (repeat ? Number(repeat[1]) : 1));
	}
	return [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}
