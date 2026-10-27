import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { requestUrl, waitForUrl } from './http.mjs';
import { evaluateContract } from './contract.mjs';
import { classifyEnvironmentFailure, errorsByFile, extractDiagnostics } from './diagnostics.mjs';
import {
	checkedStatuses,
	coreCategories,
	defaultPlanPath,
	loadPlan,
	planHash,
} from './plan.mjs';
import { staleDependencyInstall } from './installed.mjs';
import { runCommand, spawnCaptured, stopProcessTree } from './process.mjs';
import {
	countWorkingTreeChanges,
	excludePlanDirectory,
	missingDependencyInstall,
	resolveWorkspace,
	resultDirectory,
} from './workspace.mjs';

const outputSampleLimit = 4096;

export async function executeValidation({
	packageDirectory,
	mode,
	planPath = defaultPlanPath(packageDirectory),
	signal,
	accept = [],
	checks: selectedChecks = [],
}) {
	if (!['standalone', 'baseline', 'compare'].includes(mode)) {
		throw new Error('mode must be standalone, baseline, or compare');
	}
	if (selectedChecks.length > 0 && mode !== 'compare') {
		throw new Error('--check reruns selected checks against the baseline and requires --mode compare');
	}
	const plan = await loadPlan(planPath);
	const hash = planHash(plan);
	const workspace = resolveWorkspace(packageDirectory, plan);
	const root = workspace.packageDirectory;
	const directory = resultDirectory(root);
	await excludePlanDirectory(root);
	let baseline = null;
	if (mode === 'compare') {
		baseline = await loadBaseline(directory);
		if (!baseline.complete) {
			throw new Error('baseline result is incomplete; capture a fresh baseline');
		}
		if (baseline.planHash !== hash) {
			throw new Error('validation plan changed since baseline (plan hash mismatch)');
		}
	}
	const targeted = selectedChecks.length > 0;
	let runnablePlan = plan;
	if (targeted) {
		const known = new Set(plan.checks.map(check => check.name));
		const unknown = selectedChecks.filter(name => !known.has(name));
		if (unknown.length > 0) {
			throw new Error(`unknown --check name(s): ${unknown.join(', ')}; plan checks are: ${[...known].join(', ')}`);
		}
		const selected = new Set(selectedChecks);
		const checks = plan.checks.filter(check => selected.has(check.name));
		runnablePlan = {
			...plan,
			checks,
			...(checks.some(check => check.kind === 'http') ? {} : { devServer: undefined }),
		};
		baseline = { ...baseline, checks: baseline.checks.filter(check => selected.has(check.name)) };
	}
	const preexistingChanges = mode === 'baseline' && workspace.gitRoot
		? countWorkingTreeChanges(root)
		: null;

	const contract = evaluateContract({
		workspace,
		mode,
		baselineSnapshot: baseline?.contract?.snapshot ?? null,
		accept,
	});
	const result = await runPlan(runnablePlan, root, hash, mode, signal, workspace.workspaceRoot);
	await mkdir(directory, { recursive: true });

	if (mode === 'compare') {
		const comparison = compareResults(baseline, result);
		const stale = staleDependencyInstall(root, workspace.workspaceRoot);
		const environment = { usable: !stale, warnings: stale ? [stale] : [], failures: [] };
		const notes = [];
		if (!targeted && contract.typescriptAdopted && !checkedStatuses.has(plan.categories.typecheck?.status)) {
			notes.push('The package adopted TypeScript, but the plan has no typecheck check, so the runner never '
				+ 'compiled it. Run the new typecheck script once (tsc --noEmit -p <tsconfig>) and report its result. '
				+ 'When a change creates a category, mark it "added" in the plan before the baseline.');
		}
		const resultPath = path.join(
			directory,
			targeted ? 'targeted-comparison-result.json' : 'comparison-result.json',
		);
		const persisted = {
			version: 1,
			mode,
			...(targeted ? { targeted: selectedChecks } : {}),
			planHash: hash,
			baselineCompletedAt: baseline.completedAt,
			completedAt: result.completedAt,
			success: result.complete
				&& result.setup.passed
				&& comparison.summary.regressions === 0
				&& comparison.summary.changedFailures === 0
				&& comparison.summary.inconclusive === 0
				&& environment.usable
				&& contract.regressions === 0,
			summary: comparison.summary,
			comparisons: comparison.comparisons,
			environment,
			...(notes.length > 0 ? { notes } : {}),
			contract,
			current: result,
			resultPath,
		};
		await writeJsonAtomic(resultPath, persisted);
		return persisted;
	}

	const resultPath = path.join(
		directory,
		mode === 'baseline' ? 'baseline-result.json' : 'standalone-result.json',
	);
	const environment = assessEnvironment(result, root, workspace.workspaceRoot);
	const persisted = {
		...result,
		success: result.success && contract.regressions === 0,
		environment,
		contract,
		...(preexistingChanges === null ? {} : { preexistingChanges }),
		resultPath,
	};
	await writeJsonAtomic(resultPath, persisted);
	return persisted;
}

