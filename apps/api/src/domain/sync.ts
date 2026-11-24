import {
	applyReport,
	checkFallbackPosition,
	isCorrectAnswer,
	isRouteComplete,
	type Route,
	type Station,
	type StationProgress,
	type StationStatus,
	type SyncEvent,
	type SyncResult,
	slugSchema,
	stationXp,
	syncEventSchema,
	totalXp,
} from "@qurally/shared";
import { and, count, countDistinct, eq, gte, ne } from "drizzle-orm";
import type { Db } from "../db/client";
import {
	badgesAwarded,
	players,
	progress,
	reports,
	stationState,
	syncEvents,
} from "../db/schema";
import {
	type Executor,
	getLatestRoute,
	getStationStates,
	type StationStates,
} from "./route-store";
import { type SigningKeys, verifyToken } from "./token";

/** Maximum reports one player may send per rolling 24 hours (SPEC AK-REP-06). */
export const MAX_REPORTS_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const KNOWN_TYPES = new Set([
	"scan",
	"quest_answer",
	"fallback_checkin",
	"report",
]);

type Outcome = { status: SyncResult["status"]; reason?: string };
const accepted: Outcome = { status: "accepted" };
const rejected = (reason: string): Outcome => ({ status: "rejected", reason });
const duplicate = (reason: string): Outcome => ({
	status: "duplicate",
	reason,
});

interface Ctx {
	tx: Executor;
	keys: SigningKeys;
	playerId: string;
	routeOf: (routeId: string) => Promise<Route | null>;
}

type Resolved = { route: Route; station: Station } | { outcome: Outcome };

async function resolveStation(
	ctx: Ctx,
	routeId: string,
	stationId: string,
): Promise<Resolved> {
	const route = await ctx.routeOf(routeId);
	if (!route) return { outcome: rejected("unknown_route") };
	const station = route.stations.find((s) => s.id === stationId);
	if (!station) return { outcome: rejected("unknown_station") };
	return { route, station };
}

async function statusOf(
	tx: Executor,
	routeId: string,
	stationId: string,
): Promise<StationStatus> {
	const [row] = await tx
		.select({ status: stationState.status })
		.from(stationState)
		.where(
			and(
				eq(stationState.routeId, routeId),
				eq(stationState.stationId, stationId),
			),
		)
		.limit(1);
	return (row?.status as StationStatus | undefined) ?? "ok";
}

async function progressOf(ctx: Ctx, routeId: string, stationId: string) {
	const [row] = await ctx.tx
		.select()
		.from(progress)
		.where(
			and(
				eq(progress.playerId, ctx.playerId),
				eq(progress.routeId, routeId),
				eq(progress.stationId, stationId),
			),
		)
		.limit(1);
	return row;
}

/** Applies a report to the station state (SPEC §5.3). Blocked stations stay blocked. */
async function flagStation(
	tx: Executor,
	routeId: string,
	stationId: string,
	kind: "code_damaged" | "code_missing" | "unsafe" | "other",
): Promise<void> {
	// Lock the station row first: concurrent reports of different players are serialized, so the
	// second one counts the committed report of the first and an existing block is never undone.
	const [locked] = await tx
		.select({ status: stationState.status })
		.from(stationState)
		.where(
			and(
				eq(stationState.routeId, routeId),
				eq(stationState.stationId, stationId),
			),
		)
		.for("update");
	const current = (locked?.status as StationStatus | undefined) ?? "ok";
	const [unsafe] = await tx
		.select({ n: countDistinct(reports.playerId) })
		.from(reports)
		.where(
			and(
				eq(reports.routeId, routeId),
				eq(reports.stationId, stationId),
				eq(reports.kind, "unsafe"),
				eq(reports.status, "open"),
			),
		);
	const next = applyReport(current, kind, unsafe?.n ?? 0);
	if (next === current) return;
	await tx
		.update(stationState)
		.set({
			status: next,
			statusChangedAt: new Date(),
			statusReason: next === "blocked" ? "unsafe reports" : `report:${kind}`,
		})
		.where(
			and(
				eq(stationState.routeId, routeId),
				eq(stationState.stationId, stationId),
				ne(stationState.status, "blocked"),
			),
		);
}

