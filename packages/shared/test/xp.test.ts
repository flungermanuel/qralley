import { describe, expect, it } from "vitest";
import { type StationProgress, stationXp, totalXp } from "../src/index";

const rules = { scanXp: 10, questXp: 40, fallbackXpFactor: 0.5 };

describe("stationXp", () => {
	it("AK-SCAN-01: a visited station gives scanXp only", () => {
		expect(
			stationXp(rules, { stationId: "a", state: "visited", method: "scan" }),
		).toBe(10);
	});

	it("AK-QUEST-01: a completed scan station gives scanXp + questXp", () => {
		expect(
			stationXp(rules, { stationId: "a", state: "completed", method: "scan" }),
		).toBe(50);
	});

	it("AK-FALL-01: a completed fallback station gives 50 % of the full XP", () => {
		expect(
			stationXp(rules, {
				stationId: "a",
				state: "completed",
				method: "fallback",
			}),
		).toBe(25);
	});

	it("rounds fallback XP down to whole numbers", () => {
		const odd = { scanXp: 5, questXp: 10, fallbackXpFactor: 0.5 }; // 7.5
		expect(
			stationXp(odd, {
				stationId: "a",
				state: "completed",
				method: "fallback",
			}),
		).toBe(7);
	});

	it("AK-XP-05: is never negative and always an integer", () => {
		for (const factor of [0, 0.33, 0.5, 0.99, 1]) {
			for (const scanXp of [0, 1, 7, 10]) {
				const xp = stationXp(
					{ scanXp, questXp: 3, fallbackXpFactor: factor },
					{ stationId: "a", state: "completed", method: "fallback" },
				);
				expect(Number.isInteger(xp)).toBe(true);
				expect(xp).toBeGreaterThanOrEqual(0);
			}
		}
	});
});

describe("totalXp", () => {
	const progress: StationProgress[] = [
		{ stationId: "a", state: "completed", method: "scan" },
		{ stationId: "b", state: "visited", method: "scan" },
		{ stationId: "c", state: "completed", method: "fallback" },
	];

	it("sums the XP of all stations", () => {
		expect(totalXp(rules, progress)).toBe(50 + 10 + 25);
	});

	it("AK-XP-04: does not depend on the order", () => {
		expect(totalXp(rules, [...progress].reverse())).toBe(
			totalXp(rules, progress),
		);
	});

	it("is 0 without progress", () => {
		expect(totalXp(rules, [])).toBe(0);
	});

	it("AK-XP-03: counts each station at most once", () => {
		const dup = [
			...progress,
			{ stationId: "a", state: "completed", method: "scan" } as const,
		];
		expect(totalXp(rules, dup)).toBe(totalXp(rules, progress));
	});
});
