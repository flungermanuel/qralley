import { describe, expect, it } from "vitest";
import { isRouteComplete, type StationProgress } from "../src/index";

const stations = ["a", "b", "c"];
const done = (stationId: string): StationProgress => ({
	stationId,
	state: "completed",
	method: "scan",
});

describe("isRouteComplete", () => {
	it("AK-BADGE-01: is true when all unblocked stations are completed", () => {
		expect(
			isRouteComplete(stations, new Set(), [done("a"), done("b"), done("c")]),
		).toBe(true);
	});

	it("is false while a station is missing or only visited", () => {
		expect(isRouteComplete(stations, new Set(), [done("a"), done("b")])).toBe(
			false,
		);
		expect(
			isRouteComplete(stations, new Set(), [
				done("a"),
				done("b"),
				{ stationId: "c", state: "visited", method: "scan" },
			]),
		).toBe(false);
	});

	it("AK-BADGE-02: ignores blocked stations", () => {
		expect(
			isRouteComplete(stations, new Set(["c"]), [done("a"), done("b")]),
		).toBe(true);
	});

	it("is false when every station is blocked", () => {
		expect(isRouteComplete(stations, new Set(stations), [])).toBe(false);
	});

	it("ignores progress for stations that are not part of the route", () => {
		expect(
			isRouteComplete(stations, new Set(), [done("a"), done("b"), done("x")]),
		).toBe(false);
	});

	it("is false for a route without stations", () => {
		expect(isRouteComplete([], new Set(), [])).toBe(false);
	});
});