async function applyScan(
	ctx: Ctx,
	ev: Extract<SyncEvent, { type: "scan" }>,
): Promise<Outcome> {
	const verified = verifyToken(ctx.keys, ev.token);
	if (!verified.ok)
		return rejected(
			verified.reason === "unknown_key" ? "unknown_key" : "invalid_token",
		);
	if (verified.routeId !== ev.routeId) return rejected("wrong_route");

	const resolved = await resolveStation(ctx, ev.routeId, verified.stationId);
	if ("outcome" in resolved) return resolved.outcome;
	const { route, station } = resolved;
	// A code of a retired key version stops working even if its key is still configured.
	if (verified.keyVersion !== station.qrKeyVersion)
		return rejected("unknown_key");

	if ((await statusOf(ctx.tx, route.id, station.id)) === "blocked")
		return rejected("station_blocked");
	if (await progressOf(ctx, route.id, station.id))
		return duplicate("already_visited");

	await ctx.tx.insert(progress).values({
		playerId: ctx.playerId,
		routeId: route.id,
		stationId: station.id,
		state: "visited",
		method: "scan",
		scanXp: route.xpRules.scanXp,
	});
	return accepted;
}

async function applyQuestAnswer(
	ctx: Ctx,
	ev: Extract<SyncEvent, { type: "quest_answer" }>,
): Promise<Outcome> {
	const resolved = await resolveStation(ctx, ev.routeId, ev.stationId);
	if ("outcome" in resolved) return resolved.outcome;
	const { route, station } = resolved;

	if ((await statusOf(ctx.tx, route.id, station.id)) === "blocked")
		return rejected("station_blocked");
	const existing = await progressOf(ctx, route.id, station.id);
	if (!existing) return rejected("not_visited");
	if (existing.state === "completed") return duplicate("already_completed");
	if (!isCorrectAnswer(station.quest, ev.answer))
		return rejected("answer_incorrect");

	await ctx.tx
		.update(progress)
		.set({
			state: "completed",
			questXp: route.xpRules.questXp,
			completedAt: new Date(),
		})
		.where(
			and(
				eq(progress.playerId, ctx.playerId),
				eq(progress.routeId, route.id),
				eq(progress.stationId, station.id),
			),
		);
	return accepted;
}

async function applyFallback(
	ctx: Ctx,
	ev: Extract<SyncEvent, { type: "fallback_checkin" }>,
): Promise<Outcome> {
	const resolved = await resolveStation(ctx, ev.routeId, ev.stationId);
	if ("outcome" in resolved) return resolved.outcome;
	const { route, station } = resolved;
	const question = station.fallback.question;
	if (!station.fallback.enabled || !question)
		return rejected("fallback_disabled");

	if ((await statusOf(ctx.tx, route.id, station.id)) === "blocked")
		return rejected("station_blocked");
	const existing = await progressOf(ctx, route.id, station.id);
	if (existing)
		return duplicate(
			existing.state === "completed" ? "already_completed" : "already_visited",
		);

	// The position is only read here; it is never stored or logged.
	const position = checkFallbackPosition(
		station.location,
		station.fallback.radiusM,
		ev.position,
	);
	if (!position.ok) return rejected(position.reason);
	if (!isCorrectAnswer(question, ev.answer))
		return rejected("answer_incorrect");

	const xp = stationXp(route.xpRules, {
		stationId: station.id,
		state: "completed",
		method: "fallback",
	});
	await ctx.tx.insert(progress).values({
		playerId: ctx.playerId,
		routeId: route.id,
		stationId: station.id,
		state: "completed",
		method: "fallback",
		scanXp: xp,
		questXp: 0,
		completedAt: new Date(),
	});

	// A broken code is a finding in itself: flag the station.
	const [alreadyReported] = await ctx.tx
		.select({ id: reports.id })
		.from(reports)
		.where(
			and(
				eq(reports.playerId, ctx.playerId),
				eq(reports.routeId, route.id),
				eq(reports.stationId, station.id),
				eq(reports.kind, "code_damaged"),
				eq(reports.status, "open"),
			),
		)
		.limit(1);
	if (!alreadyReported) {
		await ctx.tx.insert(reports).values({
			playerId: ctx.playerId,
			routeId: route.id,
			stationId: station.id,
			kind: "code_damaged",
		});
	}
	await flagStation(ctx.tx, route.id, station.id, "code_damaged");
	return accepted;
}

