import { describe, expect, it } from "vitest";
import { validateRoute } from "../src/index";
import { exampleRoute } from "./fixtures";

function errorPaths(input: unknown): string[] {
	const result = validateRoute(input);
	return result.ok ? [] : result.errors.map((e) => e.path);
}

describe("route validation", () => {
	it("AK-ROUTE-01: accepts a valid route", () => {
		expect(validateRoute(exampleRoute()).ok).toBe(true);
	});

	it("AK-ROUTE-02: rejects duplicate station ids", () => {
		const r = exampleRoute();
		r.stations[1].id = r.stations[0].id;
		expect(errorPaths(r)).toContain("stations[1].id");
	});

	it("AK-ROUTE-03: rejects a station without quest", () => {
		const r = exampleRoute();
		delete r.stations[0].quest;
		expect(errorPaths(r)).toContain("stations[0].quest");
	});

	it("AK-ROUTE-03: rejects a station without location", () => {
		const r = exampleRoute();
		delete r.stations[2].location;
		expect(errorPaths(r)).toContain("stations[2].location");
	});

	it("AK-ROUTE-04: rejects a location outside the region bbox", () => {
		const r = exampleRoute();
		r.stations[0].location = { lat: 48.2, lng: 16.37 };
		expect(errorPaths(r)).toContain("stations[0].location");
	});

	it.each(["alpine", "trail", "water", ""])(
		"AK-ROUTE-05: rejects terrain %j",
		(terrain) => {
			const r = exampleRoute();
			r.stations[0].terrain = terrain;
			expect(errorPaths(r)).toContain("stations[0].terrain");
		},
	);

	it.each([undefined, "", "   "])(
		"AK-ROUTE-06: rejects safetyNote %j",
		(note) => {
			const r = exampleRoute();
			r.stations[0].safetyNote = note;
			expect(errorPaths(r)).toContain("stations[0].safetyNote");
		},
	);

	it("AK-ROUTE-07: rejects a fallback question equal to the quest prompt", () => {
		const r = exampleRoute();
		r.stations[0].fallback.question.prompt = r.stations[0].quest.prompt;
		expect(errorPaths(r)).toContain("stations[0].fallback.question.prompt");
	});

	it("AK-ROUTE-07: requires a question when fallback is enabled", () => {
		const r = exampleRoute();
		delete r.stations[0].fallback.question;
		expect(errorPaths(r)).toContain("stations[0].fallback.question");
	});

	it("AK-ROUTE-08: rejects a choice answer that is no option id", () => {
		const r = exampleRoute();
		r.stations[0].quest.answer = "z";
		expect(errorPaths(r)).toContain("stations[0].quest.answer");
	});

	it("rejects a choice quest with fewer than two options", () => {
		const r = exampleRoute();
		r.stations[0].quest.options = [{ id: "a", label: "Golden" }];
		expect(errorPaths(r)).toContain("stations[0].quest.options");
	});

	it("rejects stations closer than 15 m", () => {
		const r = exampleRoute();
		r.stations[1].location = {
			lat: r.stations[0].location.lat + 0.00005,
			lng: r.stations[0].location.lng,
		};
		expect(errorPaths(r)).toContain("stations[1].location");
	});

	it("rejects fallback radius outside 20..100 m", () => {
		for (const radiusM of [19, 101]) {
			const r = exampleRoute();
			r.stations[0].fallback.radiusM = radiusM;
			expect(errorPaths(r)).toContain("stations[0].fallback.radiusM");
		}
	});

	it("rejects fallbackXpFactor outside 0..1 and negative xp", () => {
		const a = exampleRoute();
		a.xpRules.fallbackXpFactor = 1.5;
		expect(errorPaths(a)).toContain("xpRules.fallbackXpFactor");
		const b = exampleRoute();
		b.xpRules.scanXp = -1;
		expect(errorPaths(b)).toContain("xpRules.scanXp");
	});

	it("rejects an unknown schemaVersion", () => {
		const r = exampleRoute();
		r.schemaVersion = 2;
		expect(errorPaths(r)).toContain("schemaVersion");
	});

	it("warns (but accepts) fewer than 3 stations and missing explanation", () => {
		const r = exampleRoute();
		r.stations = r.stations.slice(0, 2);
		delete r.stations[0].quest.explanation;
		const result = validateRoute(r);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.warnings.map((w) => w.path)).toEqual(
				expect.arrayContaining(["stations", "stations[0].quest.explanation"]),
			);
		}
	});

	it("rejects non-object input without throwing", () => {
		for (const input of [null, undefined, 42, "x", []]) {
			expect(validateRoute(input).ok).toBe(false);
		}
	});

	it("AK-ROUTE-09: the example route in the repo passes without warnings", () => {
		const result = validateRoute(exampleRoute());
		expect(result.ok && result.warnings).toEqual([]);
	});
});