/**
 * A baseline is usable only when every failure belongs to the project. A
 * check that failed because a command, dependency or prerequisite build was
 * missing says nothing about the change and hides regressions.
 */
export function assessEnvironment(result, packageDirectory, workspaceRoot = packageDirectory) {
	const warnings = [];
	const missingInstall = missingDependencyInstall(packageDirectory);
	if (missingInstall) {
		warnings.push(missingInstall);
	} else {
		const stale = staleDependencyInstall(packageDirectory, workspaceRoot);
		if (stale) {
			warnings.push(stale);
		}
	}
	const failures = [...result.setup.steps, ...result.checks]
		.filter(entry => entry.environmentFailure)
		.map(entry => ({ name: entry.name, line: entry.environmentFailure }));
	return { usable: warnings.length === 0 && failures.length === 0, warnings, failures };
}

export async function runPlan(plan, packageDirectory, hash, mode, signal, workspaceRoot = packageDirectory) {
	const startedAt = new Date().toISOString();
	const setupResults = [];
	const checkResults = [];
	let devServer = null;
	let devServerFailure = null;
	let complete = false;

	try {
		for (let index = 0; index < (plan.setup ?? []).length; index++) {
			const command = plan.setup[index];
			const execution = await runCommand(command, packageDirectory, signal, workspaceRoot);
			const passed = execution.exitCode === 0
				&& !execution.timedOut
				&& !execution.aborted
				&& !execution.error;
			const result = {
				name: `setup-${index + 1}`,
				passed,
				...persistedCommandResult(execution, passed),
			};
			setupResults.push(result);
			if (signal?.aborted) {
				throw new Error('validation aborted');
			}
			if (!result.passed) {
				return buildResult(false);
			}
		}

		if (plan.devServer) {
			try {
				let existingResponse = null;
				try {
					existingResponse = await requestUrl(plan.devServer.url, 250, signal);
				} catch {
					if (signal?.aborted) {
						throw new Error('validation aborted');
					}
				}
				if (existingResponse
					&& existingResponse.statusCode >= 200
					&& existingResponse.statusCode < 400) {
					throw new Error(
						`devServer.url is already responding before startup: ${plan.devServer.url}`,
					);
				}
				devServer = spawnCaptured(plan.devServer, packageDirectory, workspaceRoot);
				await waitForUrl(
					plan.devServer.url,
					plan.devServer.readyTimeoutSeconds ?? 120,
					devServer,
					signal,
				);
				const launcherState = await Promise.race([
					devServer.closed.then(() => 'closed'),
					new Promise(resolve => setImmediate(() => resolve('running'))),
				]);
				if (launcherState === 'closed') {
					throw new Error('dev server launcher exited after readiness');
				}
			} catch (error) {
				devServerFailure = error.message;
			}
		}

		for (const check of plan.checks) {
			if (signal?.aborted) {
				throw new Error('validation aborted');
			}
			let result;
			if (mode === 'baseline' && plan.categories[check.category]?.status === 'added') {
				result = {
					name: check.name,
					category: check.category,
					kind: check.kind,
					verificationMethod: check.verificationMethod,
					passed: false,
					skipped: false,
					added: true,
					timedOut: false,
					durationMs: 0,
					outputSample: '',
				};
			} else if (check.kind === 'http' && devServerFailure) {
				result = {
					name: check.name,
					category: check.category,
					kind: check.kind,
					verificationMethod: check.verificationMethod,
					passed: false,
					skipped: true,
					skippedReason: `dev server unavailable: ${devServerFailure}`,
					timedOut: false,
					durationMs: 0,
					outputSample: '',
				};
			} else if (check.kind === 'process') {
				result = await runProcessCheck(check, packageDirectory, signal, workspaceRoot);
			} else {
				result = await runHttpCheck(check, signal);
			}
			checkResults.push(result);
			if (signal?.aborted) {
				throw new Error('validation aborted');
			}
		}
		complete = true;
		return buildResult(true);
	} finally {
		if (devServer) {
			await stopProcessTree(devServer.child);
		}
	}

	function buildResult(setupPassed) {
		const completedAt = new Date().toISOString();
		const ran = checkResults.filter(check => !check.added);
		const checksPassed = ran.filter(check => check.passed).length;
		const checksFailed = ran.filter(check => !check.passed && !check.skipped).length;
		const checksSkipped = ran.filter(check => check.skipped).length;
		const checksAdded = checkResults.length - ran.length;
		return {
			version: 1,
			mode,
			planHash: hash,
			projectType: plan.projectType,
			startedAt,
			completedAt,
			complete,
			success: setupPassed && checksFailed === 0 && checksSkipped === 0,
			setup: {
				passed: setupPassed,
				steps: setupResults,
			},
			categoryCoverage: Object.fromEntries(coreCategories.map(category => [
				category,
				{
					...plan.categories[category],
					checks: checkResults.filter(check => check.category === category).length,
					passed: ran.filter(check => check.category === category && check.passed).length,
					failed: ran.filter(check =>
						check.category === category && !check.passed && !check.skipped).length,
					skipped: ran.filter(check =>
						check.category === category && check.skipped).length,
				},
			])),
			summary: {
				total: checkResults.length,
				passed: checksPassed,
				failed: checksFailed,
				skipped: checksSkipped,
				...(checksAdded > 0 ? { added: checksAdded } : {}),
			},
			checks: checkResults,
		};
	}
}

