import { type RouteBundle, routeBundleSchema } from "@qurally/shared";
import type { QurallyDb } from "./db";
import {
	DEFAULT_TIMEOUT_MS,
	fetchWithTimeout,
	type HttpOptions,
	raceTimeout,
} from "./http";

export type LoadResult =
	| { status: "fresh" | "unchanged" | "cached"; bundle: RouteBundle }
	| { status: "unavailable"; bundle: null };

/**
 * Loads a route: network first (conditional request), the cached bundle otherwise.
 * Only validated bundles are stored, so a broken server response can never
 * replace a working cache. Local progress lives in its own table and is untouched.
 * A request that does not answer in time counts as offline.
 */
export async function loadRoute(
	db: QurallyDb,
	routeId: string,
	fetchFn: typeof fetch = (...args) => fetch(...args),
	options: HttpOptions = {},
): Promise<LoadResult> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const cached = await db.routeBundles.get(routeId);
	const fallback = (): LoadResult =>
		cached
			? { status: "cached", bundle: cached.bundle }
			: { status: "unavailable", bundle: null };

	try {
		const headers = new Headers();
		if (cached?.etag) headers.set("if-none-match", cached.etag);
		const res = await fetchWithTimeout(
			fetchFn,
			`/api/routes/${routeId}`,
			{ headers },
			timeoutMs,
		);

		if (res.status === 304 && cached)
			return { status: "unchanged", bundle: cached.bundle };
		if (!res.ok) return fallback();

		const parsed = routeBundleSchema.safeParse(
			await raceTimeout(res.json(), timeoutMs),
		);
		if (!parsed.success) return fallback();

		await db.routeBundles.put({
			routeId,
			bundle: parsed.data,
			etag: res.headers.get("etag"),
			fetchedAt: Date.now(),
		});
		return { status: "fresh", bundle: parsed.data };
	} catch {
		// Offline, timeout, DNS failure, invalid JSON, ...
		return fallback();
	}
}
