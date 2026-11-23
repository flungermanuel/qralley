import {
	MAX_REPORT_NOTE_LENGTH,
	type REPORT_KINDS,
	type RouteBundle,
} from "@qurally/shared";
import type { QurallyDb } from "./db";

export type ReportKind = (typeof REPORT_KINDS)[number];
export type ReportResult = {
	status: "queued" | "already_pending" | "note_too_long" | "unknown_station";
};

/** Queues a report for the next sync. A report that is still waiting is not queued twice. */
export async function queueReport(
	db: QurallyDb,
	bundle: RouteBundle,
	stationId: string,
	kind: ReportKind,
	note?: string,
): Promise<ReportResult> {
	const { route } = bundle;
	if (!route.stations.some((s) => s.id === stationId))
		return { status: "unknown_station" };
	const text = note?.trim();
	if (text && text.length > MAX_REPORT_NOTE_LENGTH)
		return { status: "note_too_long" };

	return db.transaction("rw", db.outbox, async () => {
		const waiting = await db.outbox
			.filter(
				(e) =>
					e.event.type === "report" &&
					e.event.stationId === stationId &&
					e.event.kind === kind,
			)
			.count();
		if (waiting > 0) return { status: "already_pending" } as const;

		const id = crypto.randomUUID();
		await db.outbox.add({
			id,
			event: {
				id,
				type: "report",
				routeId: route.id,
				stationId,
				kind,
				...(text ? { note: text } : {}),
				clientTs: Date.now(),
			},
			createdAt: Date.now(),
			attempts: 0,
		});
		return { status: "queued" } as const;
	});
}