async function runProcessCheck(check, packageDirectory, signal, workspaceRoot) {
	const execution = await runCommand(check, packageDirectory, signal, workspaceRoot);
	const passed = check.verificationMethod === 'exit-code'
		? execution.exitCode === Number(check.expected)
			&& !execution.timedOut
			&& !execution.aborted
			&& !execution.error
		: execution.output.includes(check.expected)
			&& !execution.timedOut
			&& !execution.aborted
			&& !execution.error;
	return {
		name: check.name,
		category: check.category,
		kind: check.kind,
		verificationMethod: check.verificationMethod,
		expected: check.expected,
		passed,
		skipped: false,
		...persistedCommandResult(execution, passed),
	};
}

async function runHttpCheck(check, signal) {
	const startedAt = Date.now();
	try {
		const response = await requestUrl(
			check.url,
			(check.timeoutSeconds ?? 60) * 1000,
			signal,
		);
		const passed = check.verificationMethod === 'http-status'
			? response.statusCode === Number(check.expected)
			: response.body.includes(check.expected);
		return {
			name: check.name,
			category: check.category,
			kind: check.kind,
			verificationMethod: check.verificationMethod,
			expected: check.expected,
			passed,
			skipped: false,
			timedOut: false,
			durationMs: Date.now() - startedAt,
			statusCode: response.statusCode,
			outputSample: sample(response.body),
		};
	} catch (error) {
		return {
			name: check.name,
			category: check.category,
			kind: check.kind,
			verificationMethod: check.verificationMethod,
			expected: check.expected,
			passed: false,
			skipped: false,
			timedOut: /timed out/i.test(error.message),
			durationMs: Date.now() - startedAt,
			statusCode: null,
			error: error.message,
			outputSample: '',
		};
	}
}

function persistedCommandResult(execution, passed) {
	const failure = passed || execution.timedOut || execution.aborted
		? {}
		: {
			environmentFailure: classifyEnvironmentFailure(execution.output, execution.exitCode, execution.error),
			diagnostics: extractDiagnostics(execution.output),
		};
	return {
		exitCode: execution.exitCode,
		error: execution.error,
		timedOut: execution.timedOut,
		aborted: execution.aborted,
		durationMs: execution.durationMs,
		...failure,
		outputSample: sample(execution.output),
		execution: execution.execution,
	};
}

const sampleHeadLimit = 1024;

function sample(output) {
	if (output.length <= outputSampleLimit) {
		return output;
	}
	const tailLength = outputSampleLimit - sampleHeadLimit;
	const omitted = output.length - outputSampleLimit;
	return `${output.slice(0, sampleHeadLimit)}\n...[${omitted} characters truncated]...\n${output.slice(-tailLength)}`;
}

async function loadBaseline(directory) {
	const baselinePath = path.join(directory, 'baseline-result.json');
	let text;
	try {
		text = await readFile(baselinePath, 'utf8');
	} catch (error) {
		if (error.code === 'ENOENT') {
			throw new Error('no baseline result found; run with --mode baseline first');
		}
		throw error;
	}
	return JSON.parse(text);
}

