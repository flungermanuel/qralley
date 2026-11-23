import { type RouteBundle, validateRoute } from "@qurally/shared";
import { exampleRoute } from "../../../packages/shared/test/fixtures";
import { QurallyDb } from "../src/data/db";

let counter = 0;

/** A fresh, isolated IndexedDB per test. */
export function testDb(): QurallyDb {
	counter += 1;
	return new QurallyDb(
		`qurally-test-${counter}-${Math.random().toString(36).slice(2)}`,
	);
}

export function bundleFixture(over: Partial<RouteBundle> = {}): RouteBundle {
	const result = validateRoute(exampleRoute());
	if (!result.ok) throw new Error("example route invalid");
	return {
		route: result.route,
		stationStates: Object.fromEntries(
			result.route.stations.map((s) => [
				s.id,
				{ status: "ok" as const, reason: null },
			]),
		),
		bundleVersion: "a".repeat(64),
		serverTime: 1_700_000_000_000,
		...over,
	};
}

export function jsonResponse(
	body: unknown,
	init: { status?: number; etag?: string } = {},
): Response {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		headers: {
			"content-type": "application/json",
			...(init.etag ? { etag: init.etag } : {}),
		},
	});
}

export const offlineFetch: typeof fetch = () =>
	Promise.reject(new TypeError("Failed to fetch"));
