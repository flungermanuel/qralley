import {
	isCorrectAnswer,
	type RouteBundle,
	type StationProgress,
	totalXp,
} from "@qurally/shared";
import type { LocalProgress, QurallyDb } from "./db";

export type AnswerResult =
	| { status: "correct"; xp: number }
	| {
			status:
				| "incorrect"
				| "not_visited"
				| "already_completed"
				| "blocked"
				| "unknown_station";
	  };

/** Checks an answer locally. Only a correct answer is recorded; wrong answers leave no trace. */
export async function answerQuest(
	db: QurallyDb,
	bundle: RouteBundle,
	stationId: string,
	answer: string,
): Promise<AnswerResult> {
	const { route, stationStates } = bundle;
	const station = route.stations.find((s) => s.id === stationId);
	if (!station) return { status: "unknown_station" };
	if (stationStates[stationId]?.status === "blocked")
		return { status: "blocked" };

	return db.transaction("rw", db.progress, async () => {
		const existing = await db.progress.get([route.id, stationId]);
		if (!existing) return { status: "not_visited" } as const;
		if (existing.state === "completed")
			return { status: "already_completed" } as const;
		if (!isCorrectAnswer(station.quest, answer))
			return { status: "incorrect" } as const;

		await db.progress.update([route.id, stationId], {
			state: "completed",
			confirmed: false,
		});
		return { status: "correct", xp: route.xpRules.questXp } as const;
	});
}

export interface ProgressSummary {
	xp: number;
	/** True while some progress is not yet confirmed by the server. */
	provisional: boolean;
}

export function summarizeProgress(
	bundle: RouteBundle,
	rows: readonly LocalProgress[],
): ProgressSummary {
	const own = rows.filter((r) => r.routeId === bundle.route.id);
	const entries: StationProgress[] = own.map((r) => ({
		stationId: r.stationId,
		state: r.state,
		method: r.method,
	}));
	return {
		xp: totalXp(bundle.route.xpRules, entries),
		provisional: own.some((r) => !r.confirmed),
	};
}
