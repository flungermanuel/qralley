import { describe, expect, it } from "vitest";
import {
	base64urlDecode,
	base64urlEncode,
	formatToken,
	parseToken,
	tokenFromQrText,
} from "../src/index";

const payload = {
	routeId: "innsbruck-altstadt",
	stationId: "goldenes-dachl",
	keyVersion: 1,
};
const mac = new Uint8Array(16).map((_, i) => i * 7 + 1);

describe("base64url", () => {
	it("round-trips arbitrary bytes", () => {
		const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
		expect(base64urlDecode(base64urlEncode(bytes))).toEqual(bytes);
	});

	it("uses the URL-safe alphabet without padding", () => {
		expect(base64urlEncode(new Uint8Array([251, 255, 254]))).toBe("-__-");
		expect(base64urlEncode(new Uint8Array([1]))).toBe("AQ");
	});

	it("rejects non-canonical input (stray padding, bad chars, spare bits)", () => {
		expect(base64urlDecode("AQ==")).toBeNull();
		expect(base64urlDecode("A+Q")).toBeNull();
		expect(base64urlDecode("A")).toBeNull();
		expect(base64urlDecode("AR")).toBeNull(); // same bytes as "AQ", spare bits differ
	});
});

describe("formatToken / parseToken", () => {
	it("AK-TOKEN-01: round-trips payload and mac", () => {
		const parsed = parseToken(formatToken(payload, mac));
		expect(parsed).toEqual({
			ok: true,
			payload,
			signedPayload: "innsbruck-altstadt:goldenes-dachl:1",
			mac,
		});
	});

	it("starts with the q1 prefix and has three dot-separated parts", () => {
		const parts = formatToken(payload, mac).split(".");
		expect(parts).toHaveLength(3);
		expect(parts[0]).toBe("q1");
	});

	it("stays short enough for a small QR code", () => {
		expect(formatToken(payload, mac).length).toBeLessThan(110);
	});

	it.each([
		["empty", ""],
		["wrong prefix", "q2.abc.def"],
		["no parts", "q1"],
		["too many parts", "q1.a.b.c"],
		["bad base64", "q1.!!!.@@@"],
		["too long", `q1.${"A".repeat(400)}.AAAA`],
		["whitespace", " q1.AAAA.AAAA "],
	])("AK-TOKEN-04: rejects %s without throwing", (_name, input) => {
		expect(parseToken(input)).toEqual({ ok: false, reason: "malformed" });
	});

	it("AK-TOKEN-04: rejects a mac of the wrong length", () => {
		expect(parseToken(formatToken(payload, mac.slice(0, 8))).ok).toBe(false);
	});

	it.each([
		["missing part", "a:b"],
		["non-slug route", "Route:b:1"],
		["non-slug station", "a:b c:1"],
		["leading zero version", "a:b:01"],
		["zero version", "a:b:0"],
		["non-numeric version", "a:b:x"],
		["extra part", "a:b:1:2"],
	])("rejects payload with %s", (_name, p) => {
		const token = `q1.${base64urlEncode(new TextEncoder().encode(p))}.${base64urlEncode(mac)}`;
		expect(parseToken(token).ok).toBe(false);
	});
});

describe("tokenFromQrText", () => {
	const token = formatToken(payload, mac);

	it("AK-SCAN-09: extracts the token from a /q/<token> URL on any host", () => {
		expect(tokenFromQrText(`https://example.org/q/${token}`)).toBe(token);
		expect(tokenFromQrText(`http://localhost:5173/q/${token}`)).toBe(token);
	});

	it("accepts a bare token", () => {
		expect(tokenFromQrText(token)).toBe(token);
	});

	it("AK-SCAN-07: returns null for foreign content", () => {
		for (const text of [
			"",
			"hello",
			"https://example.org/",
			"https://example.org/other/abc",
			`https://example.org/q/${token}/extra`,
			"WIFI:S:x;T:WPA;P:y;;",
			"not a url at all /q/q1.a.b",
		]) {
			expect(tokenFromQrText(text)).toBeNull();
		}
	});
});
