/**
 * QR token format (docs/SPEC.md §9). Format only; no secrets, no crypto.
 * Signing and verification live in apps/api (the key must never reach the client).
 *
 *   token   = "q1." + b64url(payload) + "." + b64url(mac)
 *   payload = routeId ":" stationId ":" keyVersion
 */

export const TOKEN_PREFIX = "q1";
export const MAC_BYTES = 16;
const MAX_TOKEN_LENGTH = 200;
const SLUG = /^[a-z0-9-]+$/;
const KEY_VERSION = /^[1-9]\d{0,8}$/;
const B64URL = /^[A-Za-z0-9_-]*$/;

export interface TokenPayload {
	routeId: string;
	stationId: string;
	keyVersion: number;
}

export type ParsedToken =
	| { ok: true; payload: TokenPayload; signedPayload: string; mac: Uint8Array }
	| { ok: false; reason: "malformed" };

export function base64urlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/** Strict decoder: returns null unless the input is the canonical encoding of some bytes. */
export function base64urlDecode(input: string): Uint8Array | null {
	if (!B64URL.test(input) || input.length % 4 === 1) return null;
	const padded = input
		.replace(/-/g, "+")
		.replace(/_/g, "/")
		.padEnd(Math.ceil(input.length / 4) * 4, "=");
	let binary: string;
	try {
		binary = atob(padded);
	} catch {
		return null;
	}
	const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
	// Reject encodings with non-zero spare bits: they would decode to the same bytes.
	return base64urlEncode(bytes) === input ? bytes : null;
}

export function payloadString(payload: TokenPayload): string {
	return `${payload.routeId}:${payload.stationId}:${payload.keyVersion}`;
}

export function formatToken(payload: TokenPayload, mac: Uint8Array): string {
	const body = base64urlEncode(
		new TextEncoder().encode(payloadString(payload)),
	);
	return `${TOKEN_PREFIX}.${body}.${base64urlEncode(mac)}`;
}

const MALFORMED = { ok: false, reason: "malformed" } as const;

export function parseToken(token: string): ParsedToken {
	if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH)
		return MALFORMED;
	const parts = token.split(".");
	const [prefix, body, macPart] = parts;
	if (
		parts.length !== 3 ||
		prefix !== TOKEN_PREFIX ||
		body === undefined ||
		macPart === undefined
	) {
		return MALFORMED;
	}

	const payloadBytes = base64urlDecode(body);
	const mac = base64urlDecode(macPart);
	if (!payloadBytes || !mac || mac.length !== MAC_BYTES) return MALFORMED;

	let signedPayload: string;
	try {
		signedPayload = new TextDecoder("utf-8", { fatal: true }).decode(
			payloadBytes,
		);
	} catch {
		return MALFORMED;
	}

	const fields = signedPayload.split(":");
	const [routeId, stationId, version] = fields;
	if (
		fields.length !== 3 ||
		routeId === undefined ||
		stationId === undefined ||
		version === undefined ||
		!SLUG.test(routeId) ||
		!SLUG.test(stationId) ||
		!KEY_VERSION.test(version)
	) {
		return MALFORMED;
	}

	return {
		ok: true,
		payload: { routeId, stationId, keyVersion: Number(version) },
		signedPayload,
		mac,
	};
}

const QR_PATH = /^\/q\/([A-Za-z0-9_.-]+)$/;

/**
 * Extracts a token from scanned QR text: a bare token or `https://<any host>/q/<token>`.
 * Returns null for anything else (foreign codes). Does not check the signature.
 */
export function tokenFromQrText(text: string): string | null {
	let candidate = text;
	if (!text.startsWith(`${TOKEN_PREFIX}.`)) {
		let url: URL;
		try {
			url = new URL(text);
		} catch {
			return null;
		}
		if (url.protocol !== "https:" && url.protocol !== "http:") return null;
		const match = QR_PATH.exec(url.pathname);
		if (!match?.[1]) return null;
		candidate = match[1];
	}
	return parseToken(candidate).ok ? candidate : null;
}
