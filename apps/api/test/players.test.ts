import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import {
	badgesAwarded,
	players,
	progress,
	reports,
	syncEvents,
} from "../src/db/schema";
import { bearer, newCredentials, openTestDb, resetDb } from "./helpers";

const { db, close } = openTestDb();
let app: FastifyInstance;

beforeAll(async () => {
	app = buildApp({ db });
	await app.ready();
});
afterAll(async () => {
	await app.close();
	await close();
});
beforeEach(() => resetDb(db));

const register = (c: { playerId: string; secret: string }) =>
	app.inject({ method: "POST", url: "/api/players", payload: c });

describe("POST /api/players", () => {
	it("AK-PROF-02: registers a new player", async () => {
		const c = newCredentials();
		const res = await register(c);
		expect(res.statusCode).toBe(201);
		expect(res.json()).toEqual({ created: true });
		expect(await db.select().from(players)).toHaveLength(1);
	});

	it("AK-PROF-02: is idempotent for the same credentials", async () => {
		const c = newCredentials();
		await register(c);
		const again = await register(c);
		expect(again.statusCode).toBe(200);
		expect(again.json()).toEqual({ created: false });
		expect(await db.select().from(players)).toHaveLength(1);
	});

	it("rejects a different secret for an existing player id (409)", async () => {
		const c = newCredentials();
		await register(c);
		const res = await register({
			playerId: c.playerId,
			secret: newCredentials().secret,
		});
		expect(res.statusCode).toBe(409);
	});

	it.each([
		["not a uuid", { playerId: "abc", secret: newCredentials().secret }],
		[
			"short secret",
			{ playerId: newCredentials().playerId, secret: "c2hvcnQ" },
		],
		[
			"non-base64url secret",
			{ playerId: newCredentials().playerId, secret: "!".repeat(43) },
		],
		["missing fields", {}],
		["extra fields", { ...newCredentials(), name: "Max" }],
	])("rejects %s with 400", async (_name, payload) => {
		const res = await app.inject({
			method: "POST",
			url: "/api/players",
			payload,
		});
		expect(res.statusCode).toBe(400);
		expect(res.json()).toEqual({ error: "invalid_request" });
		expect(await db.select().from(players)).toHaveLength(0);
	});

	it("AK-PROF-05: stores only a hash, never the secret", async () => {
		const c = newCredentials();
		await register(c);
		const [row] = await db.select().from(players);
		expect(row?.secretHash).toMatch(/^[0-9a-f]{64}$/);
		expect(JSON.stringify(row)).not.toContain(c.secret);
	});

	it("does not echo the secret in the response", async () => {
		const c = newCredentials();
		const res = await register(c);
		expect(res.body).not.toContain(c.secret);
	});
});

describe("authentication (DELETE /api/players/me)", () => {
	it("AK-PROF-04: wrong secret gives 401 and changes nothing", async () => {
		const c = newCredentials();
		await register(c);
		const res = await app.inject({
			method: "DELETE",
			url: "/api/players/me",
			headers: bearer({ ...c, secret: newCredentials().secret }),
		});
		expect(res.statusCode).toBe(401);
		expect(await db.select().from(players)).toHaveLength(1);
	});

	it.each([
		["no header", undefined],
		["wrong scheme", "Basic abc"],
		["no dot", "Bearer abc"],
		["garbage", "Bearer a.b.c.d"],
		["empty", "Bearer "],
	])("AK-PROF-04: %s gives 401", async (_name, header) => {
		const res = await app.inject({
			method: "DELETE",
			url: "/api/players/me",
			headers: header === undefined ? {} : { authorization: header },
		});
		expect(res.statusCode).toBe(401);
	});

	it("gives 401 for an unknown player (same answer as a wrong secret)", async () => {
		const res = await app.inject({
			method: "DELETE",
			url: "/api/players/me",
			headers: bearer(newCredentials()),
		});
		expect(res.statusCode).toBe(401);
		expect(res.json()).toEqual({ error: "unauthorized" });
	});
});

describe("DELETE /api/players/me", () => {
	it("AK-PROF-03: removes the player and their data, keeps reports without player link", async () => {
		const a = newCredentials();
		const b = newCredentials();
		await register(a);
		await register(b);

		for (const id of [a.playerId, b.playerId]) {
			await db.insert(progress).values({
				playerId: id,
				routeId: "r",
				stationId: "s",
				state: "completed",
				method: "scan",
				scanXp: 10,
				questXp: 40,
			});
			await db
				.insert(badgesAwarded)
				.values({ playerId: id, routeId: "r", badgeId: "b" });
			await db.insert(syncEvents).values({
				playerId: id,
				clientEventId: crypto.randomUUID(),
				type: "scan",
				result: "accepted",
			});
			await db.insert(reports).values({
				playerId: id,
				routeId: "r",
				stationId: "s",
				kind: "other",
				note: "x",
			});
		}

		const res = await app.inject({
			method: "DELETE",
			url: "/api/players/me",
			headers: bearer(a),
		});
		expect(res.statusCode).toBe(204);

		expect((await db.select().from(players)).map((p) => p.id)).toEqual([
			b.playerId,
		]);
		expect((await db.select().from(progress)).map((p) => p.playerId)).toEqual([
			b.playerId,
		]);
		expect(
			(await db.select().from(badgesAwarded)).map((p) => p.playerId),
		).toEqual([b.playerId]);
		expect((await db.select().from(syncEvents)).map((p) => p.playerId)).toEqual(
			[b.playerId],
		);

		const allReports = await db.select().from(reports);
		expect(allReports).toHaveLength(2);
		expect(allReports.filter((r) => r.playerId === a.playerId)).toHaveLength(0);
		expect(allReports.filter((r) => r.playerId === null)).toHaveLength(1);
		expect(
			await db.select().from(reports).where(eq(reports.playerId, b.playerId)),
		).toHaveLength(1);
	});

	it("the deleted credentials no longer authenticate", async () => {
		const c = newCredentials();
		await register(c);
		await app.inject({
			method: "DELETE",
			url: "/api/players/me",
			headers: bearer(c),
		});
		const again = await app.inject({
			method: "DELETE",
			url: "/api/players/me",
			headers: bearer(c),
		});
		expect(again.statusCode).toBe(401);
	});
});