async function applyReportEvent(
	ctx: Ctx,
	ev: Extract<SyncEvent, { type: "report" }>,
): Promise<Outcome> {
	const resolved = await resolveStation(ctx, ev.routeId, ev.stationId);
	if ("outcome" in resolved) return resolved.outcome;
	const { route, station } = resolved;

	const [same] = await ctx.tx
		.select({ id: reports.id })
		.from(reports)
		.where(
			and(
				eq(reports.playerId, ctx.playerId),
				eq(reports.routeId, route.id),
				eq(reports.stationId, station.id),
				eq(reports.kind, ev.kind),
				eq(reports.status, "open"),
			),
		)
		.limit(1);
	if (same) return duplicate("already_reported");

	const [recent] = await ctx.tx
		.select({ n: count() })
		.from(reports)
		.where(
			and(
				eq(reports.playerId, ctx.playerId),
				gte(reports.createdAt, new Date(Date.now() - DAY_MS)),
			),
		);
	if ((recent?.n ?? 0) >= MAX_REPORTS_PER_DAY) return rejected("rate_limited");

	await ctx.tx.insert(reports).values({
		playerId: ctx.playerId,
		routeId: route.id,
		stationId: station.id,
		kind: ev.kind,
		note: ev.note ?? null,
	});
	await flagStation(ctx.tx, route.id, station.id, ev.kind);
	return accepted;
}

function applyEvent(ctx: Ctx, ev: SyncEvent): Promise<Outcome> {
	switch (ev.type) {
		case "scan":
			return applyScan(ctx, ev);
		case "quest_answer":
			return applyQuestAnswer(ctx, ev);
		case "fallback_checkin":
			return applyFallback(ctx, ev);
		case "report":
			return applyReportEvent(ctx, ev);
	}
}

class PlayerGoneError extends Error {}

/**
 * Processes one event atomically and idempotently. The player row is locked, so
 * concurrent syncs of the same player are serialized and a retried event id always
 * finds its stored outcome.
 */
async function handleEvent(
	db: Db,
	base: Omit<Ctx, "tx">,
	raw: { id: string } & Record<string, unknown>,
): Promise<Outcome> {
	const parsed = syncEventSchema.safeParse(raw);
	return db.transaction(async (tx) => {
		const locked = await tx
			.select({ id: players.id })
			.from(players)
			.where(eq(players.id, base.playerId))
			.for("update");
		if (locked.length === 0) throw new PlayerGoneError();

		const [previous] = await tx
			.select()
			.from(syncEvents)
			.where(
				and(
					eq(syncEvents.playerId, base.playerId),
					eq(syncEvents.clientEventId, raw.id),
				),
			)
			.limit(1);
		if (previous) {
			return previous.result === "accepted"
				? duplicate("already_processed")
				: ({
						status: previous.result as Outcome["status"],
						...(previous.reason ? { reason: previous.reason } : {}),
					} satisfies Outcome);
		}

		const outcome = parsed.success
			? await applyEvent({ ...base, tx }, parsed.data)
			: rejected("malformed");
		await tx.insert(syncEvents).values({
			playerId: base.playerId,
			clientEventId: raw.id,
			type:
				typeof raw.type === "string" && KNOWN_TYPES.has(raw.type)
					? raw.type
					: "unknown",
			result: outcome.status,
			reason: outcome.reason ?? null,
		});
		return outcome;
	});
}

