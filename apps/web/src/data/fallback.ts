import {
	checkFallbackPosition,
	isCorrectAnswer,
	type RouteBundle,
	stationXp,
} from "@qurally/shared";
import type { GeoPosition } from "../ports/geolocation";
import type { QurallyDb } from "./db";

type CheckFailure =
	| "too_far"
	| "accuracy_too_low"
	| "fallback_disabled"
	| "unknown_station";

export type FallbackCheck = { ok: true } | { ok: false; reason: CheckFailure };

/** Can the fallback be used at this position? Pure; nothing is stored. */
export function checkFallbackLocation(
	bundle: RouteBundle,
	stationId: string,
	position: GeoPosition,
): FallbackCheck {
	const station = bundle.route.stations.find((s) => s.id === stationId);
	if (!station) return { ok: false, reason: "unknown_station" };
	if (!station.fallback.enabled || !station.fallback.question)
		return { ok: false, reason: "fallback_disabled" };
	return checkFallbackPosition(
		station.location,
		station.fallback.radiusM,
		position,
	);
}

export type FallbackResult =
	| { status: "completed"; xp: number }
	| { status: "incorrect" | "already_done" | "blocked" | CheckFailure };

/**
 * Completes a station through the fallback (position + on-site question).
 * The position goes into the outbox event only; it is deleted after the sync
 * and never kept in the progress data. Server re-checks everything.
 */
export async function answerFallback(
	db: QurallyDb,
	bundle: RouteBundle,
	stationId: string,
	position: GeoPosition,
	answer: string,
): Promise<FallbackResult> {
	const { route, stationStates } = bundle;
	const station = route.stations.find((s) => s.id === stationId);
	if (!station) return { status: "unknown_station" };
	const question = station.fallback.question;
	if (!station.fallback.enabled || !question)
		return { status: "fallback_disabled" };
	if (stationStates[stationId]?.status === "blocked")
		return { status: "blocked" };

	return db.transaction("rw", db.progress, db.outbox, async () => {
		if (await db.progress.get([route.id, stationId]))
			return { status: "already_done" } as const;

		const check = checkFallbackLocation(bundle, stationId, position);
		if (!check.ok) return { status: check.reason } as const;
		if (!isCorrectAnswer(question, answer))
			return { status: "incorrect" } as const;

		await db.progress.add({
			routeId: route.id,
			stationId,
			state: "completed",
			method: "fallback",
			confirmed: false,
		});
		const id = crypto.randomUUID();
		await db.outbox.add({
			id,
			event: {
				id,
				type: "fallback_checkin",
				routeId: route.id,
				stationId,
				position: {
					lat: position.lat,
					lng: position.lng,
					accuracyM: position.accuracyM,
				},
				answer,
				clientTs: Date.now(),
			},
			createdAt: Date.now(),
			attempts: 0,
		});
		const xp = stationXp(route.xpRules, {
			stationId,
			state: "completed",
			method: "fallback",
		});
		return { status: "completed", xp } as const;
	});
}
