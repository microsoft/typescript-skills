#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { errorsByFile } from './lib/diagnostics.mjs';
import { defaultPlanPath, PlanValidationError } from './lib/plan.mjs';
import { executeValidation } from './lib/runner.mjs';

export function parseArguments(arguments_) {
	const parsed = {
		mode: 'standalone',
		packageDirectory: process.cwd(),
		planPath: null,
		accept: [],
		checks: [],
	};
	for (let index = 0; index < arguments_.length; index++) {
		const argument = arguments_[index];
		if (argument === '--help' || argument === '-h') {
			parsed.help = true;
		} else if (argument === '--mode') {
			parsed.mode = requireValue(arguments_, ++index, argument);
		} else if (argument === '--package-directory') {
			parsed.packageDirectory = requireValue(arguments_, ++index, argument);
		} else if (argument === '--plan') {
			parsed.planPath = requireValue(arguments_, ++index, argument);
		} else if (argument === '--accept') {
			parsed.accept.push(requireValue(arguments_, ++index, argument));
		} else if (argument === '--check') {
			parsed.checks.push(requireValue(arguments_, ++index, argument));
		} else {
			throw new Error(`unknown argument: ${argument}`);
		}
	}
	parsed.planPath ??= defaultPlanPath(parsed.packageDirectory);
	return parsed;
}

export async function main(arguments_ = process.argv.slice(2)) {
	let options;
	try {
		options = parseArguments(arguments_);
	} catch (error) {
		console.error(error.message);
		printUsage();
		return 2;
	}
	if (options.help) {
		printUsage();
		return 0;
	}

	const controller = new AbortController();
	const abort = () => controller.abort();
	process.once('SIGINT', abort);
	process.once('SIGTERM', abort);
	try {
		const result = await executeValidation({
			packageDirectory: options.packageDirectory,
			planPath: options.planPath,
			mode: options.mode,
			signal: controller.signal,
			accept: options.accept,
			checks: options.checks,
		});
		console.log(formatSummary(result));
		return result.success ? 0 : 1;
	} catch (error) {
		if (error instanceof PlanValidationError) {
			console.error(error.message);
		} else {
			console.error(`Validation failed: ${error.message}`);
		}
		return 2;
	} finally {
		process.removeListener('SIGINT', abort);
		process.removeListener('SIGTERM', abort);
	}
}

const tailLineCount = 20;
const newDiagnosticLimit = 20;
const tailLineWidth = 200;

