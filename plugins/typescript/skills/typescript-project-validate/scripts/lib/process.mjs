import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { redactEnvironment, resolveExecutionPath } from './plan.mjs';

const outputLimit = 1024 * 1024;

export function spawnCaptured(spec, packageDirectory, workspaceRoot = packageDirectory) {
	const cwd = resolveExecutionPath(packageDirectory, spec.cwd ?? '.', 'cwd', workspaceRoot);
	const explicitEnvironment = spec.env ?? {};
	const environment = nonInteractiveEnvironment(process.env, explicitEnvironment);
	const prependPath = (spec.prependPath ?? []).map((entry, index) =>
		resolveExecutionPath(packageDirectory, entry, `prependPath[${index}]`, workspaceRoot));
	normalizePathEnvironment(environment, explicitEnvironment, prependPath);

	let output = '';
	let truncated = false;
	const append = chunk => {
		if (output.length >= outputLimit) {
			truncated = true;
			return;
		}

		const remaining = outputLimit - output.length;
		output += chunk.toString().slice(0, remaining);
		truncated ||= chunk.length > remaining;
	};

	const resolved = resolveSpawnCommand(spec.command, spec.args ?? [], environment);
	const child = spawn(resolved.command, resolved.args, {
		cwd,
		env: environment,
		detached: process.platform !== 'win32',
		shell: false,
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true,
	});
	child.stdout?.on('data', append);
	child.stderr?.on('data', append);

	let settled = false;
	const closed = new Promise(resolve => {
		const finish = result => {
			if (!settled) {
				settled = true;
				resolve(result);
			}
		};
		child.once('error', error => finish({ code: null, signal: null, error }));
		child.once('close', (code, signal) => finish({ code, signal, error: null }));
	});

	return {
		child,
		closed,
		execution: {
			command: spec.command,
			args: spec.args ?? [],
			resolvedCommand: resolved.command,
			resolvedArgs: resolved.args,
			cwd,
			env: redactEnvironment(explicitEnvironment),
			prependPath,
			windowsCommandShim: resolved.windowsCommandShim,
		},
		getOutput() {
			return `${output}${truncated ? '\n...[truncated]' : ''}`;
		},
	};
}

/**
 * Commands never prompt: `npx` fails instead of downloading a missing tool,
 * Corepack does not ask before fetching a package manager, and test runners
 * see CI. Values in the plan's `env` win.
 */
export function nonInteractiveEnvironment(inherited, explicitEnvironment = {}) {
	const environment = { CI: '1', ...inherited };
	for (const key of Object.keys(environment)) {
		if (/^npm_config_yes$/i.test(key)) {
			delete environment[key];
		}
	}
	environment.npm_config_yes = 'false';
	environment.COREPACK_ENABLE_DOWNLOAD_PROMPT = '0';
	return { ...environment, ...explicitEnvironment };
}

export function normalizePathEnvironment(
	environment,
	explicitEnvironment,
	prependPath,
	platform = process.platform,
) {
	const explicitPathKey = Object.keys(explicitEnvironment)
		.find(key => key.toLowerCase() === 'path');
	const inheritedPathKey = Object.keys(environment)
		.find(key => key.toLowerCase() === 'path');
	const pathKey = explicitPathKey ?? inheritedPathKey ?? 'PATH';
	const basePath = explicitPathKey
		? explicitEnvironment[explicitPathKey]
		: inheritedPathKey
			? environment[inheritedPathKey]
			: '';
	for (const key of Object.keys(environment)) {
		if (key.toLowerCase() === 'path') {
			delete environment[key];
		}
	}
	const delimiter = platform === 'win32' ? ';' : path.delimiter;
	const value = [...prependPath, basePath].filter(Boolean).join(delimiter);
	if (value) {
		environment[pathKey] = value;
	}
	return environment;
}

export async function runCommand(spec, packageDirectory, signal, workspaceRoot = packageDirectory) {
	const startedAt = Date.now();
	let handle;
	try {
		handle = spawnCaptured(spec, packageDirectory, workspaceRoot);
	} catch (error) {
		return commandResult(null, error, '', false, Date.now() - startedAt, null);
	}

	const timeoutMs = (spec.timeoutSeconds ?? 60) * 1000;
	let timedOut = false;
	let aborted = false;
	let timer;
	let abortListener;
	const interrupted = new Promise(resolve => {
		timer = setTimeout(() => {
			timedOut = true;
			resolve('timeout');
		}, timeoutMs);
		if (signal) {
			abortListener = () => {
				aborted = true;
				resolve('abort');
			};
			if (signal.aborted) {
				abortListener();
			} else {
				signal.addEventListener('abort', abortListener, { once: true });
			}
		}
	});

	const first = await Promise.race([
		handle.closed.then(result => ({ type: 'closed', result })),
		interrupted.then(type => ({ type })),
	]);
	clearTimeout(timer);
	if (abortListener) {
		signal.removeEventListener('abort', abortListener);
	}

	let closed;
	if (first.type === 'closed') {
		closed = first.result;
	} else {
		await stopProcessTree(handle.child);
		closed = await handle.closed;
	}

	return commandResult(
		closed.code,
		closed.error,
		handle.getOutput(),
		timedOut,
		Date.now() - startedAt,
		handle.execution,
		aborted,
	);
}

