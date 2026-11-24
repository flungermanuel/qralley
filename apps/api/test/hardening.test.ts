import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { base64urlEncode } from "@qurally/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { buildApp } from "../src/app";
import { players, reports, stationState } from "../src/db/schema";
import { setStationStatus } from "../src/domain/station-admin";
import { parseSigningKeys, signToken } from "../src/domain/token";
import {
	bearer,
	type Credentials,
	newCredentials,
	openTestDb,
	publishExample,
	resetDb,
} from "./helpers";

const { db, close } = openTestDb();
const keys = new Map([[1, Buffer.alloc(32, 1)]]);
const ROUTE = "innsbruck-altstadt";
const G = "goldenes-dachl";
const A = "annasaeule";
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

async function player(): Promise<Credentials> {
	const c = newCredentials();
	await app.inject({ method: "POST", url: "/api/players", payload: c });
	return c;
}

const report = (
	stationId: string,
	kind: string,
	extra: Record<string, unknown> = {},
) => ({
	id: randomUUID(),
	type: "report",
	routeId: ROUTE,
	stationId,
	kind,
	...extra,
});

const sync = (c: Credentials, events: unknown[]) =>
	app.inject({
		method: "POST",
		url: "/api/sync",
		headers: bearer(c),
		payload: { events },
	});

const statusOf = async (stationId: string) =>
	(
		await db
			.select()
			.from(stationState)
			.where(eq(stationState.stationId, stationId))
	)[0]?.status;

describe("station blocking under concurrency (review finding 1)", () => {
	it("AK-REP-02: unsafe reports of two players arriving at the same moment block the station", async () => {
		for (let round = 0; round < 6; round++) {
			await resetDb(db);
			await publishExample(db);
			const [a, b] = [await player(), await player()];

			const [ra, rb] = await Promise.all([
				sync(a, [report(G, "unsafe")]),
				sync(b, [report(G, "unsafe")]),
			]);

			expect(ra.statusCode).toBe(200);
			expect(rb.statusCode).toBe(200);
			expect(await statusOf(G), `round ${round}`).toBe("blocked");
		}
	});

	it("a blocked station is never reset by a report that raced with the block", async () => {
		for (let round = 0; round < 4; round++) {
			await resetDb(db);
			await publishExample(db);
			const [a, b, c] = [await player(), await player(), await player()];
			await Promise.all([
				sync(a, [report(A, "unsafe")]),
				sync(b, [report(A, "unsafe")]),
				sync(c, [report(A, "code_missing")]),
			]);
			expect(await statusOf(A), `round ${round}`).toBe("blocked");
		}
	});
});

describe("robust input handling (review findings 3, 6, 7)", () => {
	it("AK-REP-07: a note with a NUL byte is rejected as malformed, not a 500", async () => {
		const c = await player();
		const bad = report(G, "other", { note: "a\u0000b" });
		const good = report(A, "other", { note: "Aufkleber ab\nund schief" });
		const res = await sync(c, [bad, good]);

		expect(res.statusCode).toBe(200);
		const { results } = res.json();
		expect(results[0]).toMatchObject({
			id: bad.id,
			status: "rejected",
			reason: "malformed",
		});
		expect(results[1]).toMatchObject({ id: good.id, status: "accepted" });
		expect(await db.select().from(reports)).toHaveLength(1);
	});

	it("an event with a poisonous routeId does not break the rest of the batch", async () => {
		const c = await player();
		const bad = { ...report(G, "other"), routeId: "\u0000" };
		const good = report(A, "other");
		const res = await sync(c, [bad, good]);

		expect(res.statusCode).toBe(200);
		expect(res.json().results.map((r: { status: string }) => r.status)).toEqual(
			["rejected", "accepted"],
		);
	});

	it("a malformed Bearer id gets the uniform 401, not a 500", async () => {
		const secret = "A".repeat(43);
		for (const header of [
			`Bearer ${"-".repeat(36)}.${secret}`,
			`Bearer ${"a".repeat(36)}.${secret}`,
			`Bearer ${"0".repeat(36)}.${secret}`,
		]) {
			const res = await app.inject({
				method: "DELETE",
				url: "/api/players/me",
				headers: { authorization: header },
			});
			expect(res.statusCode, header).toBe(401);
			expect(res.json()).toEqual({ error: "unauthorized" });
		}
	});

	it("still accepts valid credentials with an upper-case id", async () => {
		const c = await player();
		const res = await app.inject({
			method: "DELETE",
			url: "/api/players/me",
			headers: bearer({ ...c, playerId: c.playerId.toUpperCase() }),
		});
		expect(res.statusCode).toBe(204);
		expect(
			await db.select().from(players).where(eq(players.id, c.playerId)),
		).toHaveLength(0);
	});
});

