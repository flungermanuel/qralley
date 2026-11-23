import { totalXp } from "@qurally/shared";
import { describe, expect, it } from "vitest";
import { processScan } from "../src/data/scan";
import { bundleFixture, qrUrl, testDb, tokenFor } from "./helpers";

const ROUTE = "innsbruck-altstadt";
const rows = (db: ReturnType<typeof testDb>) => db.progress.toArray();

describe("processScan", () => {
	it("AK-SCAN-01: a well-formed token of a route station marks it visited (provisional)", async () => {
		const db = testDb();
		const bundle = bundleFixture();
		const outcome = await processScan(
			db,
			bundle,
			qrUrl(tokenFor("goldenes-dachl")),
		);

		expect(outcome).toEqual({
			kind: "visited",
			stationId: "goldenes-dachl",
			xp: 10,
		});
		const [row] = await rows(db);
		expect(row).toEqual({
			routeId: ROUTE,
			stationId: "goldenes-dachl",
			state: "visited",
			method: "scan",
			confirmed: false,
		});
		expect(totalXp(bundle.route.xpRules, await rows(db))).toBe(10);
	});

	it("accepts the bare token as well as the URL", async () => {
		const db = testDb();
		const outcome = await processScan(
			db,
			bundleFixture(),
			tokenFor("annasaeule"),
		);
		expect(outcome.kind).toBe("visited");
	});

	it.each([
		["a foreign url", "https://example.org/hello"],
		["plain text", "hello world"],
		["a wifi code", "WIFI:S:cafe;T:WPA;P:secret;;"],
		["an empty string", ""],
		["a token-looking string with bad structure", "q1.abc.def"],
	])(
		"AK-SCAN-07: %s is not a qurally code and changes nothing",
		async (_name, text) => {
			const db = testDb();
			expect(await processScan(db, bundleFixture(), text)).toEqual({
				kind: "foreign",
			});
			expect(await rows(db)).toHaveLength(0);
		},
	);

	it("AK-SCAN-03: a token of another route is rejected", async () => {
		const db = testDb();
		const outcome = await processScan(
			db,
			bundleFixture(),
			tokenFor("goldenes-dachl", { routeId: "andere-route" }),
		);
		expect(outcome).toEqual({ kind: "wrong_route" });
		expect(await rows(db)).toHaveLength(0);
	});

	it("rejects a token for a station that is not in the route", async () => {
		const db = testDb();
		const outcome = await processScan(
			db,
			bundleFixture(),
			tokenFor("geisterstation"),
		);
		expect(outcome).toEqual({ kind: "invalid_code" });
		expect(await rows(db)).toHaveLength(0);
	});

	it("rejects a code with a retired key version", async () => {
		const db = testDb();
		const outcome = await processScan(
			db,
			bundleFixture(),
			tokenFor("goldenes-dachl", { keyVersion: 2 }),
		);
		expect(outcome).toEqual({ kind: "invalid_code" });
		expect(await rows(db)).toHaveLength(0);
	});

	it("AK-SCAN-06: a blocked station cannot be visited", async () => {
		const db = testDb();
		const bundle = bundleFixture();
		bundle.stationStates.annasaeule = { status: "blocked", reason: null };
		const outcome = await processScan(db, bundle, tokenFor("annasaeule"));
		expect(outcome).toEqual({ kind: "blocked", stationId: "annasaeule" });
		expect(await rows(db)).toHaveLength(0);
	});

	it("a reported station can still be visited", async () => {
		const db = testDb();
		const bundle = bundleFixture();
		bundle.stationStates.annasaeule = {
			status: "reported",
			reason: "report:code_damaged",
		};
		expect((await processScan(db, bundle, tokenFor("annasaeule"))).kind).toBe(
			"visited",
		);
	});

	it("AK-SCAN-05: scanning a visited station again gives no more XP", async () => {
		const db = testDb();
		const bundle = bundleFixture();
		await processScan(db, bundle, tokenFor("goldenes-dachl"));
		const again = await processScan(db, bundle, tokenFor("goldenes-dachl"));
		expect(again).toEqual({ kind: "duplicate", stationId: "goldenes-dachl" });
		expect(await rows(db)).toHaveLength(1);
		expect(totalXp(bundle.route.xpRules, await rows(db))).toBe(10);
	});

	it("does not downgrade a completed station", async () => {
		const db = testDb();
		await db.progress.put({
			routeId: ROUTE,
			stationId: "goldenes-dachl",
			state: "completed",
			method: "scan",
			confirmed: true,
		});
		const outcome = await processScan(
			db,
			bundleFixture(),
			tokenFor("goldenes-dachl"),
		);
		expect(outcome.kind).toBe("duplicate");
		expect((await rows(db))[0]).toMatchObject({
			state: "completed",
			confirmed: true,
		});
	});

	it("AK-SCAN-02 (documented limit): the client cannot verify signatures, the server decides at sync", async () => {
		const db = testDb();
		const outcome = await processScan(
			db,
			bundleFixture(),
			tokenFor("goldenes-dachl"),
		);
		expect(outcome.kind).toBe("visited");
	});
});
