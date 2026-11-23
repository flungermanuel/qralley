import { base64urlEncode, formatToken, parseToken } from "@qurally/shared";
import { describe, expect, it } from "vitest";
import { parseSigningKeys, signToken, verifyToken } from "../src/domain/token";

const key1 = Buffer.alloc(32, 1);
const key2 = Buffer.alloc(32, 2);
const keys = new Map([
	[1, key1],
	[2, key2],
]);
const station = { routeId: "innsbruck-altstadt", stationId: "goldenes-dachl" };

describe("signToken / verifyToken", () => {
	it("AK-TOKEN-01: round-trips route, station and key version", () => {
		const token = signToken(keys, { ...station, keyVersion: 1 });
		expect(verifyToken(keys, token)).toEqual({
			ok: true,
			...station,
			keyVersion: 1,
		});
	});

	it("is deterministic (printed codes can be regenerated)", () => {
		const a = signToken(keys, { ...station, keyVersion: 1 });
		expect(signToken(keys, { ...station, keyVersion: 1 })).toBe(a);
	});

	it("different stations and key versions give different tokens", () => {
		const a = signToken(keys, { ...station, keyVersion: 1 });
		expect(
			signToken(keys, { ...station, stationId: "annasaeule", keyVersion: 1 }),
		).not.toBe(a);
		expect(signToken(keys, { ...station, keyVersion: 2 })).not.toBe(a);
	});

	it("AK-TOKEN-02: any single-character change makes verification fail", () => {
		const token = signToken(keys, { ...station, keyVersion: 1 });
		for (let i = 0; i < token.length; i++) {
			const original = token[i];
			const replacement = original === "A" ? "B" : "A";
			const tampered = token.slice(0, i) + replacement + token.slice(i + 1);
			expect(verifyToken(keys, tampered).ok, `position ${i}`).toBe(false);
		}
	});

	it("AK-SCAN-02: a forged signature is reported as invalid_token", () => {
		const parsed = parseToken(signToken(keys, { ...station, keyVersion: 1 }));
		if (!parsed.ok) throw new Error("setup failed");
		const forged = formatToken(parsed.payload, new Uint8Array(16));
		expect(verifyToken(keys, forged)).toEqual({
			ok: false,
			reason: "invalid_token",
		});
	});

	it("AK-TOKEN-03: a token does not verify under a different key", () => {
		const token = signToken(keys, { ...station, keyVersion: 1 });
		expect(verifyToken(new Map([[1, key2]]), token)).toEqual({
			ok: false,
			reason: "invalid_token",
		});
	});

	it("AK-TOKEN-03: changing the key version in the payload invalidates the mac", () => {
		const parsed = parseToken(signToken(keys, { ...station, keyVersion: 1 }));
		if (!parsed.ok) throw new Error("setup failed");
		const moved = formatToken({ ...parsed.payload, keyVersion: 2 }, parsed.mac);
		expect(verifyToken(keys, moved)).toEqual({
			ok: false,
			reason: "invalid_token",
		});
	});

	it("AK-SCAN-04: an unknown key version is reported as unknown_key", () => {
		const token = signToken(new Map([[3, Buffer.alloc(32, 3)]]), {
			...station,
			keyVersion: 3,
		});
		expect(verifyToken(keys, token)).toEqual({
			ok: false,
			reason: "unknown_key",
		});
	});

	it("key rotation: tokens of old and new versions verify side by side", () => {
		const oldToken = signToken(keys, { ...station, keyVersion: 1 });
		const newToken = signToken(keys, { ...station, keyVersion: 2 });
		expect(verifyToken(keys, oldToken).ok).toBe(true);
		expect(verifyToken(keys, newToken).ok).toBe(true);
		// retiring version 1 invalidates the old printed code
		expect(verifyToken(new Map([[2, key2]]), oldToken)).toEqual({
			ok: false,
			reason: "unknown_key",
		});
	});

	it("AK-TOKEN-04: malformed input yields malformed, never throws", () => {
		for (const input of [
			"",
			"garbage",
			"q1..",
			"q1.AAAA.AAAA",
			"x".repeat(1000),
		]) {
			expect(verifyToken(keys, input)).toEqual({
				ok: false,
				reason: "malformed",
			});
		}
	});

	it("refuses to sign with a missing key", () => {
		expect(() => signToken(keys, { ...station, keyVersion: 9 })).toThrow(
			/key version 9/,
		);
	});

	it("does not leak the signing key into the token", () => {
		const token = signToken(keys, { ...station, keyVersion: 1 });
		expect(token).not.toContain(base64urlEncode(key1));
	});
});

describe("parseSigningKeys", () => {
	const good = base64urlEncode(Buffer.alloc(32, 7));

	it("parses a JSON map of key version to base64url secret", () => {
		const parsed = parseSigningKeys(JSON.stringify({ "1": good, "2": good }));
		expect([...parsed.keys()]).toEqual([1, 2]);
		expect(parsed.get(1)?.length).toBe(32);
	});

	it.each([
		["undefined", undefined],
		["empty", ""],
		["not json", "abc"],
		["not an object", "[]"],
		["empty object", "{}"],
		[
			"short secret",
			JSON.stringify({ "1": base64urlEncode(Buffer.alloc(16, 1)) }),
		],
		["non-numeric version", JSON.stringify({ a: good })],
		["zero version", JSON.stringify({ "0": good })],
		["bad base64", JSON.stringify({ "1": "!!!" })],
		["non-string secret", JSON.stringify({ "1": 5 })],
	])("AK-CLI-03: rejects %s with a clear error", (_name, value) => {
		expect(() => parseSigningKeys(value)).toThrow(/QR_SIGNING_KEYS/);
	});

	it("never puts the secret into the error message", () => {
		const short = base64urlEncode(Buffer.alloc(16, 9));
		try {
			parseSigningKeys(JSON.stringify({ "1": short }));
			expect.unreachable();
		} catch (err) {
			expect((err as Error).message).not.toContain(short);
		}
	});
});
