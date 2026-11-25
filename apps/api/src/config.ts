import { type AlertThresholds, alertThresholdsSchema } from "@qurally/shared";

const VARS = {
	minReporters: "REPORT_ALERT_MIN_REPORTERS",
	minUnsafeReporters: "REPORT_ALERT_MIN_UNSAFE_REPORTERS",
} as const;

// Strict parse: a set but malformed value must abort start-up, not silently fall back.
function readInt(
	env: Record<string, string | undefined>,
	name: string,
): number | undefined {
	const raw = env[name];
	if (raw === undefined) return undefined;
	if (!/^\d+$/.test(raw)) {
		throw new Error(`${name} must be an integer between 1 and 10`);
	}
	return Number(raw);
}

export function loadAlertThresholds(
	env: Record<string, string | undefined>,
): AlertThresholds {
	const input = {
		minReporters: readInt(env, VARS.minReporters),
		minUnsafeReporters: readInt(env, VARS.minUnsafeReporters),
	};
	for (const key of Object.keys(VARS) as (keyof typeof VARS)[]) {
		const result = alertThresholdsSchema.shape[key].safeParse(input[key]);
		if (!result.success) {
			throw new Error(`${VARS[key]} must be an integer between 1 and 10`);
		}
	}
	return alertThresholdsSchema.parse(input);
}
