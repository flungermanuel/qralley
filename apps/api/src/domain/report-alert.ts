import {
	type AlertThresholds,
	countReporters,
	type ReporterCounts,
	type ReportKind,
	reportAlertCrossed,
} from "@qurally/shared";
import { and, eq } from "drizzle-orm";
import { reports, stationState } from "../db/schema";
import type { Executor } from "./route-store";

/** Operator alarm payload (ADR 0007). Deliberately carries no player data. */
export interface StationAlert {
	routeId: string;
	stationId: string;
	reporters: ReporterCounts;
	oldestOpenReportAt: Date;
}

export interface AlertOptions {
	thresholds?: AlertThresholds;
	/** Called after the event's transaction committed; never for rejected or duplicate events. */
	onAlert?: (alert: StationAlert) => void | Promise<void>;
}

/**
 * Checks whether the report row just inserted pushed the station over a threshold.
 * Must run after the station_state upsert in the same transaction: that upsert holds the
 * row lock, so concurrent reporters are serialized and exactly one of them sees the crossing.
 */
export async function detectAlert(
	tx: Executor,
	routeId: string,
	stationId: string,
	insertedReportId: string,
	thresholds: AlertThresholds,
): Promise<StationAlert | null> {
	const open = await tx
		.select({
			id: reports.id,
			playerId: reports.playerId,
			kind: reports.kind,
			createdAt: reports.createdAt,
		})
		.from(reports)
		.where(
			and(
				eq(reports.routeId, routeId),
				eq(reports.stationId, stationId),
				eq(reports.status, "open"),
			),
		);
	const asReports = (rows: typeof open) =>
		rows.map((r) => ({ playerId: r.playerId, kind: r.kind as ReportKind }));
	const after = countReporters(asReports(open));
	const before = countReporters(
		asReports(open.filter((r) => r.id !== insertedReportId)),
	);
	if (!reportAlertCrossed(before, after, thresholds)) return null;

	const [state] = await tx
		.select({ status: stationState.status })
		.from(stationState)
		.where(
			and(
				eq(stationState.routeId, routeId),
				eq(stationState.stationId, stationId),
			),
		)
		.limit(1);
	if (state?.status === "blocked") return null;

	const oldest = new Date(Math.min(...open.map((r) => r.createdAt.getTime())));
	return { routeId, stationId, reporters: after, oldestOpenReportAt: oldest };
}

/** Same as detectAlert, but queues the alert for delivery after commit. */
export async function collectAlert(
	ctx: { tx: Executor; thresholds: AlertThresholds; alerts: StationAlert[] },
	routeId: string,
	stationId: string,
	insertedReportId: string | undefined,
): Promise<void> {
	// No new row (fallback with an existing report) cannot cross a threshold.
	if (!insertedReportId) return;
	const alert = await detectAlert(
		ctx.tx,
		routeId,
		stationId,
		insertedReportId,
		ctx.thresholds,
	);
	if (alert) ctx.alerts.push(alert);
}