export function formatSummary(result) {
	const lines = [];
	if (result.mode === 'compare') {
		const summary = result.summary;
		lines.push(
			`compare${result.targeted ? ` (targeted: ${result.targeted.join(', ')})` : ''}: `
			+ `${summary.regressions} regression(s), `
			+ `${summary.changedFailures} changed failure(s), `
			+ `${summary.improvements} improvement(s), `
			+ `${summary.unchangedPasses} unchanged pass(es), `
			+ `${summary.preExistingFailures} pre-existing failure(s), `
			+ `${summary.addedPasses ? `${summary.addedPasses} added check(s) passing, ` : ''}`
			+ `${summary.inconclusive} inconclusive.`,
		);
		if (!result.current.setup.passed) {
			const failed = result.current.setup.steps.at(-1);
			lines.push(`[FAIL] ${failed.name}: ${describeFailure(failed)}`);
			lines.push(...outputTail(failed.outputSample));
		}
		for (const comparison of result.comparisons) {
			lines.push(...formatComparison(comparison));
		}
		if (!result.targeted) {
			lines.push(...formatCategories(result.current.categoryCoverage));
		}
		for (const warning of result.environment?.warnings ?? []) {
			lines.push(`[ENV] ${warning}`);
		}
		for (const note of result.notes ?? []) {
			lines.push(`[WARN] ${note}`);
		}
	} else {
		const coverage = Object.values(result.categoryCoverage ?? {});
		const exercised = coverage.filter(entry => entry.status === 'covered').length;
		lines.push(
			`${result.mode}: ${result.summary.passed} passed, `
			+ `${result.summary.failed} failed, ${result.summary.skipped} skipped; `
			+ `${exercised}/${coverage.length} categories exercised.`,
		);
		if (!result.setup.passed) {
			const failed = result.setup.steps.at(-1);
			lines.push(`[${failed.environmentFailure ? 'ENV-FAILURE' : 'FAIL'}] ${failed.name}: ${describeFailure(failed)}`);
			lines.push(...outputTail(failed.outputSample));
		}
		for (const check of result.checks) {
			if (check.added) {
				lines.push(`[ADDED] ${check.name} (${check.category}): created by the change; not run at baseline, `
					+ 'must pass at compare.');
				continue;
			}
			if (!check.passed && !check.skipped && check.environmentFailure) {
				lines.push(`[ENV-FAILURE] ${check.name} (${check.category}): ${check.environmentFailure}`);
				continue;
			}
			const status = check.skipped ? 'SKIP' : check.passed ? 'PASS' : 'FAIL';
			lines.push(`[${status}] ${check.name} (${check.category})`
				+ (check.passed ? '' : `: ${describeFailure(check)}`));
			if (!check.passed && !check.skipped) {
				lines.push(...outputTail(check.outputSample));
				lines.push(...formatErrorsByFile(errorsByFile(check.diagnostics)));
			}
		}
		if (result.checks.length === 0) {
			lines.push('No checks: every category is blocked, unavailable or out-of-scope.');
		}
		lines.push(...formatCategories(result.categoryCoverage));
		for (const warning of result.environment?.warnings ?? []) {
			lines.push(`[ENV] ${warning}`);
		}
	}
	lines.push(...formatContract(result.contract));

	if (result.mode === 'baseline') {
		if (result.preexistingChanges > 0) {
			lines.push(
				`Warning: ${result.preexistingChanges} path(s) already differ from HEAD. A baseline must be `
				+ 'captured before the first edit; it cannot catch regressions introduced by edits made before it.',
			);
		}
		if (result.environment && !result.environment.usable) {
			lines.push(
				'Baseline not usable: checks that fail for environment reasons cannot detect regressions. '
				+ 'Install dependencies with the frozen lockfile and build the workspace packages this package '
				+ 'imports (add those commands to "setup" if the change can affect them), then rerun --mode baseline '
				+ 'before editing. If the environment cannot be fixed here, remove the check, mark its category '
				+ 'blocked with the reason, and rerun.',
			);
		} else {
			const failed = result.summary.failed;
			if (failed > 0) {
				lines.push(
					`${failed} check(s) fail before any edit. Fix plan defects (wrong command, cwd or flags) and rerun `
					+ 'baseline; keep genuine project failures. Compare tracks their diagnostics, so new errors in '
					+ 'them are still reported.',
				);
			}
			lines.push('Next: make the change, then rerun with --mode compare. Do not edit plan.json in between.');
		}
	} else if (result.mode === 'standalone') {
		if (result.environment && !result.environment.usable) {
			lines.push('Some failures are environmental: install dependencies and build workspace prerequisites, then rerun.');
		}
		lines.push('For a change task, run --mode baseline before the first edit and --mode compare after it.');
	} else {
		if (result.environment && !result.environment.usable) {
			lines.push('Compare is not trustworthy: the checks ran against installed dependencies that differ from '
				+ 'package.json. Install, confirm the install exits 0, and compare again.');
		}
		const failing = result.comparisons
			.filter(comparison => ['regression', 'changed-failure'].includes(comparison.outcome))
			.map(comparison => comparison.name);
		if (result.targeted) {
			lines.push('Targeted rerun only. Run one full --mode compare before you finish.');
		} else if (failing.length > 0) {
			lines.push(`Next: fix these, then rerun only them with --mode compare ${failing.map(name => `--check ${name}`).join(' ')}. `
				+ 'Finish with one full --mode compare.');
		}
	}
	if (result.resultPath) {
		lines.push(`Details: ${result.resultPath}`);
	}
	return lines.join('\n');
}

function formatComparison(comparison) {
	const current = comparison.current;
	const heading = `[${comparison.outcome.toUpperCase()}] ${comparison.name} (${comparison.category})`;
	switch (comparison.outcome) {
		case 'regression':
			return [
				`${heading}: ${comparison.added ? 'added check fails: ' : ''}${describeFailure(current)}`,
				...outputTail(current.outputSample),
				...formatErrorsByFile(current.errorsByFile),
			];
		case 'changed-failure': {
			const shown = comparison.newDiagnostics.slice(0, newDiagnosticLimit);
			return [
				`${heading}: ${describeFailure(current)}; ${comparison.newDiagnosticCount} error(s) not in the baseline`
				+ ` (${comparison.resolvedDiagnostics} baseline error(s) gone). The new errors come from the change.`,
				...shown.map(diagnostic => `    [NEW] ${diagnostic}`),
				...(comparison.newDiagnosticCount > shown.length
					? [`    … ${comparison.newDiagnosticCount - shown.length} more in the result file`]
					: []),
				...formatErrorsByFile(errorsByFile(comparison.newDiagnostics)),
			];
		}
		case 'pre-existing-failure':
			return comparison.matchedDiagnostics > 0
				? [`${heading}: ${describeFailure(current)}; same ${comparison.matchedDiagnostics} error(s) as the baseline`
					+ (comparison.resolvedDiagnostics ? `, ${comparison.resolvedDiagnostics} fixed` : '')]
				: [
					`${heading}: ${describeFailure(current)}; no recognizable errors to compare. Check this output `
					+ 'against the baseline before calling it pre-existing.',
					...outputTail(current.outputSample),
				];
		case 'inconclusive':
			return [`${heading}: ${comparison.reason}`
				+ (comparison.baseline?.environmentFailure
					? '. Recapture the baseline in a prepared environment (git stash -u, fix setup, --mode baseline, '
						+ 'git stash pop) and compare again.'
					: '')];
		default:
			return [heading];
	}
}

