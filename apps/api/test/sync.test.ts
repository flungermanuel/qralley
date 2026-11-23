import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import {
	badgesAwarded,
	players,
	progress,
	reports,
	routeVersions,
	stationState,
	syncEvents,
} from "../src/db/schema";
import { signToken } from "../src/domain/token";
import {
	bearer,
	type Credentials,
	newCredentials,
	openTestDb,
	publishExample,
	resetDb,
} from "./helpers";

const { db, close } = openTestDb();
const keys = new Map([
	[1, Buffer.alloc(32, 1)],
	[2, Buffer.alloc(32, 2)],
	[3, Buffer.alloc(32, 3)],
]);
let app: FastifyInstance;

beforeAll(async () => {
	app = buildApp({
		db,
		signingKeys: keys,
		rateLimit: { playersPerMinute: 10_000, globalPerMinute: 100_000 },
	});
	await app.ready();
});
afterAll(async () => {
	await app.close();
	await close();
});
beforeEach(async () => {
	await resetDb(db);
	await publishExample(db);
});

const ROUTE = "innsbruck-altstadt";
const G = "goldenes-dachl"; // quest choice "a"; fallback text "3"; radius 40
const A = "annasaeule"; // quest text "1706"; fallback choice "a"
const H = "hofkirche"; // quest text "Universitätsstraße"; no fallback
const QUEST_ANSWER: Record<string, string> = {
	[G]: "a",
	[A]: "1706",
	[H]: "Universitätsstraße",
};
const POSITION: Record<string, { lat: number; lng: number }> = {
	[G]: { lat: 47.268534, lng: 11.393377 },
	[A]: { lat: 47.264, lng: 11.3947 },
};

const token = (
	stationId: string,
	over: { routeId?: string; keyVersion?: number } = {},
) => signToken(keys, { routeId: ROUTE, stationId, keyVersion: 1, ...over });

const ev = {
	scan: (stationId: string, over: Record<string, unknown> = {}) => ({
		id: randomUUID(),
		type: "scan",
		routeId: ROUTE,
		token: token(stationId),
		...over,
	}),
	answer: (
		stationId: string,
		answer = QUEST_ANSWER[stationId],
		over: Record<string, unknown> = {},
	) => ({
		id: randomUUID(),
		type: "quest_answer",
		routeId: ROUTE,
		stationId,
		answer,
		...over,
	}),
	fallback: (stationId: string, over: Record<string, unknown> = {}) => ({
		id: randomUUID(),
		type: "fallback_checkin",
		routeId: ROUTE,
		stationId,
		position: { ...POSITION[stationId], accuracyM: 12 },
		answer: stationId === G ? "3" : "a",
		...over,
	}),
	report: (
		stationId: string,
		kind: string,
		over: Record<string, unknown> = {},
	) => ({
		id: randomUUID(),
		type: "report",
		routeId: ROUTE,
		stationId,
		kind,
		...over,
	}),
};

async function player(): Promise<Credentials> {
	const c = newCredentials();
	await app.inject({ method: "POST", url: "/api/players", payload: c });
	return c;
}

async function sync(c: Credentials, events: unknown[]) {
	const res = await app.inject({
		method: "POST",
		url: "/api/sync",
		headers: bearer(c),
		payload: { events },
	});
	return { status: res.statusCode, body: res.json() };
}

async function one(c: Credentials, event: unknown) {
	const { status, body } = await sync(c, [event]);
	expect(status).toBe(200);
	return {
		...body.results[0],
		progress: body.progress[ROUTE],
		stationStates: body.stationStates[ROUTE],
	};
}

async function complete(c: Credentials, stationId: string) {
	await sync(c, [ev.scan(stationId), ev.answer(stationId)]);
}

const progressRows = (playerId: string) =>
	db.select().from(progress).where(eq(progress.playerId, playerId));
const stateOf = async (stationId: string) =>
	(
		await db
			.select()
			.from(stationState)
			.where(eq(stationState.stationId, stationId))
	)[0];

