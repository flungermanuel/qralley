import { totalXp } from "@qurally/shared";
import { describe, expect, it } from "vitest";
import { answerQuest, summarizeProgress } from "../src/data/quest";
import { bundleFixture, testDb } from "./helpers";

const ROUTE = "innsbruck-altstadt";

async function visit(db: ReturnType<typeof testDb>, stationId: string) {
	await db.progress.put({
		routeId: ROUTE,
		stationId,
		state: "visited",
		method: "scan",
		confirmed: false,
	});
}

describe("answerQuest", () => {
	it("AK-QUEST-01: the right option completes the station (provisional)", async () => {
		const db = testDb();
		const bundle = bundleFixture();
		await visit(db, "goldenes-dachl");

		const result = await answerQuest(db, bundle, "goldenes-dachl", "a");

		expect(result).toEqual({ status: "correct", xp: 40 });
		expect(await db.progress.get([ROUTE, "goldenes-dachl"])).toMatchObject({
			state: "completed",
			method: "scan",
			confirmed: false,
		});
		expect(totalXp(bundle.route.xpRules, await db.progress.toArray())).toBe(50);
	});

	it("AK-QUEST-02: a wrong answer changes nothing and can be repeated", async () => {
		const db = testDb();
		const bundle = bundleFixture();
		await visit(db, "goldenes-dachl");

		for (let i = 0; i < 3; i++) {
			expect(await answerQuest(db, bundle, "goldenes-dachl", "b")).toEqual({
				status: "incorrect",
			});
		}
		expect(await db.progress.get([ROUTE, "goldenes-dachl"])).toMatchObject({
			state: "visited",
		});
		expect((await answerQuest(db, bundle, "goldenes-dachl", "a")).status).toBe(
			"correct",
		);
	});

	it("AK-QUEST-05: text answers ignore case and surrounding whitespace", async () => {
		const db = testDb();
		await visit(db, "annasaeule");
		expect(
			(await answerQuest(db, bundleFixture(), "annasaeule", "  1706 ")).status,
		).toBe("correct");
	});

	it("AK-QUEST-03: an unvisited station cannot be answered", async () => {
		const db = testDb();
		expect(
			await answerQuest(db, bundleFixture(), "goldenes-dachl", "a"),
		).toEqual({
			status: "not_visited",
		});
		expect(await db.progress.count()).toBe(0);
	});

	it("an already completed station is not answered twice", async () => {
		const db = testDb();
		await visit(db, "goldenes-dachl");
		const bundle = bundleFixture();
		await answerQuest(db, bundle, "goldenes-dachl", "a");
		expect(await answerQuest(db, bundle, "goldenes-dachl", "a")).toEqual({
			status: "already_completed",
		});
	});

	it("a blocked station cannot be answered", async () => {
		const db = testDb();
		await visit(db, "annasaeule");
		const bundle = bundleFixture();
		bundle.stationStates.annasaeule = { status: "blocked", reason: null };
		expect(await answerQuest(db, bundle, "annasaeule", "1706")).toEqual({
			status: "blocked",
		});
		expect(await db.progress.get([ROUTE, "annasaeule"])).toMatchObject({
			state: "visited",
		});
	});

	it("an unknown station is rejected", async () => {
		expect(
			await answerQuest(testDb(), bundleFixture(), "nirgendwo", "a"),
		).toEqual({
			status: "unknown_station",
		});
	});
});

describe("summarizeProgress", () => {
	it("AK-XP-01: marks the total as provisional while anything is unconfirmed", () => {
		const bundle = bundleFixture();
		const summary = summarizeProgress(bundle, [
			{
				routeId: ROUTE,
				stationId: "goldenes-dachl",
				state: "completed",
				method: "scan",
				confirmed: true,
			},
			{
				routeId: ROUTE,
				stationId: "annasaeule",
				state: "visited",
				method: "scan",
				confirmed: false,
			},
		]);
		expect(summary).toEqual({ xp: 60, provisional: true });
	});

	it("is final when everything is confirmed, and ignores other routes", () => {
		const bundle = bundleFixture();
		const summary = summarizeProgress(bundle, [
			{
				routeId: ROUTE,
				stationId: "goldenes-dachl",
				state: "completed",
				method: "scan",
				confirmed: true,
			},
			{
				routeId: "andere",
				stationId: "x",
				state: "completed",
				method: "scan",
				confirmed: false,
			},
		]);
		expect(summary).toEqual({ xp: 50, provisional: false });
	});

	it("is zero without progress", () => {
		expect(summarizeProgress(bundleFixture(), [])).toEqual({
			xp: 0,
			provisional: false,
		});
	});
});
