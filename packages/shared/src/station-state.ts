export type StationStatus = "ok" | "reported" | "blocked";
export type ReportKind = "code_damaged" | "code_missing" | "unsafe" | "other";

/** Distinct players reporting "unsafe" that automatically block a station. */
export const UNSAFE_BLOCK_THRESHOLD = 2;

/**
 * Next status after a report. `distinctUnsafeReporters` counts distinct players
 * with an unsafe report (including this one). Only the operator can unblock.
 */
export function applyReport(
	current: StationStatus,
	kind: ReportKind,
	distinctUnsafeReporters: number,
): StationStatus {
	if (current === "blocked") return "blocked";
	if (kind === "unsafe" && distinctUnsafeReporters >= UNSAFE_BLOCK_THRESHOLD)
		return "blocked";
	return "reported";
}
