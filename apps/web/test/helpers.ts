import { formatToken, type RouteBundle, validateRoute } from "@qurally/shared";
import { exampleRoute } from "../../../packages/shared/test/fixtures";
import { QurallyDb } from "../src/data/db";
import type { ScannerError, ScannerPort } from "../src/ports/scanner";

let counter = 0;

/** A fresh, isolated IndexedDB per test. */
export function testDb(): QurallyDb {
	counter += 1;
	return new QurallyDb(
		`qurally-test-${counter}-${Math.random().toString(36).slice(2)}`,
	);
}

export function bundleFixture(over: Partial<RouteBundle> = {}): RouteBundle {
	const result = validateRoute(exampleRoute());
	if (!result.ok) throw new Error("example route invalid");
	return {
		route: result.route,
		stationStates: Object.fromEntries(
			result.route.stations.map((s) => [
				s.id,
				{ status: "ok" as const, reason: null },
			]),
		),
		bundleVersion: "a".repeat(64),
		serverTime: 1_700_000_000_000,
		...over,
	};
}

export function jsonResponse(
	body: unknown,
	init: { status?: number; etag?: string } = {},
): Response {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		headers: {
			"content-type": "application/json",
			...(init.etag ? { etag: init.etag } : {}),
		},
	});
}

export const offlineFetch: typeof fetch = () =>
	Promise.reject(new TypeError("Failed to fetch"));

/**
 * A well-formed token. The client cannot check the signature (the key is server-only),
 * so the MAC here is a dummy; the server decides at sync time.
 */
export function tokenFor(
	stationId: string,
	over: { routeId?: string; keyVersion?: number } = {},
): string {
	return formatToken(
		{ routeId: "innsbruck-altstadt", stationId, keyVersion: 1, ...over },
		new Uint8Array(16).fill(9),
	);
}

export const qrUrl = (token: string) => `https://example.org/q/${token}`;

/** Scanner double: tests decide when a code is "seen". */
export class FakeScanner implements ScannerPort {
	started = 0;
	stopped = 0;
	failWith: ScannerError | null = null;
	private onDecode: ((text: string) => void) | null = null;

	async start(
		_video: HTMLVideoElement,
		onDecode: (text: string) => void,
	): Promise<void> {
		this.started += 1;
		if (this.failWith) throw this.failWith;
		this.onDecode = onDecode;
	}

	stop(): void {
		this.stopped += 1;
		this.onDecode = null;
	}

	emit(text: string): void {
		this.onDecode?.(text);
	}
}
