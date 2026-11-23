import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { routeVersions, stationState } from "../src/db/schema";
import { canonicalHash, publishRoute } from "../src/domain/publish";
import { openTestDb, resetDb, validExampleRoute } from "./helpers";

const { db, close } = openTestDb();
afterAll(close);
beforeEach(() => resetDb(db));

describe("publishRoute", () => {
	it("AK-CLI-01: stores a new version with its content hash and seeds station states", async () => {
		const result = await publishRoute(db, validExampleRoute());
		expect(result).toEqual({ status: "published", version: 1 });

		const rows = await db.select().from(routeVersions);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);

		const states = await db.select().from(stationState);
		expect(states).toHaveLength(validExampleRoute().stations.length);
		expect(states.every((s) => s.status === "ok")).toBe(true);
	});

	it("AK-CLI-01: identical content does not create a new version", async () => {
		await publishRoute(db, validExampleRoute());
		const again = await publishRoute(db, validExampleRoute());
		expect(again).toEqual({ status: "unchanged", version: 1 });
		expect(await db.select().from(routeVersions)).toHaveLength(1);
	});

	it("rejects changed content without a version bump", async () => {
		await publishRoute(db, validExampleRoute());
		const edited = { ...validExampleRoute(), title: "Anders" };
		await expect(publishRoute(db, edited)).rejects.toThrow(/version/i);
		expect(await db.select().from(routeVersions)).toHaveLength(1);
	});

	it("publishes a bumped version and keeps existing station states", async () => {
		await publishRoute(db, validExampleRoute());
		await db
			.update(stationState)
			.set({ status: "blocked" })
			.where(eq(stationState.stationId, "annasaeule"));

		const base = validExampleRoute();
		const extra = structuredClone(base.stations[0]);
		if (!extra) throw new Error("fixture");
		extra.id = "neue-station";
		extra.location = { lat: 47.27, lng: 11.4 };
		const v2 = { ...base, version: 2, stations: [...base.stations, extra] };

		expect(await publishRoute(db, v2)).toEqual({
			status: "published",
			version: 2,
		});

		const states = Object.fromEntries(
			(await db.select().from(stationState)).map((s) => [
				s.stationId,
				s.status,
			]),
		);
		expect(states.annasaeule).toBe("blocked");
		expect(states["neue-station"]).toBe("ok");
	});
});

describe("canonicalHash", () => {
	it("does not depend on key order", () => {
		const a = validExampleRoute();
		const reordered = {
			...Object.fromEntries(Object.entries(a).reverse()),
		} as typeof a;
		expect(canonicalHash(reordered)).toBe(canonicalHash(a));
	});

	it("changes when content changes", () => {
		const a = validExampleRoute();
		expect(canonicalHash({ ...a, title: "x" })).not.toBe(canonicalHash(a));
	});
});
