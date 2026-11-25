import { describe, expect, it } from "vitest";
import {
	type AlertThresholds,
	alertThresholdsSchema,
	countReporters,
	DEFAULT_ALERT_THRESHOLDS,
	type ReporterCounts,
	reportAlertCrossed,
} from "../src/index";

type R = Parameters<typeof countReporters>[0][number];
const r = (playerId: string | null, kind: R["kind"] = "other"): R => ({
	playerId,
	kind,
});

describe("countReporters", () => {
	it("AK-REP-03: several reports of one player count as one reporter", () => {
		expect(
			countReporters([
				r("p1", "unsafe"),
				r("p1", "unsafe"),
				r("p1", "code_missing"),
			]),
		).toEqual({ all: 1, unsafe: 1 });
	});

	it("AK-REP-03: different players count separately, unsafe counted on its own", () => {
		expect(
			countReporters([r("p1", "unsafe"), r("p2", "other"), r("p3", "unsafe")]),
		).toEqual({ all: 3, unsafe: 2 });
	});

	it("AK-REP-03: a player with unsafe and other reports counts once in each counter", () => {
		expect(countReporters([r("p1", "other"), r("p1", "unsafe")])).toEqual({
			all: 1,
			unsafe: 1,
		});
	});

	it("AK-REP-03: reports without player (deleted player) each count as own reporter", () => {
		expect(
			countReporters([r(null, "unsafe"), r(null, "unsafe"), r(null, "other")]),
		).toEqual({ all: 3, unsafe: 2 });
	});

	it("AK-REP-03: null reports and a real player never merge", () => {
		expect(countReporters([r(null), r("p1"), r(null)])).toEqual({
			all: 3,
			unsafe: 0,
		});
	});

	it("AK-REP-03: no reports give zero counts", () => {
		expect(countReporters([])).toEqual({ all: 0, unsafe: 0 });
	});
});

describe("reportAlertCrossed", () => {
	const th: AlertThresholds = { minReporters: 3, minUnsafeReporters: 2 };
	const c = (all: number, unsafe: number): ReporterCounts => ({ all, unsafe });

	const cases: [string, ReporterCounts, ReporterCounts, boolean][] = [
		["below on both paths", c(0, 0), c(1, 0), false],
		["total path just below threshold", c(1, 0), c(2, 0), false],
		["total path reaches threshold exactly", c(2, 0), c(3, 0), true],
		["total path already above, no second alarm", c(3, 0), c(4, 0), false],
		["total path jumps over the threshold", c(1, 0), c(5, 0), true],
		["unsafe path below threshold", c(1, 1), c(2, 1), false],
		["unsafe path reaches threshold exactly", c(1, 1), c(2, 2), true],
		["unsafe path already above, no second alarm", c(2, 2), c(3, 3), false],
		["both paths reached at once yield one alarm", c(2, 1), c(3, 2), true],
		[
			"total already crossed, unsafe crosses later: no second alarm",
			c(3, 1),
			c(4, 2),
			false,
		],
		[
			"unsafe already crossed, total crosses later: no second alarm",
			c(2, 2),
			c(3, 2),
			false,
		],
		["nothing changed", c(2, 1), c(2, 1), false],
		[
			"unsafe crosses while total is unchanged (same player escalates)",
			c(2, 1),
			c(2, 2),
			true,
		],
		["falling total never alarms", c(3, 0), c(2, 0), false],
		["falling unsafe count never alarms", c(2, 2), c(2, 1), false],
	];

	it.each(cases)("AK-REP-08: %s", (_name, before, after, expected) => {
		expect(reportAlertCrossed(before, after, th)).toBe(expected);
	});

	it("AK-REP-08: respects configured thresholds", () => {
		const strict: AlertThresholds = { minReporters: 1, minUnsafeReporters: 10 };
		expect(reportAlertCrossed(c(0, 0), c(1, 0), strict)).toBe(true);
		expect(reportAlertCrossed(c(1, 1), c(2, 2), strict)).toBe(false);
		// unsafe path with configured thresholds: 4 -> 5 unsafe reporters reaches 5 (total stays below 10)
		const lenient: AlertThresholds = {
			minReporters: 10,
			minUnsafeReporters: 5,
		};
		expect(reportAlertCrossed(c(4, 4), c(5, 5), lenient)).toBe(true);
		expect(reportAlertCrossed(c(3, 3), c(4, 4), lenient)).toBe(false);
	});
});

describe("alertThresholdsSchema", () => {
	it("AK-REP-11: defaults are 3 and 2", () => {
		expect(DEFAULT_ALERT_THRESHOLDS).toEqual({
			minReporters: 3,
			minUnsafeReporters: 2,
		});
		expect(alertThresholdsSchema.parse({})).toEqual({
			minReporters: 3,
			minUnsafeReporters: 2,
		});
	});

	it.each([1, 5, 10])("AK-REP-11: accepts integer %i", (n) => {
		expect(
			alertThresholdsSchema.parse({ minReporters: n, minUnsafeReporters: n }),
		).toEqual({ minReporters: n, minUnsafeReporters: n });
	});

	it.each([
		["zero", 0],
		["eleven", 11],
		["negative", -1],
		["decimal", 2.5],
		["string", "abc"],
		["NaN", Number.NaN],
		["null", null],
	])("AK-REP-11: rejects %s for minReporters", (_n, value) => {
		expect(
			alertThresholdsSchema.safeParse({ minReporters: value }).success,
		).toBe(false);
	});

	it.each([0, 11, 1.5, "x"])(
		"AK-REP-11: rejects %s for minUnsafeReporters",
		(value) => {
			expect(
				alertThresholdsSchema.safeParse({ minUnsafeReporters: value }).success,
			).toBe(false);
		},
	);
});
