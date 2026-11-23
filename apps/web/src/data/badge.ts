import {
	isRouteComplete,
	type Route,
	type RouteBundle,
	type StationProgress,
} from "@qurally/shared";
import type { LocalProgress } from "./db";

export type Badge = Route["reward"]["badge"];

export type BadgeStatus =
	| { state: "none" }
	| { state: "provisional" | "confirmed"; badge: Badge };

/**
 * Confirmed: the server awarded it. Provisional: all playable stations are done
 * locally, the server has not confirmed yet (e.g. while offline).
 */
export function badgeStatus(
	bundle: RouteBundle,
	rows: readonly LocalProgress[],
	confirmedBadgeIds: readonly string[],
): BadgeStatus {
	const { route, stationStates } = bundle;
	const badge = route.reward.badge;
	if (confirmedBadgeIds.includes(badge.id))
		return { state: "confirmed", badge };

	const blocked = new Set(
		Object.entries(stationStates)
			.filter(([, s]) => s.status === "blocked")
			.map(([id]) => id),
	);
	const entries: StationProgress[] = rows
		.filter((r) => r.routeId === route.id)
		.map((r) => ({ stationId: r.stationId, state: r.state, method: r.method }));
	const complete = isRouteComplete(
		route.stations.map((s) => s.id),
		blocked,
		entries,
	);
	return complete ? { state: "provisional", badge } : { state: "none" };
}