const errorsByFileThreshold = 10;
const listedErrorFiles = 15;

/** Prints a per-file error count when the output tail cannot show every error. */
function formatErrorsByFile(byFile = []) {
	const total = byFile.reduce((sum, [, count]) => sum + count, 0);
	if (total <= errorsByFileThreshold) {
		return [];
	}
	const shown = byFile.slice(0, listedErrorFiles).map(([file, count]) => `${file} ${count}`).join(', ');
	return [
		`    errors by file (${total} in ${byFile.length} file(s)): ${shown}`
		+ `${byFile.length > listedErrorFiles ? ', …' : ''}. Fix each file's whole list in one edit.`,
	];
}

function formatCategories(categoryCoverage = {}) {
	return Object.entries(categoryCoverage)
		.filter(([, entry]) => entry.status !== 'covered')
		.map(([category, entry]) => `[${entry.status.toUpperCase()}] ${category}: ${entry.reason}`);
}

function formatContract(contract) {
	if (!contract) {
		return [];
	}
	if (contract.snapshot && !contract.reference) {
		const scripts = Object.values(contract.snapshot.scripts ?? {})
			.reduce((total, entries) => total + Object.keys(entries).length, 0);
		return [
			`Contract recorded: ${scripts} package.json script(s), `
			+ `${Object.keys(contract.snapshot.tsconfigs ?? {}).length} tsconfig file(s)`
			+ `${contract.snapshot.suppressions ? ', suppression counts' : ''}.`,
		];
	}
	if (!contract.reference) {
		return [`Contract check unavailable: ${contract.unavailableReason}.`];
	}
	const lines = [
		`Contract vs ${contract.reference}: ${contract.regressions} unaccepted finding(s)`
		+ `${contract.accepted ? `, ${contract.accepted} accepted` : ''}.`,
	];
	for (const finding of contract.findings) {
		lines.push(`[${finding.accepted ? 'ACCEPTED' : 'CONTRACT'}] ${finding.id}`);
		lines.push(`    ${finding.message}`);
	}
	if (contract.regressions > 0) {
		lines.push(
			'Fix contract findings rather than accepting them. Use --accept <id> only when the user\'s '
			+ 'request requires that exact change, and name it in your final message.',
		);
	}
	if (contract.unmatchedAccepts?.length) {
		lines.push(`Unknown --accept id(s): ${contract.unmatchedAccepts.join(', ')}`);
	}
	return lines;
}

function describeFailure(result) {
	if (result.skipped) {
		return `skipped: ${result.skippedReason}`;
	}
	const parts = [];
	if (result.timedOut) {
		parts.push('timed out');
	} else if (result.exitCode !== undefined && result.exitCode !== null) {
		parts.push(`exit ${result.exitCode}`);
	}
	if (result.statusCode !== undefined && result.statusCode !== null) {
		parts.push(`HTTP ${result.statusCode}`);
	}
	if (result.expected !== undefined && result.verificationMethod === 'output-contains') {
		parts.push(`expected output containing ${JSON.stringify(result.expected)}`);
	}
	if (result.error) {
		parts.push(result.error);
	}
	if (result.durationMs !== undefined) {
		parts.push(`${(result.durationMs / 1000).toFixed(1)}s`);
	}
	return parts.join(', ') || 'failed';
}

function outputTail(output) {
	if (!output) {
		return [];
	}
	// eslint-disable-next-line no-control-regex
	const lines = output.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
		.split(/\r?\n/)
		.map(line => line.trimEnd())
		.filter(line => line.length > 0);
	return lines.slice(-tailLineCount).map(line =>
		`    | ${line.length > tailLineWidth ? `${line.slice(0, tailLineWidth - 1)}…` : line}`);
}

function requireValue(arguments_, index, option) {
	const value = arguments_[index];
	if (!value || value.startsWith('--')) {
		throw new Error(`${option} requires a value`);
	}
	return value;
}

function printUsage() {
	console.log(`Usage:
  node run-validation.mjs [options]

Options:
  --package-directory <path>  Target package or repository root (default: cwd)
  --plan <path>               Validation plan (default: <package>/.copilot/typescript-project-validate/plan.json)
  --mode <mode>               standalone, baseline, or compare (default: standalone)
  --accept <id>               Accept one contract finding the user's request requires (repeatable)
  --check <name>              With --mode compare, rerun only this check against the baseline (repeatable)
  --help                      Show this help

Modes:
  baseline    Run the plan before the first edit and record the repository contract
              (package.json scripts, tsconfig strictness/module settings, suppressions).
              Reports checks that fail for environment reasons as [ENV-FAILURE].
  compare     Rerun the unchanged plan after the change; report pass-to-fail regressions,
              failing checks with new errors (changed failures) and contract findings.
  standalone  Health check; in a git repository the contract is compared against HEAD.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exitCode = await main();
}
