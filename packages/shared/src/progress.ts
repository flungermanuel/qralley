import type { StationProgress } from "./xp";

/**
 * Route is complete when every unblocked station is completed.
 * A route with no playable station is never complete.
 */
export function isRouteComplete(
	stationIds: readonly string[],
	blocked: ReadonlySet<string>,
	progress: readonly StationProgress[],
): boolean {
	const required = stationIds.filter((id) => !blocked.has(id));
	if (required.length === 0) return false;
	const completed = new Set(
		progress.filter((p) => p.state === "completed").map((p) => p.stationId),
	);
	return required.every((id) => completed.has(id));
}
