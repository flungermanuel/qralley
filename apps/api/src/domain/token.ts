import { createHmac, timingSafeEqual } from "node:crypto";
import {
	base64urlDecode,
	formatToken,
	MAC_BYTES,
	parseToken,
	type TokenPayload,
} from "@qurally/shared";

/** Key version -> secret. Secrets exist only on the server. */
export type SigningKeys = ReadonlyMap<number, Buffer>;

export type VerifyResult =
	| { ok: true; routeId: string; stationId: string; keyVersion: number }
	| { ok: false; reason: "malformed" | "unknown_key" | "invalid_token" };

const MIN_KEY_BYTES = 32;
/** 32 random bytes contain about 28 distinct values; constant or patterned test keys contain far fewer. */
const MIN_DISTINCT_BYTES = 16;
// Domain separation: this key/MAC pair is only valid for QR tokens, format version 1.
const DOMAIN = "qurally-qr-v1\0";

function computeMac(key: Buffer, signedPayload: string): Buffer {
	return createHmac("sha256", key)
		.update(DOMAIN + signedPayload)
		.digest()
		.subarray(0, MAC_BYTES);
}

export function signToken(keys: SigningKeys, payload: TokenPayload): string {
	const key = keys.get(payload.keyVersion);
	if (!key)
		throw new Error(`No signing key for key version ${payload.keyVersion}`);
	const signedPayload = `${payload.routeId}:${payload.stationId}:${payload.keyVersion}`;
	const token = formatToken(payload, computeMac(key, signedPayload));
	// Refuse to hand out tokens our own parser would reject (e.g. non-slug ids).
	if (!parseToken(token).ok)
		throw new Error("Cannot sign token: invalid route or station id");
	return token;
}

export function verifyToken(keys: SigningKeys, token: string): VerifyResult {
	const parsed = parseToken(token);
	if (!parsed.ok) return { ok: false, reason: "malformed" };

	const key = keys.get(parsed.payload.keyVersion);
	if (!key) return { ok: false, reason: "unknown_key" };

	const expected = computeMac(key, parsed.signedPayload);
	if (
		expected.length !== parsed.mac.length ||
		!timingSafeEqual(expected, parsed.mac)
	) {
		return { ok: false, reason: "invalid_token" };
	}
	const { routeId, stationId, keyVersion } = parsed.payload;
	return { ok: true, routeId, stationId, keyVersion };
}

/**
 * Parses QR_SIGNING_KEYS: JSON object, key version -> base64url secret (>= 32 bytes).
 * Error messages never contain secret material.
 */
export function parseSigningKeys(
	raw: string | undefined,
	options: { production?: boolean } = {},
): SigningKeys {
	const production =
		options.production ?? process.env.NODE_ENV === "production";
	const fail = (message: string): never => {
		throw new Error(`QR_SIGNING_KEYS: ${message}`);
	};
	if (!raw?.trim()) {
		return fail(
			'missing. Expected JSON like {"1":"<base64url secret, at least 32 bytes>"}',
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return fail("is not valid JSON");
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return fail("must be a JSON object mapping key version to secret");
	}

	const keys = new Map<number, Buffer>();
	for (const [version, secret] of Object.entries(parsed)) {
		if (!/^[1-9]\d{0,8}$/.test(version))
			return fail(`key version "${version}" must be a positive integer`);
		if (typeof secret !== "string")
			return fail(`secret for key version ${version} must be a string`);
		// The example file ships a placeholder; it must never be mistaken for a real key.
		if (/replace|changeme|your[_-]?key|example/i.test(secret)) {
			return fail(
				`secret for key version ${version} is still a placeholder; generate a random one (see the example env file)`,
			);
		}
		const bytes = base64urlDecode(secret);
		if (!bytes)
			return fail(`secret for key version ${version} is not valid base64url`);
		if (bytes.length < MIN_KEY_BYTES) {
			return fail(
				`secret for key version ${version} must be at least ${MIN_KEY_BYTES} bytes`,
			);
		}
		// Test and e2e keys are constant bytes; refuse anything that is not clearly random in production.
		if (production && new Set(bytes).size < MIN_DISTINCT_BYTES) {
			return fail(
				`secret for key version ${version} does not look random (use 32 random bytes in production)`,
			);
		}
		keys.set(Number(version), Buffer.from(bytes));
	}
	if (keys.size === 0) return fail("contains no keys");
	return keys;
}
