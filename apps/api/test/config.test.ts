import { describe, expect, it } from "vitest";
import { loadAlertThresholds } from "../src/config";

describe("loadAlertThresholds", () => {
	it("AK-REP-11: without variables the defaults 3 and 2 apply", () => {
		expect(loadAlertThresholds({})).toEqual({
			minReporters: 3,
			minUnsafeReporters: 2,
		});
	});

	it("AK-REP-11: valid variables are read as integers", () => {
		expect(
			loadAlertThresholds({
				REPORT_ALERT_MIN_REPORTERS: "5",
				REPORT_ALERT_MIN_UNSAFE_REPORTERS: "1",
			}),
		).toEqual({ minReporters: 5, minUnsafeReporters: 1 });
	});

	it("AK-REP-11: one variable set, the other keeps its default", () => {
		expect(loadAlertThresholds({ REPORT_ALERT_MIN_REPORTERS: "10" })).toEqual({
			minReporters: 10,
			minUnsafeReporters: 2,
		});
	});

	it.each([
		"0",
		"11",
		"abc",
		"2.5",
		"-1",
		"",
		" ",
		"1e1",
		"3x",
		" 5",
		"5 ",
		"+3",
		"0x5",
	])(
		"AK-REP-11: invalid REPORT_ALERT_MIN_REPORTERS %j aborts loading",
		(value) => {
			expect(() =>
				loadAlertThresholds({ REPORT_ALERT_MIN_REPORTERS: value }),
			).toThrow(/REPORT_ALERT_MIN_REPORTERS/);
		},
	);

	it.each(["0", "11", "abc", "2.5", ""])(
		"AK-REP-11: invalid REPORT_ALERT_MIN_UNSAFE_REPORTERS %j aborts loading",
		(value) => {
			expect(() =>
				loadAlertThresholds({ REPORT_ALERT_MIN_UNSAFE_REPORTERS: value }),
			).toThrow(/REPORT_ALERT_MIN_UNSAFE_REPORTERS/);
		},
	);
});