describe("authentication and envelope", () => {
	it("AK-PROF-04: wrong secret gives 401 and changes nothing", async () => {
		const c = await player();
		const res = await app.inject({
			method: "POST",
			url: "/api/sync",
			headers: bearer({ ...c, secret: newCredentials().secret }),
			payload: { events: [ev.scan(G)] },
		});
		expect(res.statusCode).toBe(401);
		expect(await progressRows(c.playerId)).toHaveLength(0);
		expect(await db.select().from(syncEvents)).toHaveLength(0);
	});

	it("gives 401 without credentials", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/sync",
			payload: { events: [] },
		});
		expect(res.statusCode).toBe(401);
	});

	it("AK-SYNC-07: rejects more than 50 events per request", async () => {
		const c = await player();
		const events = Array.from({ length: 51 }, () => ev.report(G, "other"));
		expect((await sync(c, events)).status).toBe(400);
		expect(await db.select().from(syncEvents)).toHaveLength(0);
	});

	it("accepts exactly 50 events", async () => {
		const c = await player();
		const events = Array.from({ length: 50 }, () => ev.scan(G));
		const { status, body } = await sync(c, events);
		expect(status).toBe(200);
		expect(body.results).toHaveLength(50);
	});

	it.each([
		["events is not an array", { events: "x" }],
		["no events field", {}],
		["event without id", { events: [{ type: "scan" }] }],
		["event with non-uuid id", { events: [{ id: "abc", type: "scan" }] }],
	])("rejects an envelope where %s with 400", async (_name, payload) => {
		const c = await player();
		const res = await app.inject({
			method: "POST",
			url: "/api/sync",
			headers: bearer(c),
			payload,
		});
		expect(res.statusCode).toBe(400);
	});

	it("answers an empty batch with the current progress", async () => {
		const c = await player();
		await complete(c, G);
		const { status, body } = await sync(c, []);
		expect(status).toBe(200);
		expect(body.results).toEqual([]);
		expect(body.progress[ROUTE].totalXp).toBe(50);
		expect(typeof body.serverTime).toBe("number");
	});

	it("returns results in input order and rejects malformed events individually", async () => {
		const c = await player();
		const bad = { id: randomUUID(), type: "teleport", routeId: ROUTE };
		const good = ev.scan(G);
		const { body } = await sync(c, [bad, good]);
		expect(body.results.map((r: { id: string }) => r.id)).toEqual([
			bad.id,
			good.id,
		]);
		expect(body.results[0]).toMatchObject({
			status: "rejected",
			reason: "malformed",
		});
		expect(body.results[1]).toMatchObject({ status: "accepted" });
	});

	it("AK-REP-07: rejects a note longer than 200 characters as malformed", async () => {
		const c = await player();
		const r = await one(c, ev.report(G, "other", { note: "x".repeat(201) }));
		expect(r).toMatchObject({ status: "rejected", reason: "malformed" });
		expect(await db.select().from(reports)).toHaveLength(0);
	});

	it("AK-SYNC-08: clientTs does not influence results", async () => {
		const c = await player();
		const a = await one(c, ev.scan(G, { clientTs: 1 }));
		const b = await one(c, ev.scan(A, { clientTs: 99_999_999_999_999 }));
		expect(a.status).toBe("accepted");
		expect(b.status).toBe("accepted");
		expect(b.progress.totalXp).toBe(20);
	});
});