describe("error logging (review finding 5)", () => {
	it("AK-PRIV-01: a database error never puts bound parameters into the log", async () => {
		let output = "";
		const stream = new Writable({
			write(chunk, _enc, cb) {
				output += chunk.toString();
				cb();
			},
		});
		const logged = buildApp({ db, logStream: stream, logLevel: "info" });
		await logged.ready();

		const secret = base64urlEncode(Buffer.alloc(32, 9));
		const playerId = randomUUID();
		vi.spyOn(db, "insert").mockImplementation(() => {
			throw Object.assign(
				new Error(
					`Failed query: insert into "players" values ($1, $2)\nparams: ${playerId},TOPSECRETHASH`,
				),
				{ code: "53300" },
			);
		});
		const res = await logged.inject({
			method: "POST",
			url: "/api/players",
			payload: { playerId, secret },
		});
		vi.restoreAllMocks();
		await logged.close();

		expect(res.statusCode).toBe(500);
		expect(res.json()).toEqual({ error: "internal_error" });
		expect(output).toContain("unhandled error");
		expect(output).not.toContain("TOPSECRETHASH");
		expect(output).not.toContain(playerId);
		expect(output).not.toContain("params");
		expect(output).toContain("53300");
	});
});

describe("signing keys in production (review finding 8)", () => {
	const key = (bytes: Buffer) =>
		JSON.stringify({ "1": base64urlEncode(bytes) });

	it("rejects low-entropy keys when production is on", () => {
		expect(() =>
			parseSigningKeys(key(Buffer.alloc(32, 7)), { production: true }),
		).toThrow(/QR_SIGNING_KEYS.*entropy|random/i);
		expect(() =>
			parseSigningKeys(key(Buffer.alloc(32, 1)), { production: true }),
		).toThrow(/QR_SIGNING_KEYS/);
	});

	it("rejects the known e2e test key in production", () => {
		const e2e = JSON.stringify({
			"1": Buffer.alloc(32, 7).toString("base64url"),
		});
		expect(() => parseSigningKeys(e2e, { production: true })).toThrow(
			/QR_SIGNING_KEYS/,
		);
	});

	it("accepts random keys in production", () => {
		const random = Buffer.from(
			Array.from({ length: 32 }, (_, i) => (i * 37 + 11) % 256),
		);
		expect(
			parseSigningKeys(key(random), { production: true }).get(1)?.length,
		).toBe(32);
	});

	it("keeps accepting test keys outside production", () => {
		expect(
			parseSigningKeys(key(Buffer.alloc(32, 7)), { production: false }).size,
		).toBe(1);
	});

	it("the secret never appears in the message", () => {
		const weak = base64urlEncode(Buffer.alloc(32, 7));
		try {
			parseSigningKeys(JSON.stringify({ "1": weak }), { production: true });
			expect.unreachable();
		} catch (err) {
			expect((err as Error).message).not.toContain(weak);
		}
	});
});

describe("operator: setStationStatus (AK-REP-05)", () => {
	it("blocks a station with a reason", async () => {
		await setStationStatus(db, ROUTE, G, "blocked", "Baustelle");
		const [row] = await db
			.select()
			.from(stationState)
			.where(eq(stationState.stationId, G));
		expect(row).toMatchObject({ status: "blocked", statusReason: "Baustelle" });
	});

	it("AK-REP-05: setting a station back to ok resolves its open reports", async () => {
		const c = await player();
		await sync(c, [report(G, "unsafe"), report(A, "other")]);
		await setStationStatus(db, ROUTE, G, "blocked");

		await setStationStatus(db, ROUTE, G, "ok");

		expect(await statusOf(G)).toBe("ok");
		const rows = await db.select().from(reports);
		expect(rows.find((r) => r.stationId === G)?.status).toBe("resolved");
		expect(rows.find((r) => r.stationId === A)?.status).toBe("open");
	});

	it("a resolved report no longer counts toward blocking and can be sent again", async () => {
		const a = await player();
		const b = await player();
		await sync(a, [report(G, "unsafe")]);
		await setStationStatus(db, ROUTE, G, "ok");
		await sync(b, [report(G, "unsafe")]);
		expect(await statusOf(G)).toBe("reported");
		const again = await sync(a, [report(G, "unsafe")]);
		expect(again.json().results[0].status).toBe("accepted");
	});

	it("the change shows up in the route bundle", async () => {
		await setStationStatus(db, ROUTE, A, "blocked", "x");
		const bundle = (
			await app.inject({ method: "GET", url: `/api/routes/${ROUTE}` })
		).json();
		expect(bundle.stationStates[A]).toEqual({ status: "blocked", reason: "x" });
	});

	it("rejects unknown routes, stations and statuses", async () => {
		await expect(setStationStatus(db, "nope", G, "ok")).rejects.toThrow(
			/route/i,
		);
		await expect(
			setStationStatus(db, ROUTE, "nirgendwo", "ok"),
		).rejects.toThrow(/station/i);
		await expect(
			setStationStatus(db, ROUTE, G, "kaputt" as never),
		).rejects.toThrow(/status/i);
	});

	it("signing still works unchanged (smoke)", () => {
		expect(
			signToken(keys, { routeId: ROUTE, stationId: G, keyVersion: 1 }),
		).toMatch(/^q1\./);
	});
});
