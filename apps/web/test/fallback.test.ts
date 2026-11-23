import { describe, expect, it } from "vitest";
import { answerFallback, checkFallbackLocation } from "../src/data/fallback";
import { bundleFixture, NEAR_DACHL, testDb } from "./helpers";

const ROUTE = "innsbruck-altstadt";
const G = "goldenes-dachl"; // fallback: text "3", radius 40 m
const A = "annasaeule"; // fallback: choice "a"
const H = "hofkirche"; // no fallback
const FAR = { lat: 47.2695, lng: 11.3933, accuracyM: 10 }; // ~110 m north of the Dachl

describe("checkFallbackLocation", () => {
	it("AK-FALL-01: accepts a precise position inside the radius", () => {
		expect(checkFallbackLocation(bundleFixture(), G, NEAR_DACHL)).toEqual({
			ok: true,
		});
	});

	it("AK-FALL-02: rejects a position outside the radius", () => {
		expect(checkFallbackLocation(bundleFixture(), G, FAR)).toEqual({
			ok: false,
			reason: "too_far",
		});
	});

	it("AK-FALL-03: rejects poor accuracy", () => {
		expect(
			checkFallbackLocation(bundleFixture(), G, {
				...NEAR_DACHL,
				accuracyM: 80,
			}),
		).toEqual({
			ok: false,
			reason: "accuracy_too_low",
		});
	});

	it("AK-FALL-09: a station without fallback has none to check", () => {
		expect(checkFallbackLocation(bundleFixture(), H, NEAR_DACHL)).toEqual({
			ok: false,
			reason: "fallback_disabled",
		});
	});

	it("rejects unknown stations", () => {
		expect(
			checkFallbackLocation(bundleFixture(), "nirgendwo", NEAR_DACHL),
		).toEqual({
			ok: false,
			reason: "unknown_station",
		});
	});
});

describe("answerFallback", () => {
	it("AK-FALL-01: inside the radius with the right answer completes the station with reduced XP", async () => {
		const db = testDb();
		const result = await answerFallback(
			db,
			bundleFixture(),
			G,
			NEAR_DACHL,
			"3",
		);

		expect(result).toEqual({ status: "completed", xp: 25 });
		expect(await db.progress.get([ROUTE, G])).toEqual({
			routeId: ROUTE,
			stationId: G,
			state: "completed",
			method: "fallback",
			confirmed: false,
		});
	});

	it("AK-FALL-07: works without any network, the check happens on the server later", async () => {
		const db = testDb();
		await answerFallback(
			db,
			bundleFixture(),
			A,
			{ lat: 47.264, lng: 11.3947, accuracyM: 8 },
			"a",
		);
		const [entry] = await db.outbox.toArray();
		expect(entry?.event).toMatchObject({
			type: "fallback_checkin",
			routeId: ROUTE,
			stationId: A,
			answer: "a",
			position: { lat: 47.264, lng: 11.3947, accuracyM: 8 },
		});
		expect(entry?.id).toBe(entry?.event.id);
	});

	it("AK-FALL-02: a position outside the radius records nothing", async () => {
		const db = testDb();
		expect(await answerFallback(db, bundleFixture(), G, FAR, "3")).toEqual({
			status: "too_far",
		});
		expect(await db.progress.count()).toBe(0);
		expect(await db.outbox.count()).toBe(0);
	});

	it("AK-FALL-03: poor accuracy records nothing", async () => {
		const db = testDb();
		const result = await answerFallback(
			db,
			bundleFixture(),
			G,
			{ ...NEAR_DACHL, accuracyM: 80 },
			"3",
		);
		expect(result).toEqual({ status: "accuracy_too_low" });
		expect(await db.outbox.count()).toBe(0);
	});

	it("a wrong answer records nothing and can be retried", async () => {
		const db = testDb();
		expect(
			await answerFallback(db, bundleFixture(), G, NEAR_DACHL, "99"),
		).toEqual({ status: "incorrect" });
		expect(await db.progress.count()).toBe(0);
		expect(
			(await answerFallback(db, bundleFixture(), G, NEAR_DACHL, "3")).status,
		).toBe("completed");
	});

	it("the regular quest answer is not accepted as fallback answer", async () => {
		const db = testDb();
		expect(
			await answerFallback(db, bundleFixture(), G, NEAR_DACHL, "a"),
		).toEqual({ status: "incorrect" });
	});

	it("AK-FALL-08: a station that already has progress is not completed again", async () => {
		const db = testDb();
		await db.progress.put({
			routeId: ROUTE,
			stationId: G,
			state: "completed",
			method: "scan",
			confirmed: true,
		});
		expect(
			await answerFallback(db, bundleFixture(), G, NEAR_DACHL, "3"),
		).toEqual({ status: "already_done" });
		expect(await db.outbox.count()).toBe(0);
	});

	it("AK-FALL-09: a station without fallback is rejected", async () => {
		const db = testDb();
		const result = await answerFallback(
			db,
			bundleFixture(),
			H,
			{ lat: 47.2687, lng: 11.3957, accuracyM: 5 },
			"x",
		);
		expect(result).toEqual({ status: "fallback_disabled" });
		expect(await db.progress.count()).toBe(0);
	});

	it("a blocked station is rejected", async () => {
		const db = testDb();
		const bundle = bundleFixture();
		bundle.stationStates[G] = { status: "blocked", reason: null };
		expect(await answerFallback(db, bundle, G, NEAR_DACHL, "3")).toEqual({
			status: "blocked",
		});
	});

	it("progress and outbox entry are written atomically", async () => {
		const db = testDb();
		const { vi } = await import("vitest");
		vi.spyOn(db.outbox, "add").mockRejectedValue(new Error("disk full"));
		await expect(
			answerFallback(db, bundleFixture(), G, NEAR_DACHL, "3"),
		).rejects.toThrow("disk full");
		expect(await db.progress.count()).toBe(0);
	});
});