export function compareResults(baseline, current) {
	const currentByName = new Map(current.checks.map(check => [check.name, check]));
	const seen = new Set();
	const comparisons = [];
	const summary = {
		unchangedPasses: 0,
		regressions: 0,
		changedFailures: 0,
		improvements: 0,
		preExistingFailures: 0,
		addedPasses: 0,
		inconclusive: 0,
	};

	for (const before of baseline.checks) {
		const after = currentByName.get(before.name);
		seen.add(before.name);
		let outcome;
		const detail = {};
		if (before.added && after && !after.skipped) {
			detail.added = true;
			outcome = after.passed ? 'added-pass' : 'regression';
		} else if (!after || before.skipped || after.skipped) {
			outcome = 'inconclusive';
			detail.reason = !after ? 'check did not run' : 'check was skipped';
		} else if (!before.passed && before.environmentFailure) {
			outcome = 'inconclusive';
			detail.reason = `the baseline run failed for an environment reason (${before.environmentFailure}), `
				+ 'so it cannot show whether the change broke this check';
		} else if (before.passed && after.passed) {
			outcome = 'unchanged-pass';
		} else if (before.passed && !after.passed) {
			outcome = 'regression';
		} else if (!before.passed && after.passed) {
			outcome = 'improvement';
		} else {
			const { added, addedCount, resolvedCount } = diffDiagnostics(before.diagnostics, after.diagnostics);
			if ((after.timedOut || after.aborted) && !before.timedOut && !before.aborted) {
				added.unshift('the check timed out; the baseline run finished');
			}
			detail.resolvedDiagnostics = resolvedCount;
			if (added.length > 0) {
				outcome = 'changed-failure';
				detail.newDiagnosticCount = Math.max(addedCount, added.length);
				detail.newDiagnostics = added.slice(0, 200);
			} else {
				outcome = 'pre-existing-failure';
				detail.matchedDiagnostics = (after.diagnostics ?? []).length;
			}
		}
		incrementSummary(summary, outcome);
		comparisons.push({
			name: before.name,
			category: before.category,
			outcome,
			...detail,
			baseline: conciseResult(before),
			current: after ? conciseResult(after) : null,
		});
	}
	for (const after of current.checks) {
		if (seen.has(after.name)) {
			continue;
		}
		summary.inconclusive++;
		comparisons.push({
			name: after.name,
			category: after.category,
			outcome: 'inconclusive',
			reason: 'check is not in the baseline',
			baseline: null,
			current: conciseResult(after),
		});
	}
	return { summary, comparisons };
}

/** Compares diagnostic multisets: an error that occurs more often than in the baseline is new. */
function diffDiagnostics(before = [], after = []) {
	const counts = new Map();
	for (const diagnostic of before) {
		counts.set(diagnostic, (counts.get(diagnostic) ?? 0) + 1);
	}
	const currentCounts = new Map();
	for (const diagnostic of after) {
		currentCounts.set(diagnostic, (currentCounts.get(diagnostic) ?? 0) + 1);
	}
	const added = [];
	let addedCount = 0;
	for (const [diagnostic, count] of currentCounts) {
		const delta = count - (counts.get(diagnostic) ?? 0);
		if (delta > 0) {
			addedCount += delta;
			added.push(delta > 1 ? `${diagnostic} (×${delta})` : diagnostic);
		}
	}
	let resolvedCount = 0;
	for (const [diagnostic, count] of counts) {
		resolvedCount += Math.max(0, count - (currentCounts.get(diagnostic) ?? 0));
	}
	return { added, addedCount, resolvedCount };
}

function incrementSummary(summary, outcome) {
	const field = {
		'unchanged-pass': 'unchangedPasses',
		regression: 'regressions',
		'changed-failure': 'changedFailures',
		improvement: 'improvements',
		'pre-existing-failure': 'preExistingFailures',
		'added-pass': 'addedPasses',
		inconclusive: 'inconclusive',
	}[outcome];
	summary[field]++;
}

function conciseResult(result) {
	const byFile = errorsByFile(result.diagnostics);
	return {
		passed: result.passed,
		skipped: result.skipped,
		exitCode: result.exitCode ?? null,
		timedOut: result.timedOut,
		durationMs: result.durationMs,
		...(result.error ? { error: result.error } : {}),
		...(result.skippedReason ? { skippedReason: result.skippedReason } : {}),
		...(result.environmentFailure ? { environmentFailure: result.environmentFailure } : {}),
		...(byFile.length > 0 ? { errorsByFile: byFile } : {}),
		outputSample: result.outputSample,
	};
}

async function writeJsonAtomic(filePath, value) {
	const temporaryPath = `${filePath}.${process.pid}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
	await rename(temporaryPath, filePath);
}