describe("scan", () => {
	it("AK-SCAN-01: a valid token visits the station and gives scan XP", async () => {
		const c = await player();
		const r = await one(c, ev.scan(G));
		expect(r.status).toBe("accepted");
		expect(r.progress.totalXp).toBe(10);
		expect(r.progress.stations[G]).toEqual({
			state: "visited",
			method: "scan",
		});
		expect(await progressRows(c.playerId)).toHaveLength(1);
	});

	it("AK-SCAN-02: a forged signature is rejected without XP", async () => {
		const c = await player();
		const forged = `${token(G).slice(0, -2)}AA`;
		const r = await one(c, ev.scan(G, { token: forged }));
		expect(r).toMatchObject({ status: "rejected", reason: "invalid_token" });
		expect(await progressRows(c.playerId)).toHaveLength(0);
		const [row] = await db.select().from(syncEvents);
		expect(row).toMatchObject({ result: "rejected", reason: "invalid_token" });
	});

	it("rejects garbage tokens as invalid_token", async () => {
		const c = await player();
		const r = await one(c, ev.scan(G, { token: "garbage" }));
		expect(r).toMatchObject({ status: "rejected", reason: "invalid_token" });
	});

	it("AK-SCAN-03: a token of another route is rejected as wrong_route", async () => {
		const c = await player();
		const r = await one(
			c,
			ev.scan(G, { token: token(G, { routeId: "other-route" }) }),
		);
		expect(r).toMatchObject({ status: "rejected", reason: "wrong_route" });
	});

	it("AK-SCAN-04: an unknown key version is rejected", async () => {
		const c = await player();
		const unknown = signToken(new Map([[9, Buffer.alloc(32, 9)]]), {
			routeId: ROUTE,
			stationId: G,
			keyVersion: 9,
		});
		const r = await one(c, ev.scan(G, { token: unknown }));
		expect(r).toMatchObject({ status: "rejected", reason: "unknown_key" });
	});

	it("rejects a still-valid key version that the station has retired", async () => {
		const c = await player();
		const r = await one(c, ev.scan(G, { token: token(G, { keyVersion: 2 }) }));
		expect(r).toMatchObject({ status: "rejected", reason: "unknown_key" });
	});

	it("rejects a validly signed token for a station that is not in the route", async () => {
		const c = await player();
		const r = await one(c, ev.scan(G, { token: token("geisterstation") }));
		expect(r).toMatchObject({ status: "rejected", reason: "unknown_station" });
	});

	it("rejects a scan for a route that is not published", async () => {
		const c = await player();
		const r = await one(
			c,
			ev.scan(G, { routeId: "ghost", token: token(G, { routeId: "ghost" }) }),
		);
		expect(r).toMatchObject({ status: "rejected", reason: "unknown_route" });
	});

	it("AK-SCAN-05: scanning the same station again gives no more XP", async () => {
		const c = await player();
		await one(c, ev.scan(G));
		const again = await one(c, ev.scan(G));
		expect(again.status).toBe("duplicate");
		expect(again.progress.totalXp).toBe(10);
	});

	it("AK-XP-03: many scans with new event ids still count once", async () => {
		const c = await player();
		const { body } = await sync(
			c,
			Array.from({ length: 10 }, () => ev.scan(G)),
		);
		expect(
			body.results.filter((r: { status: string }) => r.status === "accepted"),
		).toHaveLength(1);
		expect(body.progress[ROUTE].totalXp).toBe(10);
		expect(await progressRows(c.playerId)).toHaveLength(1);
	});

	it("AK-SCAN-06: a blocked station rejects scans without XP", async () => {
		const c = await player();
		await db
			.update(stationState)
			.set({ status: "blocked" })
			.where(eq(stationState.stationId, G));
		const r = await one(c, ev.scan(G));
		expect(r).toMatchObject({ status: "rejected", reason: "station_blocked" });
		expect(await progressRows(c.playerId)).toHaveLength(0);
	});

	it("AK-REP-04: a reported station can still be scanned", async () => {
		const c = await player();
		await db
			.update(stationState)
			.set({ status: "reported" })
			.where(eq(stationState.stationId, G));
		expect((await one(c, ev.scan(G))).status).toBe("accepted");
	});
});