export interface RouteProgress {
	totalXp: number;
	stations: Record<string, { state: string; method: string }>;
	badges: string[];
	complete: boolean;
}

/** Current server-side progress; awards the badge when the route is complete. */
async function evaluateRoute(
	db: Db,
	playerId: string,
	route: Route,
): Promise<RouteProgress> {
	const rows = await db
		.select()
		.from(progress)
		.where(
			and(eq(progress.playerId, playerId), eq(progress.routeId, route.id)),
		);
	const entries: StationProgress[] = rows.map((r) => ({
		stationId: r.stationId,
		state: r.state as StationProgress["state"],
		method: r.method as StationProgress["method"],
	}));

	const states = await getStationStates(db, route);
	const blocked = new Set(
		Object.entries(states)
			.filter(([, s]) => s.status === "blocked")
			.map(([id]) => id),
	);
	const complete = isRouteComplete(
		route.stations.map((s) => s.id),
		blocked,
		entries,
	);
	if (complete) {
		await db
			.insert(badgesAwarded)
			.values({ playerId, routeId: route.id, badgeId: route.reward.badge.id })
			.onConflictDoNothing();
	}

	const badges = await db
		.select({ badgeId: badgesAwarded.badgeId })
		.from(badgesAwarded)
		.where(
			and(
				eq(badgesAwarded.playerId, playerId),
				eq(badgesAwarded.routeId, route.id),
			),
		);

	return {
		totalXp: totalXp(route.xpRules, entries),
		stations: Object.fromEntries(
			entries.map((e) => [e.stationId, { state: e.state, method: e.method }]),
		),
		badges: badges.map((b) => b.badgeId),
		complete,
	};
}

export interface SyncResponse {
	results: SyncResult[];
	progress: Record<string, RouteProgress>;
	stationStates: Record<string, StationStates>;
	serverTime: number;
}

/** Processes a batch of events in order and returns results plus the authoritative progress. */
export async function syncPlayer(
	db: Db,
	keys: SigningKeys,
	playerId: string,
	events: ({ id: string } & Record<string, unknown>)[],
): Promise<SyncResponse | null> {
	const routeCache = new Map<string, Promise<Route | null>>();
	const routeOf = (routeId: string) => {
		let hit = routeCache.get(routeId);
		if (!hit) {
			hit = getLatestRoute(db, routeId).then((r) => r?.route ?? null);
			routeCache.set(routeId, hit);
		}
		return hit;
	};

	const results: SyncResult[] = [];
	const touched = new Set<string>();
	try {
		for (const raw of events) {
			const outcome = await handleEvent(db, { keys, playerId, routeOf }, raw);
			results.push({
				id: raw.id,
				status: outcome.status,
				...(outcome.reason ? { reason: outcome.reason } : {}),
			});
			// Only well-formed route ids reach the database (a NUL byte would make PostgreSQL fail).
			if (slugSchema.safeParse(raw.routeId).success)
				touched.add(raw.routeId as string);
		}
	} catch (err) {
		if (err instanceof PlayerGoneError) return null;
		throw err;
	}

	const own = await db
		.selectDistinct({ routeId: progress.routeId })
		.from(progress)
		.where(eq(progress.playerId, playerId));
	for (const { routeId } of own) touched.add(routeId);

	const progressByRoute: Record<string, RouteProgress> = {};
	const statesByRoute: Record<string, StationStates> = {};
	for (const routeId of touched) {
		const route = await routeOf(routeId);
		if (!route) continue;
		progressByRoute[routeId] = await evaluateRoute(db, playerId, route);
		statesByRoute[routeId] = await getStationStates(db, route);
	}
	return {
		results,
		progress: progressByRoute,
		stationStates: statesByRoute,
		serverTime: Date.now(),
	};
}