function commandResult(code, error, output, timedOut, durationMs, execution, aborted = false) {
	return {
		exitCode: code,
		error: error?.message ?? null,
		output,
		timedOut,
		aborted,
		durationMs,
		execution,
	};
}

export async function stopProcessTree(child) {
	if (!child?.pid) {
		return;
	}
	if (process.platform === 'win32') {
		await new Promise(resolve => {
			const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
				shell: false,
				stdio: 'ignore',
				windowsHide: true,
			});
			killer.once('error', resolve);
			killer.once('close', resolve);
		});
		return;
	}

	if (!processGroupExists(child.pid)) {
		return;
	}
	try {
		process.kill(-child.pid, 'SIGTERM');
	} catch (error) {
		if (error.code !== 'ESRCH') {
			throw error;
		}
		return;
	}
	const deadline = Date.now() + 2000;
	while (processGroupExists(child.pid) && Date.now() < deadline) {
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	if (processGroupExists(child.pid)) {
		try {
			process.kill(-child.pid, 'SIGKILL');
			await new Promise(resolve => setTimeout(resolve, 100));
		} catch (error) {
			if (error.code !== 'ESRCH') {
				throw error;
			}
		}
	}
}

function processGroupExists(processGroupId) {
	try {
		process.kill(-processGroupId, 0);
		return true;
	} catch (error) {
		if (error.code === 'ESRCH') {
			return false;
		}
		if (error.code === 'EPERM') {
			return true;
		}
		throw error;
	}
}

export function resolveSpawnCommand(
	command,
	args,
	environment,
	platform = process.platform,
) {
	if (platform !== 'win32') {
		return { command, args, windowsCommandShim: false };
	}
	const basename = path.win32.basename(command).toLowerCase();
	const packageManager = basename.replace(/\.(?:cmd|bat)$/i, '');
	const inheritedNpmCli = packageManager === 'npm' || packageManager === 'npx'
		? resolveInheritedNpmCli(packageManager, environment)
		: null;
	if (inheritedNpmCli) {
		return {
			command: process.execPath,
			args: [inheritedNpmCli, ...args],
			windowsCommandShim: true,
		};
	}

	const executable = findWindowsExecutable(command, environment);
	if (!executable || !/\.(?:cmd|bat)$/i.test(executable)) {
		return { command: executable ?? command, args, windowsCommandShim: false };
	}
	const nodeScript = resolveNodeShimScript(executable, packageManager);
	if (!nodeScript) {
		throw new Error(
			`cannot safely execute Windows command shim '${command}'; `
			+ 'use a directly executable command or a Node-based package-manager shim',
		);
	}
	return {
		command: process.execPath,
		args: [nodeScript, ...args],
		windowsCommandShim: true,
	};
}

function resolveInheritedNpmCli(packageManager, environment) {
	const npmExecPath = environment.npm_execpath ?? environment.npm_execPath;
	if (!npmExecPath || !existsSync(npmExecPath)) {
		return null;
	}
	if (packageManager === 'npm') {
		return npmExecPath;
	}
	const npxCli = path.join(path.dirname(npmExecPath), 'npx-cli.js');
	return existsSync(npxCli) ? npxCli : null;
}

function findWindowsExecutable(command, environment) {
	const hasDirectory = /[\\/]/.test(command);
	const extensions = path.win32.extname(command)
		? ['']
		: ['', ...(environment.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';')];
	const pathKey = Object.keys(environment).find(key => key.toLowerCase() === 'path');
	const directories = hasDirectory
		? ['']
		: (pathKey ? environment[pathKey] : '').split(';').filter(Boolean);
	for (const directory of directories) {
		for (const extension of extensions) {
			const candidate = hasDirectory
				? `${command}${extension.toLowerCase()}`
				: path.win32.join(directory.replace(/^"|"$/g, ''), `${command}${extension.toLowerCase()}`);
			if (existsSync(candidate)) {
				return candidate;
			}
		}
	}
	return null;
}

function resolveNodeShimScript(shimPath, packageManager) {
	const shimDirectory = path.win32.dirname(shimPath);
	const candidates = {
		npm: ['node_modules/npm/bin/npm-cli.js'],
		npx: ['node_modules/npm/bin/npx-cli.js'],
		pnpm: ['node_modules/corepack/dist/pnpm.js', 'node_modules/pnpm/bin/pnpm.cjs'],
		pnpx: ['node_modules/corepack/dist/pnpx.js', 'node_modules/pnpm/bin/pnpx.cjs'],
		yarn: ['node_modules/corepack/dist/yarn.js', 'node_modules/yarn/bin/yarn.js'],
		yarnpkg: ['node_modules/corepack/dist/yarn.js', 'node_modules/yarn/bin/yarn.js'],
	};
	for (const relative of candidates[packageManager] ?? []) {
		const candidate = path.win32.join(shimDirectory, relative);
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	let contents;
	try {
		contents = readFileSync(shimPath, 'utf8');
	} catch {
		return null;
	}
	for (const match of contents.matchAll(/"([^"]+\.(?:[cm]?js))"/gi)) {
		const expanded = match[1]
			.replace(/%~dp0/gi, `${shimDirectory}\\`)
			.replace(/%dp0%/gi, `${shimDirectory}\\`);
		const candidate = path.win32.normalize(expanded);
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return null;
}
