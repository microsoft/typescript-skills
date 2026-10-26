import http from 'node:http';
import https from 'node:https';

export async function requestUrl(url, timeoutMs = 5000, signal) {
	return new Promise((resolve, reject) => {
		const client = url.startsWith('https:') ? https : http;
		let settled = false;
		let timer;
		let abortListener;
		const finish = (callback, value) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			if (abortListener) {
				signal.removeEventListener('abort', abortListener);
			}
			callback(value);
		};
		const request = client.get(url, response => {
			let body = '';
			response.setEncoding('utf8');
			response.on('data', chunk => {
				if (body.length < 1024 * 1024) {
					body += chunk;
				}
			});
			response.once('error', error => finish(reject, error));
			response.on('end', () => finish(resolve, {
				statusCode: response.statusCode ?? 0,
				body,
			}));
		});
		request.once('error', error => finish(reject, error));
		timer = setTimeout(
			() => request.destroy(new Error(`request timed out after ${timeoutMs}ms`)),
			timeoutMs,
		);
		if (signal) {
			abortListener = () => request.destroy(new Error('validation aborted'));
			if (signal.aborted) {
				abortListener();
			} else {
				signal.addEventListener('abort', abortListener, { once: true });
			}
		}
	});
}

export async function waitForUrl(url, timeoutSeconds, processHandle, signal) {
	const deadline = Date.now() + timeoutSeconds * 1000;
	let lastError = null;
	while (Date.now() < deadline) {
		if (signal?.aborted) {
			throw new Error('validation aborted');
		}
		const processState = await Promise.race([
			processHandle.closed.then(result => ({ closed: true, result })),
			new Promise(resolve => setTimeout(() => resolve({ closed: false }), 0)),
		]);
		if (processState.closed) {
			const detail = processState.result.error?.message
				?? `exit ${processState.result.code ?? processState.result.signal ?? 'unknown'}`;
			throw new Error(`dev server exited before becoming ready (${detail})`);
		}
		try {
			const remainingMs = Math.max(1, deadline - Date.now());
			const response = await requestUrl(url, Math.min(5000, remainingMs), signal);
			if (response.statusCode >= 200 && response.statusCode < 400) {
				return response;
			}
			lastError = new Error(`HTTP ${response.statusCode}`);
		} catch (error) {
			lastError = error;
		}
		await delay(250, signal);
	}
	throw new Error(`timed out waiting for ${url}${lastError ? `: ${lastError.message}` : ''}`);
}

function delay(milliseconds, signal) {
	return new Promise((resolve, reject) => {
		let abortListener;
		const finish = callback => {
			if (abortListener) {
				signal.removeEventListener('abort', abortListener);
			}
			callback();
		};
		const timer = setTimeout(() => finish(resolve), milliseconds);
		if (signal) {
			abortListener = () => {
				clearTimeout(timer);
				finish(() => reject(new Error('validation aborted')));
			};
			if (signal.aborted) {
				abortListener();
			} else {
				signal.addEventListener('abort', abortListener, { once: true });
			}
		}
	});
}
