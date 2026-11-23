import { describe, expect, it, vi } from "vitest";
import { getOrCreateProfile } from "../src/data/profile";
import { answerQuest } from "../src/data/quest";
import { processScan } from "../src/data/scan";
import { backoffDelay, syncOutbox } from "../src/data/sync";
import { FakeServer } from "./fake-server";
import { bundleFixture, qrUrl, testDb, tokenFor } from "./helpers";

const ROUTE = "innsbruck-altstadt";
type Db = ReturnType<typeof testDb>;

async function scan(db: Db, stationId: string, bundle = bundleFixture()) {
	return processScan(db, bundle, qrUrl(tokenFor(stationId)));
}

async function scanAndAnswer(
	db: Db,
	stationId: string,
	answer: string,
	bundle = bundleFixture(),
) {
	await scan(db, stationId, bundle);
	await answerQuest(db, bundle, stationId, answer);
}

const row = (db: Db, stationId: string) => db.progress.get([ROUTE, stationId]);

describe("outbox entries", () => {
	it("AK-SYNC-01: a scan writes progress and an outbox entry with a uuid", async () => {
		const db = testDb();
		await scan(db, "goldenes-dachl");

		const [entry] = await db.outbox.toArray();
		expect(entry?.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(entry?.event).toMatchObject({
			id: entry?.id,
			type: "scan",
			routeId: ROUTE,
			token: tokenFor("goldenes-dachl"),
		});
		expect(entry?.attempts).toBe(0);
		expect(await row(db, "goldenes-dachl")).toMatchObject({
			state: "visited",
			confirmed: false,
		});
	});

	it("AK-SYNC-01: progress and outbox entry are written atomically", async () => {
		const db = testDb();
		vi.spyOn(db.outbox, "add").mockRejectedValue(new Error("disk full"));
		await expect(scan(db, "goldenes-dachl")).rejects.toThrow("disk full");
		expect(await db.progress.count()).toBe(0);
	});

	it("a correct answer enqueues a quest_answer event", async () => {
		const db = testDb();
		await scanAndAnswer(db, "annasaeule", "  1706 ");
		const events = (await db.outbox.toArray()).map((e) => e.event);
		expect(events.map((e) => e.type)).toEqual(["scan", "quest_answer"]);
		expect(events[1]).toMatchObject({
			stationId: "annasaeule",
			answer: "  1706 ",
		});
	});

	it("AK-SCAN-07: foreign codes enqueue nothing", async () => {
		const db = testDb();
		await processScan(db, bundleFixture(), "https://example.org/x");
		expect(await db.outbox.count()).toBe(0);
	});

	it("AK-QUEST-02: wrong answers and repeated scans enqueue nothing", async () => {
		const db = testDb();
		const bundle = bundleFixture();
		await scan(db, "goldenes-dachl", bundle);
		await answerQuest(db, bundle, "goldenes-dachl", "b");
		await scan(db, "goldenes-dachl", bundle);
		expect(await db.outbox.count()).toBe(1);
	});

	it("keeps the creation order", async () => {
		const db = testDb();
		await scan(db, "annasaeule");
		await scan(db, "goldenes-dachl");
		await scan(db, "hofkirche");
		const tokens = (await db.outbox.orderBy("seq").toArray()).map(
			(e) => (e.event as { token: string }).token,
		);
		expect(tokens).toEqual([
			tokenFor("annasaeule"),
			tokenFor("goldenes-dachl"),
			tokenFor("hofkirche"),
		]);
	});
});

describe("syncOutbox", () => {
	it("AK-SYNC-02: sends events in creation order, empties the outbox and confirms progress", async () => {
		const db = testDb();
		const server = new FakeServer();
		await scanAndAnswer(db, "goldenes-dachl", "a");
		await scan(db, "annasaeule");
		const expected = (await db.outbox.orderBy("seq").toArray()).map(
			(e) => e.id,
		);

		const result = await syncOutbox(db, server.fetch);

		expect(result).toMatchObject({ status: "synced", pending: 0 });
		expect(server.receivedIds).toEqual(expected);
		expect(await db.outbox.count()).toBe(0);
		expect(await row(db, "goldenes-dachl")).toMatchObject({
			state: "completed",
			confirmed: true,
		});
		expect(await row(db, "annasaeule")).toMatchObject({
			state: "visited",
			confirmed: true,
		});
	});

	it("authenticates with the local profile and registers first", async () => {
		const db = testDb();
		const server = new FakeServer();
		await scan(db, "goldenes-dachl");
		const profile = await getOrCreateProfile(db);

		await syncOutbox(db, server.fetch);

		expect(server.calls.map((c) => c.url)).toEqual([
			"/api/players",
			"/api/sync",
		]);
		expect(server.playerCalls[0]?.body).toEqual({
			playerId: profile.playerId,
			secret: profile.secret,
		});
		expect(server.syncCalls[0]?.authorization).toBe(
			`Bearer ${profile.playerId}.${profile.secret}`,
		);
		expect((await db.profile.get("me"))?.registered).toBe(true);
	});

	it("registers only once", async () => {
		const db = testDb();
		const server = new FakeServer();
		await scan(db, "goldenes-dachl");
		await syncOutbox(db, server.fetch);
		await scan(db, "annasaeule");
		await syncOutbox(db, server.fetch);
		expect(server.playerCalls).toHaveLength(1);
	});

	it("does nothing (and does not register) while there is nothing to sync and no account", async () => {
		const db = testDb();
		const server = new FakeServer();
		expect(await syncOutbox(db, server.fetch)).toMatchObject({
			status: "nothing",
			pending: 0,
		});
		expect(server.calls).toHaveLength(0);
		expect((await getOrCreateProfile(db)).registered).toBe(false);
	});

	it("reconciles with an empty batch once registered", async () => {
		const db = testDb();
		const server = new FakeServer();
		await scan(db, "goldenes-dachl");
		await syncOutbox(db, server.fetch);
		server.calls.length = 0;
		expect((await syncOutbox(db, server.fetch)).status).toBe("synced");
		expect(server.syncCalls).toHaveLength(1);
		expect(server.syncCalls[0]?.body).toEqual({ events: [] });
	});

	it("AK-SYNC-03: a network failure keeps every event and counts the attempt", async () => {
		const db = testDb();
		const server = new FakeServer();
		await scanAndAnswer(db, "goldenes-dachl", "a");
		server.failNext = 1;

		const result = await syncOutbox(db, server.fetch);

		expect(result).toMatchObject({ status: "offline", pending: 2 });
		const entries = await db.outbox.toArray();
		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({
			attempts: 1,
			lastError: expect.any(String),
		});
		expect(await row(db, "goldenes-dachl")).toMatchObject({ confirmed: false });

		expect((await syncOutbox(db, server.fetch)).status).toBe("synced");
		expect(await db.outbox.count()).toBe(0);
	});

	it("AK-SYNC-03: a lost response is harmless, the retry is answered as duplicate", async () => {
		const db = testDb();
		const server = new FakeServer();
		await scanAndAnswer(db, "goldenes-dachl", "a");
		server.dropResponseNext = 1;

		expect((await syncOutbox(db, server.fetch)).status).toBe("offline");
		expect(server.serverStation("goldenes-dachl")).toMatchObject({
			state: "completed",
		});

		const retry = await syncOutbox(db, server.fetch);
		expect(retry.status).toBe("synced");
		expect(retry.rejected).toBe(0);
		expect(await db.outbox.count()).toBe(0);
		expect(await row(db, "goldenes-dachl")).toMatchObject({
			state: "completed",
			confirmed: true,
		});
		expect(new Set(server.receivedIds).size).toBe(2);
	});

	it("AK-SYNC-04: a rejected scan is rolled back and the reason is kept for the player", async () => {
		const db = testDb();
		const server = new FakeServer();
		await scanAndAnswer(db, "goldenes-dachl", "a");
		server.rejectType.set("scan", "invalid_token");

		const result = await syncOutbox(db, server.fetch);

		expect(result).toMatchObject({ status: "synced", rejected: 2 });
		expect(await db.progress.count()).toBe(0);
		expect(await db.outbox.count()).toBe(0);
		const issues = await db.issues.toArray();
		expect(issues.map((i) => i.reason).sort()).toEqual([
			"invalid_token",
			"not_visited",
		]);
		expect(issues.every((i) => i.stationId === "goldenes-dachl")).toBe(true);
	});

	it("a rejected answer reverts the station to visited (confirmed)", async () => {
		const db = testDb();
		const server = new FakeServer();
		await scanAndAnswer(db, "goldenes-dachl", "a");
		server.rejectType.set("quest_answer", "answer_incorrect");

		await syncOutbox(db, server.fetch);

		expect(await row(db, "goldenes-dachl")).toMatchObject({
			state: "visited",
			confirmed: true,
		});
		expect((await db.issues.toArray()).map((i) => i.reason)).toEqual([
			"answer_incorrect",
		]);
	});

	it("AK-SYNC-07: sends at most 50 events per request, in order", async () => {
		const db = testDb();
		const server = new FakeServer();
		await db.outbox.bulkAdd(
			Array.from({ length: 120 }, (_, i) => ({
				id: crypto.randomUUID(),
				event: {
					id: "",
					type: "report" as const,
					routeId: ROUTE,
					stationId: "goldenes-dachl",
					kind: "other" as const,
					note: `n${i}`,
				},
				createdAt: i,
				attempts: 0,
			})),
		);
		for (const entry of await db.outbox.toArray()) {
			await db.outbox.update(entry.seq as number, {
				event: { ...entry.event, id: entry.id },
			});
		}
		const expected = (await db.outbox.orderBy("seq").toArray()).map(
			(e) => e.id,
		);

		const result = await syncOutbox(db, server.fetch);

		expect(result.status).toBe("synced");
		expect(
			server.syncCalls.map(
				(c) => (c.body as { events: unknown[] }).events.length,
			),
		).toEqual([50, 50, 20]);
		expect(server.receivedIds).toEqual(expected);
		expect(await db.outbox.count()).toBe(0);
	});

	it("re-registers once when the server does not know the player (401), then retries", async () => {
		const db = testDb();
		const server = new FakeServer();
		await scan(db, "goldenes-dachl");
		await syncOutbox(db, server.fetch);
		await scan(db, "annasaeule");

		let first = true;
		const flaky: typeof fetch = async (input, init) => {
			if (String(input) === "/api/sync" && first) {
				first = false;
				server.calls.push({
					url: "/api/sync",
					method: "POST",
					body: null,
					authorization: null,
				});
				return new Response("{}", { status: 401 });
			}
			return server.fetch(input, init);
		};
		const result = await syncOutbox(db, flaky);

		expect(result.status).toBe("synced");
		expect(server.playerCalls).toHaveLength(2);
		expect(await db.outbox.count()).toBe(0);
	});

	it("gives up on a repeated 401 without losing events", async () => {
		const db = testDb();
		const server = new FakeServer();
		await scan(db, "goldenes-dachl");
		server.syncStatus = 401;
		const result = await syncOutbox(db, server.fetch);
		expect(result).toMatchObject({ status: "error", pending: 1 });
		expect(await db.outbox.count()).toBe(1);
	});

	it.each([
		["a server error", 500],
		["rate limiting", 429],
		["a bad request", 400],
	])("keeps all events on %s", async (_name, status) => {
		const db = testDb();
		const server = new FakeServer();
		await scan(db, "goldenes-dachl");
		server.syncStatus = status;
		const result = await syncOutbox(db, server.fetch);
		expect(result).toMatchObject({ status: "error", pending: 1 });
		expect(await db.outbox.count()).toBe(1);
		expect(await row(db, "goldenes-dachl")).toMatchObject({ confirmed: false });
	});

	it("keeps everything when the server answers with something unexpected", async () => {
		const db = testDb();
		const server = new FakeServer();
		await scan(db, "goldenes-dachl");
		server.garbageResponse = true;
		const result = await syncOutbox(db, server.fetch);
		expect(result.status).toBe("error");
		expect(await db.outbox.count()).toBe(1);
		expect(await row(db, "goldenes-dachl")).toMatchObject({ confirmed: false });
	});

	it("does not clobber an action taken while the request is in flight", async () => {
		const db = testDb();
		const server = new FakeServer();
		await scan(db, "goldenes-dachl");
		let injected = false;
		server.onSync = async () => {
			if (injected) return;
			injected = true;
			await scan(db, "annasaeule");
		};

		const result = await syncOutbox(db, server.fetch);

		expect(result).toMatchObject({ status: "synced", pending: 0 });
		expect(server.syncCalls.length).toBeGreaterThanOrEqual(2);
		expect(await row(db, "annasaeule")).toMatchObject({
			state: "visited",
			confirmed: true,
		});
		expect(await db.outbox.count()).toBe(0);
	});

	it("runs only one sync at a time; a concurrent call joins the running one", async () => {
		const db = testDb();
		const server = new FakeServer();
		await scan(db, "goldenes-dachl");
		const [a, b] = await Promise.all([
			syncOutbox(db, server.fetch),
			syncOutbox(db, server.fetch),
		]);
		expect(a.status).toBe("synced");
		expect(b.status).toBe("synced");
		expect(server.receivedIds).toHaveLength(1);
	});

	it("takes over the server's station states (e.g. a newly blocked station)", async () => {
		const db = testDb();
		const server = new FakeServer();
		await db.routeBundles.put({
			routeId: ROUTE,
			bundle: bundleFixture(),
			etag: null,
			fetchedAt: 1,
		});
		await scan(db, "goldenes-dachl");
		server.blocked.add("annasaeule");

		await syncOutbox(db, server.fetch);

		const stored = await db.routeBundles.get(ROUTE);
		expect(stored?.bundle.stationStates.annasaeule?.status).toBe("blocked");
	});

	it("treats the server's progress as authoritative", async () => {
		const db = testDb();
		const server = new FakeServer();
		await scan(db, "goldenes-dachl");
		await syncOutbox(db, server.fetch);
		// The server knows a station this device has not seen (e.g. restored data).
		await db.progress.clear();
		await syncOutbox(db, server.fetch);
		expect(await row(db, "goldenes-dachl")).toMatchObject({
			state: "visited",
			confirmed: true,
		});
	});
});

describe("backoffDelay", () => {
	it("doubles from 2 s up to a cap of 60 s", () => {
		expect([0, 1, 2, 3, 4, 5, 6, 10].map(backoffDelay)).toEqual([
			2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000,
		]);
	});
});
