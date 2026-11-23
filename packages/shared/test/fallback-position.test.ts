import { describe, expect, it } from "vitest";
import { checkFallbackPosition, distanceM } from "../src/index";

const station = { lat: 47.2685, lng: 11.3933 };

/** A point roughly `meters` north of the station. */
const north = (meters: number) => ({
	lat: station.lat + meters / 111_195,
	lng: station.lng,
});

describe("checkFallbackPosition", () => {
	it("AK-FALL-01: accepts a precise position inside the radius", () => {
		expect(
			checkFallbackPosition(station, 40, { ...north(10), accuracyM: 12 }),
		).toEqual({ ok: true });
	});

	it("AK-FALL-02: rejects a position outside the radius", () => {
		expect(
			checkFallbackPosition(station, 40, { ...north(60), accuracyM: 10 }),
		).toEqual({
			ok: false,
			reason: "too_far",
		});
	});

	it("accepts a position exactly on the radius", () => {
		const p = north(40);
		const radius = distanceM(station, p);
		expect(
			checkFallbackPosition(station, radius, { ...p, accuracyM: 10 }),
		).toEqual({ ok: true });
	});

	it("AK-FALL-03: accepts accuracy 50 m but rejects 51 m", () => {
		expect(
			checkFallbackPosition(station, 40, { ...north(5), accuracyM: 50 }).ok,
		).toBe(true);
		expect(
			checkFallbackPosition(station, 40, { ...north(5), accuracyM: 51 }),
		).toEqual({
			ok: false,
			reason: "accuracy_too_low",
		});
	});

	it("reports poor accuracy before distance (so the player can retry)", () => {
		expect(
			checkFallbackPosition(station, 40, { ...north(500), accuracyM: 200 }),
		).toEqual({
			ok: false,
			reason: "accuracy_too_low",
		});
	});

	it("rejects invalid numbers", () => {
		for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
			expect(
				checkFallbackPosition(station, 40, { ...station, accuracyM: bad }).ok,
			).toBe(false);
		}
		expect(
			checkFallbackPosition(station, 40, {
				lat: Number.NaN,
				lng: 11,
				accuracyM: 5,
			}).ok,
		).toBe(false);
	});
});
