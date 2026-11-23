import { describe, expect, it } from "vitest";
import { distanceM } from "../src/index";

describe("distanceM", () => {
	it("is 0 for identical points", () => {
		expect(
			distanceM({ lat: 47.27, lng: 11.39 }, { lat: 47.27, lng: 11.39 }),
		).toBe(0);
	});

	it("is about 111 km per degree of latitude", () => {
		const d = distanceM({ lat: 47, lng: 11 }, { lat: 48, lng: 11 });
		expect(d).toBeGreaterThan(111_000);
		expect(d).toBeLessThan(111_400);
	});
});
