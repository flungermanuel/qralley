import { describe, expect, it } from "vitest";
import { queueReport } from "../src/data/report";
import { bundleFixture, testDb } from "./helpers";

const ROUTE = "innsbruck-altstadt";

describe("queueReport", () => {
	it("AK-REP-06: queues a report in the outbox (works offline)", async () => {
		const db = testDb();
		const result = await queueReport(
			db,
			bundleFixture(),
			"annasaeule",
			"unsafe",
		);
		expect(result).toEqual({ status: "queued" });

		const [entry] = await db.outbox.toArray();
		expect(entry?.event).toMatchObject({
			type: "report",
			routeId: ROUTE,
			stationId: "annasaeule",
			kind: "unsafe",
		});
		expect(entry?.event).not.toHaveProperty("note");
	});

	it("stores a trimmed note", async () => {
		const db = testDb();
		await queueReport(
			db,
			bundleFixture(),
			"annasaeule",
			"code_missing",
			"  Aufkleber ist ab  ",
		);
		expect((await db.outbox.toArray())[0]?.event).toMatchObject({
			note: "Aufkleber ist ab",
		});
	});

	it("treats a blank note as no note", async () => {
		const db = testDb();
		await queueReport(db, bundleFixture(), "annasaeule", "other", "   ");
		expect((await db.outbox.toArray())[0]?.event).not.toHaveProperty("note");
	});

	it("AK-REP-07: refuses notes longer than 200 characters", async () => {
		const db = testDb();
		expect(
			await queueReport(
				db,
				bundleFixture(),
				"annasaeule",
				"other",
				"x".repeat(201),
			),
		).toEqual({
			status: "note_too_long",
		});
		expect(await db.outbox.count()).toBe(0);
	});

	it("accepts a note of exactly 200 characters", async () => {
		const db = testDb();
		expect(
			(
				await queueReport(
					db,
					bundleFixture(),
					"annasaeule",
					"other",
					"x".repeat(200),
				)
			).status,
		).toBe("queued");
	});

	it("does not queue the same report twice while one is still waiting", async () => {
		const db = testDb();
		await queueReport(db, bundleFixture(), "annasaeule", "unsafe");
		expect(
			await queueReport(db, bundleFixture(), "annasaeule", "unsafe"),
		).toEqual({ status: "already_pending" });
		expect(await db.outbox.count()).toBe(1);
	});

	it("different kinds or stations are separate reports", async () => {
		const db = testDb();
		await queueReport(db, bundleFixture(), "annasaeule", "unsafe");
		await queueReport(db, bundleFixture(), "annasaeule", "other");
		await queueReport(db, bundleFixture(), "hofkirche", "unsafe");
		expect(await db.outbox.count()).toBe(3);
	});

	it("rejects unknown stations", async () => {
		const db = testDb();
		expect(
			await queueReport(db, bundleFixture(), "nirgendwo", "unsafe"),
		).toEqual({ status: "unknown_station" });
		expect(await db.outbox.count()).toBe(0);
	});

	it("does not touch the progress of the station", async () => {
		const db = testDb();
		await queueReport(db, bundleFixture(), "annasaeule", "unsafe");
		expect(await db.progress.count()).toBe(0);
	});
});
