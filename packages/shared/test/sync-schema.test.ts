import { describe, expect, it } from "vitest";
import { syncEventSchema } from "../src/index";

const base = {
	id: "5b2f0b2e-7c1c-4f3a-9a53-0b3e8e3a1c11",
	type: "report",
	routeId: "r",
	stationId: "s",
	kind: "other",
};

describe("report note characters (review finding 6)", () => {
	it("rejects NUL and other control characters", () => {
		for (const note of ["a\u0000b", "x\u0001", "\u001f", "a\u007fb"]) {
			expect(
				syncEventSchema.safeParse({ ...base, note }).success,
				JSON.stringify(note),
			).toBe(false);
		}
	});

	it("allows normal text, umlauts, emoji, tabs and line breaks", () => {
		for (const note of [
			"Aufkleber ist ab",
			"Größe überprüfen 👍",
			"a\tb",
			"zeile 1\nzeile 2",
		]) {
			expect(
				syncEventSchema.safeParse({ ...base, note }).success,
				JSON.stringify(note),
			).toBe(true);
		}
	});
});