describe("idempotency", () => {
	it("AK-XP-02: the same event id sent again is a duplicate without XP change", async () => {
		const c = await player();
		const event = ev.scan(G);
		const first = await one(c, event);
		const second = await one(c, event);
		expect(first.status).toBe("accepted");
		expect(second.status).toBe("duplicate");
		expect(second.progress.totalXp).toBe(10);
		expect(await db.select().from(syncEvents)).toHaveLength(1);
	});

	it("AK-SYNC-03: the same event twice in one batch is processed once", async () => {
		const c = await player();
		const event = ev.scan(G);
		const { body } = await sync(c, [event, event]);
		expect(body.results.map((r: { status: string }) => r.status)).toEqual([
			"accepted",
			"duplicate",
		]);
	});

	it("a retried rejected event stays rejected with the same reason", async () => {
		const c = await player();
		const event = ev.scan(G, { token: "garbage" });
		await one(c, event);
		const again = await one(c, event);
		expect(again).toMatchObject({
			status: "rejected",
			reason: "invalid_token",
		});
	});

	it("concurrent syncs of the same event are processed exactly once", async () => {
		const c = await player();
		const event = ev.scan(G);
		const [a, b] = await Promise.all([sync(c, [event]), sync(c, [event])]);
		const statuses = [
			a.body.results[0].status,
			b.body.results[0].status,
		].sort();
		expect(statuses).toEqual(["accepted", "duplicate"]);
		expect(await progressRows(c.playerId)).toHaveLength(1);
	});

	it("records only type and outcome of events, nothing else", async () => {
		const c = await player();
		await one(c, ev.scan(G));
		const [row] = await db.select().from(syncEvents);
		expect(Object.keys(row ?? {}).sort()).toEqual(
			[
				"clientEventId",
				"playerId",
				"reason",
				"receivedAt",
				"result",
				"type",
			].sort(),
		);
	});
});

describe("quest_answer", () => {
	it("AK-QUEST-01: a correct answer after the scan completes the station", async () => {
		const c = await player();
		await one(c, ev.scan(G));
		const r = await one(c, ev.answer(G));
		expect(r.status).toBe("accepted");
		expect(r.progress.stations[G]).toEqual({
			state: "completed",
			method: "scan",
		});
		expect(r.progress.totalXp).toBe(50);
	});

	it("AK-QUEST-03: answering before scanning is rejected as not_visited", async () => {
		const c = await player();
		const r = await one(c, ev.answer(G));
		expect(r).toMatchObject({ status: "rejected", reason: "not_visited" });
		expect(await progressRows(c.playerId)).toHaveLength(0);
	});

	it("AK-QUEST-04: a wrong answer is rejected and the station stays visited", async () => {
		const c = await player();
		await one(c, ev.scan(G));
		const r = await one(c, ev.answer(G, "b"));
		expect(r).toMatchObject({ status: "rejected", reason: "answer_incorrect" });
		expect(r.progress.stations[G].state).toBe("visited");
		expect(r.progress.totalXp).toBe(10);
	});

	it("AK-QUEST-05: text answers ignore case and surrounding whitespace", async () => {
		const c = await player();
		await one(c, ev.scan(H));
		const r = await one(c, ev.answer(H, "  UNIVERSITÄTSSTRASSE "));
		expect(r).toMatchObject({ status: "rejected", reason: "answer_incorrect" }); // ß is not "ss"
		const ok = await one(c, ev.answer(H, "  universitätsstraße "));
		expect(ok.status).toBe("accepted");
	});

	it("answering an already completed station is a duplicate without extra XP", async () => {
		const c = await player();
		await complete(c, G);
		const r = await one(c, ev.answer(G));
		expect(r.status).toBe("duplicate");
		expect(r.progress.totalXp).toBe(50);
	});

	it("a blocked station rejects answers", async () => {
		const c = await player();
		await one(c, ev.scan(G));
		await db
			.update(stationState)
			.set({ status: "blocked" })
			.where(eq(stationState.stationId, G));
		const r = await one(c, ev.answer(G));
		expect(r).toMatchObject({ status: "rejected", reason: "station_blocked" });
	});

	it("rejects answers for unknown stations", async () => {
		const c = await player();
		const r = await one(c, ev.answer("nirgendwo", "a"));
		expect(r).toMatchObject({ status: "rejected", reason: "unknown_station" });
	});
});

