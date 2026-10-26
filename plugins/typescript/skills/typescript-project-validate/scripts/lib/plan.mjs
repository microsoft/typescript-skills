import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const coreCategories = [
	'typecheck',
	'lint',
	'build',
	'test',
	'package',
	'runtime',
];

const projectTypes = new Set([
	'webapp',
	'server',
	'cli',
	'electron',
	'library',
	'framework',
	'plugin',
	'other',
]);

const categoryStatuses = new Set(['covered', 'added', 'unavailable', 'blocked', 'out-of-scope']);
/** Statuses whose category must have at least one check. */
export const checkedStatuses = new Set(['covered', 'added']);
const credentialName = /(token|password|secret|api_?key|connection_?string|credential|auth)/i;

export class PlanValidationError extends Error {
	constructor(errors) {
		super(`Validation plan has ${errors.length} error(s):\n- ${errors.join('\n- ')}`);
		this.name = 'PlanValidationError';
		this.errors = errors;
	}
}

export function artifactDirectory(packageDirectory) {
	return path.join(path.resolve(packageDirectory), '.copilot', 'typescript-project-validate');
}

export function defaultPlanPath(packageDirectory) {
	return path.join(artifactDirectory(packageDirectory), 'plan.json');
}

export async function loadPlan(planPath) {
	const text = await readFile(planPath, 'utf8');
	let plan;
	try {
		plan = JSON.parse(text);
	} catch (error) {
		throw new PlanValidationError([`plan is not valid JSON: ${error.message}`]);
	}
	const errors = validatePlan(plan);
	if (errors.length > 0) {
		throw new PlanValidationError(errors);
	}
	return plan;
}

export function validatePlan(plan) {
	const errors = [];
	if (!isObject(plan)) {
		return ['plan must be a JSON object'];
	}
	if (plan.version !== 1) {
		errors.push('version must be 1');
	}
	if (!projectTypes.has(plan.projectType)) {
		errors.push(`projectType must be one of: ${[...projectTypes].join(', ')}`);
	}

	if (plan.workspaceRoot !== undefined && !isNonEmptyString(plan.workspaceRoot)) {
		errors.push('workspaceRoot must be a non-empty string');
	}

	if (!isObject(plan.categories)) {
		errors.push('categories must be an object');
	} else {
		for (const category of coreCategories) {
			const entry = plan.categories[category];
			if (!isObject(entry)) {
				errors.push(`categories.${category} is required`);
				continue;
			}
			if (!categoryStatuses.has(entry.status)) {
				errors.push(`categories.${category}.status must be covered, added, unavailable, blocked, or out-of-scope`);
			}
			if (entry.status !== 'covered' && !isNonEmptyString(entry.reason)) {
				errors.push(`categories.${category}.reason is required when status is ${entry.status}`);
			}
		}
	}

	const setup = plan.setup ?? [];
	if (!Array.isArray(setup)) {
		errors.push('setup must be an array');
	} else {
		setup.forEach((command, index) => validateCommand(command, `setup[${index}]`, errors));
	}

	if (plan.devServer !== undefined) {
		validateCommand(plan.devServer, 'devServer', errors);
		if (!isNonEmptyString(plan.devServer?.url)) {
			errors.push('devServer.url is required');
		} else {
			validateLoopbackUrl(plan.devServer.url, 'devServer.url', errors);
		}
		validatePositiveInteger(
			plan.devServer?.readyTimeoutSeconds,
			'devServer.readyTimeoutSeconds',
			errors,
			true,
		);
	}

	if (!Array.isArray(plan.checks)) {
		errors.push('checks must be an array (empty only when no category is covered or added)');
		return errors;
	}

	const names = new Set();
	const covered = new Set();
	plan.checks.forEach((check, index) => {
		const prefix = `checks[${index}]`;
		if (!isObject(check)) {
			errors.push(`${prefix} must be an object`);
			return;
		}
		if (!isNonEmptyString(check.name) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(check.name)) {
			errors.push(`${prefix}.name must be unique kebab-case`);
		} else if (names.has(check.name)) {
			errors.push(`${prefix}.name '${check.name}' is duplicated`);
		} else {
			names.add(check.name);
		}
		if (![...coreCategories, 'other'].includes(check.category)) {
			errors.push(`${prefix}.category must be a core category or other`);
		} else {
			covered.add(check.category);
		}
		if (!isNonEmptyString(check.expected)) {
			errors.push(`${prefix}.expected must be a non-empty string`);
		}
		validatePositiveInteger(check.timeoutSeconds, `${prefix}.timeoutSeconds`, errors, true);

		if (check.kind === 'process') {
			validateCommand(check, prefix, errors);
			if (!['exit-code', 'output-contains'].includes(check.verificationMethod)) {
				errors.push(`${prefix}.verificationMethod must be exit-code or output-contains`);
			}
			if (check.verificationMethod === 'exit-code' && !isIntegerString(check.expected)) {
				errors.push(`${prefix}.expected must be a stringified integer for exit-code`);
			}
			if (check.url !== undefined) {
				errors.push(`${prefix}.url is not valid for a process check`);
			}
		} else if (check.kind === 'http') {
			if (!isNonEmptyString(check.url)) {
				errors.push(`${prefix}.url is required for an HTTP check`);
			} else {
				validateLoopbackUrl(check.url, `${prefix}.url`, errors);
			}
			if (!['http-status', 'output-contains'].includes(check.verificationMethod)) {
				errors.push(`${prefix}.verificationMethod must be http-status or output-contains`);
			}
			if (check.verificationMethod === 'http-status' && !isIntegerString(check.expected)) {
				errors.push(`${prefix}.expected must be a stringified integer for http-status`);
			}
			for (const field of ['command', 'args', 'cwd', 'env', 'prependPath']) {
				if (check[field] !== undefined) {
					errors.push(`${prefix}.${field} is not valid for an HTTP check`);
				}
			}
		} else {
			errors.push(`${prefix}.kind must be process or http`);
		}
	});

	if (isObject(plan.categories)) {
		for (const category of coreCategories) {
			const status = plan.categories[category]?.status;
			if (checkedStatuses.has(status) && !covered.has(category)) {
				errors.push(`categories.${category} is ${status} but no check uses that category`);
			}
			if (covered.has(category) && !checkedStatuses.has(status)) {
				errors.push(`categories.${category} must be covered (or added, when the change creates it) because a check uses that category`);
			}
		}
	}
	return errors;
}

