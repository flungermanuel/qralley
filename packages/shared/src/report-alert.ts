import { z } from "zod";
import type { ReportKind } from "./station-state";

export type ReporterCounts = { all: number; unsafe: number };

export const alertThresholdsSchema = z.object({
	minReporters: z.number().int().min(1).max(10).default(3),
	minUnsafeReporters: z.number().int().min(1).max(10).default(2),
});
export type AlertThresholds = z.infer<typeof alertThresholdsSchema>;

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds =
	alertThresholdsSchema.parse({});

// Reports without a player (deleted account) must not merge into one reporter.
// Callers must pass open (not resolved) reports only; it counts whatever it receives.
export function countReporters(
	reports: readonly { playerId: string | null; kind: ReportKind }[],
): ReporterCounts {
	const all = new Set<string>();
	const unsafe = new Set<string>();
	let anonymousAll = 0;
	let anonymousUnsafe = 0;
	for (const { playerId, kind } of reports) {
		if (playerId === null) {
			anonymousAll++;
			if (kind === "unsafe") anonymousUnsafe++;
		} else {
			all.add(playerId);
			if (kind === "unsafe") unsafe.add(playerId);
		}
	}
	return {
		all: all.size + anonymousAll,
		unsafe: unsafe.size + anonymousUnsafe,
	};
}

// Alarm fires exactly once: when the thresholds go from not reached to reached.
export function reportAlertCrossed(
	before: ReporterCounts,
	after: ReporterCounts,
	thresholds: AlertThresholds,
): boolean {
	const reached = (c: ReporterCounts) =>
		c.all >= thresholds.minReporters ||
		c.unsafe >= thresholds.minUnsafeReporters;
	return reached(after) && !reached(before);
}