describe("fallback_checkin", () => {
	it("AK-FALL-01: inside the radius with the right answer completes with reduced XP", async () => {
		const c = await player();
		const r = await one(c, ev.fallback(G));
		expect(r.status).toBe("accepted");
		expect(r.progress.stations[G]).toEqual({
			state: "completed",
			method: "fallback",
		});
		expect(r.progress.totalXp).toBe(25);
	});

	it("AK-FALL-02: a position outside the radius is rejected as too_far", async () => {
		const c = await player();
		const r = await one(
			c,
			ev.fallback(G, {
				position: { lat: 47.2695, lng: 11.3933, accuracyM: 10 },
			}),
		);
		expect(r).toMatchObject({ status: "rejected", reason: "too_far" });
		expect(await progressRows(c.playerId)).toHaveLength(0);
	});

	it("AK-FALL-03: poor accuracy is rejected as accuracy_too_low", async () => {
		const c = await player();
		const r = await one(
			c,
			ev.fallback(G, { position: { ...POSITION[G], accuracyM: 80 } }),
		);
		expect(r).toMatchObject({ status: "rejected", reason: "accuracy_too_low" });
	});

	it("rejects a wrong fallback answer", async () => {
		const c = await player();
		const r = await one(c, ev.fallback(G, { answer: "99" }));
		expect(r).toMatchObject({ status: "rejected", reason: "answer_incorrect" });
		expect(await progressRows(c.playerId)).toHaveLength(0);
	});

	it("the fallback question must be answered, not the regular quest", async () => {
		const c = await player();
		const r = await one(c, ev.fallback(G, { answer: "a" }));
		expect(r).toMatchObject({ status: "rejected", reason: "answer_incorrect" });
	});

	it("AK-FALL-05: a successful fallback creates a code_damaged report and flags the station", async () => {
		const c = await player();
		await one(c, ev.fallback(G));
		const rows = await db.select().from(reports);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			kind: "code_damaged",
			stationId: G,
			playerId: c.playerId,
		});
		expect((await stateOf(G))?.status).toBe("reported");
	});

	it("AK-FALL-06: no coordinates end up in the database", async () => {
		const c = await player();
		await one(c, ev.fallback(G));
		const everything = JSON.stringify([
			await db.select().from(players),
			await db.select().from(progress),
			await db.select().from(syncEvents),
			await db.select().from(reports),
			await db.select().from(badgesAwarded),
			await db.select().from(stationState),
		]);
		expect(everything).not.toContain("47.268534");
		expect(everything).not.toContain("11.393377");
		expect(everything).not.toContain("accuracy");
	});

	it("AK-FALL-08: a fallback on a completed station is a duplicate", async () => {
		const c = await player();
		await complete(c, G);
		const r = await one(c, ev.fallback(G));
		expect(r.status).toBe("duplicate");
		expect(r.progress.totalXp).toBe(50);
	});

	it("AK-FALL-09: a station without fallback rejects check-ins", async () => {
		const c = await player();
		const r = await one(
			c,
			ev.fallback(H, {
				position: { lat: 47.2687, lng: 11.3957, accuracyM: 5 },
			}),
		);
		expect(r).toMatchObject({
			status: "rejected",
			reason: "fallback_disabled",
		});
	});

	it("a blocked station rejects check-ins", async () => {
		const c = await player();
		await db
			.update(stationState)
			.set({ status: "blocked" })
			.where(eq(stationState.stationId, G));
		const r = await one(c, ev.fallback(G));
		expect(r).toMatchObject({ status: "rejected", reason: "station_blocked" });
	});
});

