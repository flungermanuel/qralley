import { parseToken, type RouteBundle, tokenFromQrText } from "@qurally/shared";
import type { QurallyDb } from "./db";

export type ScanOutcome =
	| { kind: "visited"; stationId: string; xp: number }
	| { kind: "duplicate"; stationId: string }
	| { kind: "blocked"; stationId: string }
	| { kind: "foreign" }
	| { kind: "wrong_route" }
	| { kind: "invalid_code" };

/**
 * Handles scanned QR text. The signature cannot be checked here (the key is
 * server-only), so a well-formed code for a station of this route counts as a
 * provisional visit; the server decides when the event is synced.
 * Progress and outbox entry are written in one transaction (AK-SYNC-01).
 */
export async function processScan(
	db: QurallyDb,
	bundle: RouteBundle,
	text: string,
): Promise<ScanOutcome> {
	const raw = tokenFromQrText(text);
	if (!raw) return { kind: "foreign" };
	const parsed = parseToken(raw);
	if (!parsed.ok) return { kind: "foreign" };

	const { route, stationStates } = bundle;
	if (parsed.payload.routeId !== route.id) return { kind: "wrong_route" };

	const station = route.stations.find((s) => s.id === parsed.payload.stationId);
	// A retired key version means the printed code was replaced.
	if (!station || parsed.payload.keyVersion !== station.qrKeyVersion)
		return { kind: "invalid_code" };
	if (stationStates[station.id]?.status === "blocked")
		return { kind: "blocked", stationId: station.id };

	return db.transaction("rw", db.progress, db.outbox, async () => {
		const existing = await db.progress.get([route.id, station.id]);
		if (existing) return { kind: "duplicate", stationId: station.id } as const;

		await db.progress.add({
			routeId: route.id,
			stationId: station.id,
			state: "visited",
			method: "scan",
			confirmed: false,
		});
		const id = crypto.randomUUID();
		await db.outbox.add({
			id,
			event: {
				id,
				type: "scan",
				routeId: route.id,
				token: raw,
				clientTs: Date.now(),
			},
			createdAt: Date.now(),
			attempts: 0,
		});
		return {
			kind: "visited",
			stationId: station.id,
			xp: route.xpRules.scanXp,
		} as const;
	});
}
