import { describe, expect, it, vi } from "vitest";
import { loadRoute } from "../src/data/route";
import { bundleFixture, jsonResponse, offlineFetch, testDb } from "./helpers";

const ROUTE_ID = "innsbruck-altstadt";

describe("loadRoute", () => {
	it("AK-LOAD-01: stores the fetched bundle with version and etag", async () => {
		const db = testDb();
		const bundle = bundleFixture();
		const fetchFn = vi.fn<typeof fetch>(async () =>
			jsonResponse(bundle, { etag: '"abc"' }),
		);

		const result = await loadRoute(db, ROUTE_ID, fetchFn);

		expect(result.status).toBe("fresh");
		expect(result.bundle).toEqual(bundle);
		expect(fetchFn).toHaveBeenCalledWith(
			`/api/routes/${ROUTE_ID}`,
			expect.anything(),
		);
		const stored = await db.routeBundles.get(ROUTE_ID);
		expect(stored?.bundle.bundleVersion).toBe(bundle.bundleVersion);
		expect(stored?.etag).toBe('"abc"');
		expect(typeof stored?.fetchedAt).toBe("number");
	});

	it("AK-LOAD-02: serves the cached bundle when offline", async () => {
		const db = testDb();
		await loadRoute(db, ROUTE_ID, async () =>
			jsonResponse(bundleFixture(), { etag: '"abc"' }),
		);
		const result = await loadRoute(db, ROUTE_ID, offlineFetch);
		expect(result.status).toBe("cached");
		expect(result.bundle?.route.id).toBe(ROUTE_ID);
	});

	it("AK-LOAD-03: reports unavailable when nothing was ever loaded and offline", async () => {
		const result = await loadRoute(testDb(), ROUTE_ID, offlineFetch);
		expect(result).toEqual({ status: "unavailable", bundle: null });
	});

	it("sends If-None-Match and keeps the cache on 304", async () => {
		const db = testDb();
		await loadRoute(db, ROUTE_ID, async () =>
			jsonResponse(bundleFixture(), { etag: '"abc"' }),
		);
		const fetchFn = vi.fn<typeof fetch>(
			async () => new Response(null, { status: 304 }),
		);

		const result = await loadRoute(db, ROUTE_ID, fetchFn);

		expect(result.status).toBe("unchanged");
		expect(result.bundle?.route.id).toBe(ROUTE_ID);
		const init = fetchFn.mock.calls[0]?.[1] as RequestInit;
		expect(new Headers(init.headers).get("if-none-match")).toBe('"abc"');
	});

	it("AK-LOAD-04: a newer version replaces the old bundle and keeps local progress", async () => {
		const db = testDb();
		await loadRoute(db, ROUTE_ID, async () =>
			jsonResponse(bundleFixture(), { etag: '"v1"' }),
		);
		await db.progress.put({
			routeId: ROUTE_ID,
			stationId: "goldenes-dachl",
			state: "completed",
			method: "scan",
			confirmed: false,
		});

		const v2 = bundleFixture({ bundleVersion: "b".repeat(64) });
		v2.route = { ...v2.route, version: 2, title: "Neuer Titel" };
		const result = await loadRoute(db, ROUTE_ID, async () =>
			jsonResponse(v2, { etag: '"v2"' }),
		);

		expect(result.status).toBe("fresh");
		const stored = await db.routeBundles.get(ROUTE_ID);
		expect(stored?.bundle.route.version).toBe(2);
		expect(stored?.etag).toBe('"v2"');
		expect(await db.routeBundles.count()).toBe(1);
		expect(await db.progress.get([ROUTE_ID, "goldenes-dachl"])).toMatchObject({
			state: "completed",
		});
	});

	it("AK-LOAD-05: picks up a station that became blocked", async () => {
		const db = testDb();
		await loadRoute(db, ROUTE_ID, async () =>
			jsonResponse(bundleFixture(), { etag: '"1"' }),
		);
		const blocked = bundleFixture();
		blocked.stationStates.annasaeule = {
			status: "blocked",
			reason: "Baustelle",
		};
		const result = await loadRoute(db, ROUTE_ID, async () =>
			jsonResponse(blocked, { etag: '"2"' }),
		);
		expect(result.bundle?.stationStates.annasaeule?.status).toBe("blocked");
		expect(
			(await db.routeBundles.get(ROUTE_ID))?.bundle.stationStates.annasaeule
				?.status,
		).toBe("blocked");
	});

	it.each([
		["a server error", () => new Response("boom", { status: 500 })],
		["not found", () => jsonResponse({ error: "not_found" }, { status: 404 })],
		["invalid json", () => new Response("<html>", { status: 200 })],
		[
			"a bundle that does not match the schema",
			() => jsonResponse({ route: {}, stationStates: {} }),
		],
	])("falls back to the cached bundle on %s", async (_name, respond) => {
		const db = testDb();
		await loadRoute(db, ROUTE_ID, async () =>
			jsonResponse(bundleFixture(), { etag: '"abc"' }),
		);
		const result = await loadRoute(db, ROUTE_ID, async () => respond());
		expect(result.status).toBe("cached");
		expect(result.bundle?.route.id).toBe(ROUTE_ID);
		expect((await db.routeBundles.get(ROUTE_ID))?.etag).toBe('"abc"');
	});

	it("never stores an invalid bundle", async () => {
		const db = testDb();
		const result = await loadRoute(db, ROUTE_ID, async () =>
			jsonResponse({ nope: true }),
		);
		expect(result.status).toBe("unavailable");
		expect(await db.routeBundles.count()).toBe(0);
	});
});