describe("report", () => {
	it("AK-REP-01: a report flags the station and shows up in the route bundle", async () => {
		const c = await player();
		const r = await one(c, ev.report(G, "code_missing"));
		expect(r.status).toBe("accepted");
		expect(r.stationStates[G].status).toBe("reported");
		const bundle = (
			await app.inject({ method: "GET", url: `/api/routes/${ROUTE}` })
		).json();
		expect(bundle.stationStates[G].status).toBe("reported");
		expect(bundle.stationStates[A].status).toBe("ok");
	});

	it("a single unsafe report only flags the station", async () => {
		const c = await player();
		await one(c, ev.report(G, "unsafe"));
		expect((await stateOf(G))?.status).toBe("reported");
	});

	it("AK-REP-02: unsafe reports from two different players block the station", async () => {
		const a = await player();
		const b = await player();
		await one(a, ev.report(G, "unsafe"));
		const r = await one(b, ev.report(G, "unsafe"));
		expect(r.stationStates[G].status).toBe("blocked");
		expect((await stateOf(G))?.status).toBe("blocked");
	});

	it("AK-REP-03: unsafe reports from the same player count once", async () => {
		const a = await player();
		await one(a, ev.report(G, "unsafe"));
		const again = await one(a, ev.report(G, "unsafe"));
		expect(again.status).toBe("duplicate");
		expect((await stateOf(G))?.status).toBe("reported");
		expect(await db.select().from(reports)).toHaveLength(1);
	});

	it("other report kinds from many players never block", async () => {
		for (let i = 0; i < 3; i++)
			await one(await player(), ev.report(G, "code_damaged"));
		expect((await stateOf(G))?.status).toBe("reported");
	});

	it("a blocked station stays blocked after further reports", async () => {
		const c = await player();
		await db
			.update(stationState)
			.set({ status: "blocked" })
			.where(eq(stationState.stationId, G));
		const r = await one(c, ev.report(G, "other"));
		expect(r.status).toBe("accepted");
		expect((await stateOf(G))?.status).toBe("blocked");
	});

	it("AK-REP-06: at most 10 reports per player per day", async () => {
		const c = await player();
		const kinds = ["code_damaged", "code_missing", "unsafe", "other"];
		const events = [G, A, H].flatMap((s) => kinds.map((k) => ev.report(s, k)));
		const { body } = await sync(c, events);
		const statuses = body.results.map((r: { status: string }) => r.status);
		expect(statuses.filter((s: string) => s === "accepted")).toHaveLength(10);
		expect(body.results[10]).toMatchObject({
			status: "rejected",
			reason: "rate_limited",
		});
	});

	it("AK-REP-07: stores the note as plain text", async () => {
		const c = await player();
		const note = "<script>alert(1)</script>";
		await one(c, ev.report(G, "other", { note }));
		expect((await db.select().from(reports))[0]?.note).toBe(note);
	});

	it("rejects reports for unknown stations", async () => {
		const c = await player();
		const r = await one(c, ev.report("nirgendwo", "other"));
		expect(r).toMatchObject({ status: "rejected", reason: "unknown_station" });
	});
});

describe("badge", () => {
	it("AK-BADGE-01: completing all stations awards the badge exactly once", async () => {
		const c = await player();
		await complete(c, G);
		await complete(c, A);
		const last = await (async () => {
			await sync(c, [ev.scan(H)]);
			return one(c, ev.answer(H));
		})();
		expect(last.progress.badges).toEqual(["altstadt-entdecker"]);
		expect(last.progress.complete).toBe(true);
		expect(await db.select().from(badgesAwarded)).toHaveLength(1);
	});

	it("is not awarded while a station is missing or only visited", async () => {
		const c = await player();
		await complete(c, G);
		await complete(c, A);
		const r = await one(c, ev.scan(H));
		expect(r.progress.badges).toEqual([]);
		expect(r.progress.complete).toBe(false);
	});

	it("AK-BADGE-02: a station blocked later lets the remaining progress complete the route", async () => {
		const c = await player();
		await complete(c, G);
		await complete(c, A);
		await db
			.update(stationState)
			.set({ status: "blocked" })
			.where(eq(stationState.stationId, H));
		const { body } = await sync(c, []);
		expect(body.progress[ROUTE].badges).toEqual(["altstadt-entdecker"]);
	});

	it("AK-BADGE-03: repeated syncs never create a second badge", async () => {
		const c = await player();
		await complete(c, G);
		await complete(c, A);
		await complete(c, H);
		await sync(c, []);
		await sync(c, []);
		expect(await db.select().from(badgesAwarded)).toHaveLength(1);
	});

	it("AK-FALL-01 + BADGE: fallback completions count for the badge", async () => {
		const c = await player();
		await one(c, ev.fallback(G));
		await one(c, ev.fallback(A));
		await complete(c, H);
		expect(await db.select().from(badgesAwarded)).toHaveLength(1);
	});
});

describe("player isolation", () => {
	it("one player's progress does not affect another's", async () => {
		const a = await player();
		const b = await player();
		await complete(a, G);
		const { body } = await sync(b, []);
		expect(body.progress[ROUTE] ?? { totalXp: 0 }).toMatchObject({
			totalXp: 0,
		});
	});

	it("routes without published versions are not touched", async () => {
		await db.delete(routeVersions);
		const c = await player();
		const r = await one(c, ev.scan(G));
		expect(r).toMatchObject({ status: "rejected", reason: "unknown_route" });
	});
});
