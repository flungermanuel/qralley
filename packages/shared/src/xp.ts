import type { Route } from "./route-schema";

export type XpRules = Route["xpRules"];

export interface StationProgress {
	stationId: string;
	state: "visited" | "completed";
	method: "scan" | "fallback";
}

/**
 * XP of one station.
 * visited -> scanXp; completed via scan -> scanXp + questXp;
 * completed via fallback -> floor((scanXp + questXp) * fallbackXpFactor).
 */
export function stationXp(rules: XpRules, progress: StationProgress): number {
	if (progress.state === "visited") return rules.scanXp;
	const full = rules.scanXp + rules.questXp;
	return progress.method === "fallback"
		? Math.floor(full * rules.fallbackXpFactor)
		: full;
}

/** Total XP. Each station counts once (the first entry per stationId wins). */
export function totalXp(
	rules: XpRules,
	progress: readonly StationProgress[],
): number {
	const seen = new Set<string>();
	let sum = 0;
	for (const p of progress) {
		if (seen.has(p.stationId)) continue;
		seen.add(p.stationId);
		sum += stationXp(rules, p);
	}
	return sum;
}