function validateCommand(command, prefix, errors) {
	if (!isObject(command)) {
		errors.push(`${prefix} must be an object`);
		return;
	}
	if (!isNonEmptyString(command.command)) {
		errors.push(`${prefix}.command is required`);
	}
	if (command.args !== undefined
		&& (!Array.isArray(command.args) || command.args.some(arg => typeof arg !== 'string'))) {
		errors.push(`${prefix}.args must be an array of strings`);
	}
	if (command.cwd !== undefined && !isNonEmptyString(command.cwd)) {
		errors.push(`${prefix}.cwd must be a non-empty string`);
	}
	if (command.env !== undefined
		&& (!isObject(command.env) || Object.values(command.env).some(value => typeof value !== 'string'))) {
		errors.push(`${prefix}.env must be an object with string values`);
	}
	if (command.prependPath !== undefined
		&& (!Array.isArray(command.prependPath)
			|| command.prependPath.some(entry => !isNonEmptyString(entry)))) {
		errors.push(`${prefix}.prependPath must be an array of non-empty strings`);
	}
	validatePositiveInteger(command.timeoutSeconds, `${prefix}.timeoutSeconds`, errors, true);
}

function validateLoopbackUrl(value, field, errors) {
	try {
		const url = new URL(value);
		const hostname = url.hostname.replace(/^\[|\]$/g, '');
		if (!['http:', 'https:'].includes(url.protocol)
			|| !['localhost', '127.0.0.1', '::1'].includes(hostname)) {
			errors.push(`${field} must be an HTTP(S) loopback URL`);
		}
	} catch {
		errors.push(`${field} must be an absolute URL`);
	}
}

function validatePositiveInteger(value, field, errors, optional) {
	if (value === undefined && optional) {
		return;
	}
	if (!Number.isInteger(value) || value <= 0) {
		errors.push(`${field} must be a positive integer`);
	}
}

function isObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function isIntegerString(value) {
	return typeof value === 'string' && /^-?\d+$/.test(value);
}

export function resolveExecutionPath(packageDirectory, value, field, workspaceRoot = packageDirectory) {
	const root = path.resolve(packageDirectory);
	const boundary = path.resolve(workspaceRoot);
	const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
	if (!path.isAbsolute(value) && resolved !== boundary && !resolved.startsWith(`${boundary}${path.sep}`)) {
		throw new Error(
			`${field} escapes the workspace root (${boundary}): ${value}. Relative paths resolve from `
			+ 'packageDirectory; set top-level "workspaceRoot" in the plan, or use an absolute path, '
			+ 'to run a command from a directory above it.',
		);
	}
	return resolved;
}

export function planHash(plan) {
	return createHash('sha256').update(canonicalJson(plan)).digest('hex');
}

function canonicalJson(value) {
	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(',')}]`;
	}
	if (isObject(value)) {
		return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

export function redactEnvironment(environment = {}) {
	return Object.fromEntries(Object.entries(environment).map(([name, value]) => [
		name,
		credentialName.test(name) ? '<redacted>' : value,
	]));
}
