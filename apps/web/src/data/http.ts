/** Requests that never answer (weak signal, captive portal) must not freeze the app. */
export const DEFAULT_TIMEOUT_MS = 15_000;

export interface HttpOptions {
	/** Per request; defaults to DEFAULT_TIMEOUT_MS. */
	timeoutMs?: number;
}

export class TimeoutError extends Error {
	constructor(ms: number) {
		super(`no answer within ${ms} ms`);
		this.name = "TimeoutError";
	}
}

/** Rejects with TimeoutError when `promise` does not settle in time (works even if the promise ignores aborts). */
export function raceTimeout<T>(
	promise: Promise<T>,
	ms: number,
	onTimeout?: () => void,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			onTimeout?.();
			reject(new TimeoutError(ms));
		}, ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** fetch with a hard deadline; the request is aborted when the deadline passes. */
export function fetchWithTimeout(
	fetchFn: typeof fetch,
	url: string,
	init: RequestInit = {},
	ms: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
	const controller = new AbortController();
	return raceTimeout(
		fetchFn(url, { ...init, signal: controller.signal }),
		ms,
		() => controller.abort(),
	);
}
