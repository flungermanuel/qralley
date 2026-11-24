import type { StationStatus } from "@qurally/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { reports, stationState } from "../db/schema";
import { getLatestRoute } from "./route-store";

const STATUSES: readonly StationStatus[] = ["ok", "reported", "blocked"];

/**
 * Operator action (SPEC §5.3, AK-REP-05): set a station's status by hand.
 * Setting it back to "ok" marks its open reports as resolved, so old reports no longer
 * count toward an automatic block.
 */
export async function setStationStatus(
	db: Db,
	routeId: string,
	stationId: string,
	status: StationStatus,
	reason?: string,
): Promise<void> {
	if (!STATUSES.includes(status))
		throw new Error(`Unknown status "${status}" (use ok, reported or blocked)`);
	const latest = await getLatestRoute(db, routeId);
	if (!latest) throw new Error(`Unknown route "${routeId}"`);
	if (!latest.route.stations.some((s) => s.id === stationId)) {
		throw new Error(`Unknown station "${stationId}" in route "${routeId}"`);
	}

	await db.transaction(async (tx) => {
		await tx
			.insert(stationState)
			.values({ routeId, stationId, status, statusReason: reason ?? null })
			.onConflictDoUpdate({
				target: [stationState.routeId, stationState.stationId],
				set: {
					status,
					statusReason: reason ?? null,
					statusChangedAt: new Date(),
				},
			});
		if (status === "ok") {
			await tx
				.update(reports)
				.set({ status: "resolved" })
				.where(
					and(
						eq(reports.routeId, routeId),
						eq(reports.stationId, stationId),
						eq(reports.status, "open"),
					),
				);
		}
	});
}
