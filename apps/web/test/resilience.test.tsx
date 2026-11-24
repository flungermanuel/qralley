import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import { cancelDeletion, deleteAllData } from "../src/data/account";
import { beginDeletion, endDeletion, isDeleting } from "../src/data/lifecycle";
import { getOrCreateProfile } from "../src/data/profile";
import { answerQuest } from "../src/data/quest";
import { loadRoute } from "../src/data/route";
import { processScan } from "../src/data/scan";
import { syncOutbox } from "../src/data/sync";
import { texts } from "../src/texts";
import { FakeServer } from "./fake-server";
import {
	bundleFixture,
	FakeScanner,
	jsonResponse,
	qrUrl,
	testDb,
	tokenFor,
} from "./helpers";

type Db = ReturnType<typeof testDb>;
const ROUTE = "innsbruck-altstadt";
const SHORT = { timeoutMs: 60 };
const neverResolves: typeof fetch = () => new Promise<Response>(() => {});

/** Aborts like a real fetch when the signal fires. */
const abortAware: typeof fetch = (_input, init) =>
	new Promise<Response>((_resolve, reject) => {
		init?.signal?.addEventListener("abort", () =>
			reject(new DOMException("aborted", "AbortError")),
		);
	});

const scan = (db: Db, id: string) =>
	processScan(db, bundleFixture(), qrUrl(tokenFor(id)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("requests time out (review finding 3)", () => {
	it("loadRoute falls back to the cache when the network hangs", async () => {
		const db = testDb();
		await loadRoute(db, ROUTE, async () =>
			jsonResponse(bundleFixture(), { etag: '"1"' }),
		);
		const started = Date.now();
		const result = await loadRoute(db, ROUTE, neverResolves, SHORT);
		expect(result.status).toBe("cached");
		expect(Date.now() - started).toBeLessThan(2000);
	});

	it("loadRoute reports unavailable when nothing is cached and the network hangs", async () => {
		expect(await loadRoute(testDb(), ROUTE, abortAware, SHORT)).toEqual({
			status: "unavailable",
			bundle: null,
		});
	});

	it("a hanging sync ends as offline, keeps every event and does not block the next sync", async () => {
		const db = testDb();
		const server = new FakeServer();
		await scan(db, "goldenes-dachl");

		server.hangSync = true;
		const first = await syncOutbox(db, server.fetch, SHORT);
		expect(first).toMatchObject({ status: "offline", pending: 1 });
		expect((await db.outbox.toArray())[0]?.attempts).toBe(1);
		expect(await db.progress.get([ROUTE, "goldenes-dachl"])).toMatchObject({
			confirmed: false,
		});

		server.hangSync = false;
		const second = await syncOutbox(db, server.fetch, SHORT);
		expect(second).toMatchObject({ status: "synced", pending: 0 });
		expect(await db.progress.get([ROUTE, "goldenes-dachl"])).toMatchObject({
			confirmed: true,
		});
	});

	it("a hanging registration is also an offline result", async () => {
		const db = testDb();
		await scan(db, "goldenes-dachl");
		expect((await syncOutbox(db, neverResolves, SHORT)).status).toBe("offline");
		expect(await db.outbox.count()).toBe(1);
	});

	it("a response body that never arrives times out as well", async () => {
		const db = testDb();
		await scan(db, "goldenes-dachl");
		const stuckBody: typeof fetch = async () =>
			({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: () => new Promise(() => {}),
			}) as unknown as Response;
		const result = await syncOutbox(db, stuckBody, SHORT);
		expect(result.status).toBe("offline");
		expect(await db.outbox.count()).toBe(1);
	});

	it("deleteAllData does not hang forever and keeps the data", async () => {
		const db = testDb();
		const server = new FakeServer();
		await scan(db, "goldenes-dachl");
		await syncOutbox(db, server.fetch);
		const hangDelete: typeof fetch = (input, init) =>
			String(input) === "/api/players/me"
				? neverResolves(input, init)
				: server.fetch(input, init);

		expect(await deleteAllData(db, hangDelete, SHORT)).toEqual({
			status: "offline",
		});
		expect(await db.profile.count()).toBe(1);
		expect(await db.progress.count()).toBe(1);
	});
});

describe("cached route is shown at once (review finding 3)", () => {
	it("AK-LOAD-02: stations appear immediately although the route request never answers", async () => {
		const db = testDb();
		await getOrCreateProfile(db);
		await db.profile.update("me", { safetyAcknowledgedAt: 1 });
		await db.routeBundles.put({
			routeId: ROUTE,
			bundle: bundleFixture(),
			etag: '"1"',
			fetchedAt: 1,
		});

		render(
			<App
				db={db}
				fetchFn={neverResolves}
				updateAvailable={false}
				onUpdate={() => {}}
				createScanner={() => new FakeScanner()}
				initialScanText={null}
			/>,
		);

		expect(
			await screen.findByRole("button", { name: /Goldenes Dachl/ }),
		).toBeTruthy();
		expect(screen.queryByText(texts.loading)).toBeNull();
	});
});

describe("delete my data vs. running sync (review finding 4)", () => {
	async function registeredWithPending(server: FakeServer) {
		const db = testDb();
		await scan(db, "goldenes-dachl");
		await syncOutbox(db, server.fetch);
		await scan(db, "annasaeule");
		await answerQuest(db, bundleFixture(), "annasaeule", "1706");
		return db;
	}

	it("AK-PROF-03: waits for a running sync, then deletes; the player is not re-created", async () => {
		const server = new FakeServer();
		const db = await registeredWithPending(server);
		server.calls.length = 0;

		let release: () => void = () => {};
		server.onSync = () =>
			new Promise<void>((resolve) => {
				release = resolve;
			});
		const syncing = syncOutbox(db, server.fetch);
		await waitFor(() => expect(server.syncCalls).toHaveLength(1));

		const deleting = deleteAllData(db, server.fetch);
		await sleep(40);
		expect(server.calls.some((c) => c.method === "DELETE")).toBe(false);

		server.onSync = null;
		release();
		await syncing;
		expect(await deleting).toEqual({ status: "deleted" });

		const order = server.calls.map((c) => `${c.method} ${c.url}`);
		expect(order).toEqual(["POST /api/sync", "DELETE /api/players/me"]);
		for (const table of [
			db.profile,
			db.progress,
			db.outbox,
			db.issues,
			db.badges,
			db.routeBundles,
		]) {
			expect(await table.count()).toBe(0);
		}
	});

	it("a sync that is triggered during the deletion does nothing", async () => {
		const server = new FakeServer();
		const db = await registeredWithPending(server);
		server.calls.length = 0;

		let release: () => void = () => {};
		let parked = false;
		const slowDelete: typeof fetch = async (input, init) => {
			if (String(input) === "/api/players/me") {
				await new Promise<void>((resolve) => {
					release = resolve;
					parked = true;
				});
			}
			return server.fetch(input, init);
		};
		const deleting = deleteAllData(db, slowDelete);
		await waitFor(() => expect(parked).toBe(true)); // the DELETE request is on its way

		const during = await syncOutbox(db, server.fetch);
		expect(during).toMatchObject({ status: "nothing" });
		expect(server.calls).toHaveLength(0);

		release();
		expect(await deleting).toEqual({ status: "deleted" });
		expect(await db.progress.count()).toBe(0);
		expect(server.playerCalls).toHaveLength(0);
	});

	it("a deletion that was not confirmed keeps syncing paused: the request may have reached the server", async () => {
		const server = new FakeServer();
		const db = await registeredWithPending(server);
		server.deleteFails = true; // the answer is lost; the server may have deleted the player
		expect((await deleteAllData(db, server.fetch)).status).toBe("offline");
		expect((await db.profile.get("me"))?.deletionRequested).toBe(true);

		server.calls.length = 0;
		server.deleteFails = false;
		const paused = await syncOutbox(db, server.fetch);
		expect(paused).toMatchObject({ status: "nothing", pending: 2 }); // the real number of waiting events
		expect(server.calls).toHaveLength(0); // no sync, and above all no re-registration
	});

	it("retrying a pending deletion finishes it, also when the player is already gone (401)", async () => {
		const server = new FakeServer();
		const db = await registeredWithPending(server);
		server.deleteFails = true;
		await deleteAllData(db, server.fetch);

		server.deleteFails = false;
		server.deleteStatus = 401;
		expect(await deleteAllData(db, server.fetch)).toEqual({
			status: "deleted",
		});
		expect(await db.profile.count()).toBe(0);
		expect(await db.progress.count()).toBe(0);
	});

	it("the player can cancel a pending deletion and syncing resumes", async () => {
		const server = new FakeServer();
		const db = await registeredWithPending(server);
		server.deleteFails = true;
		await deleteAllData(db, server.fetch);

		await cancelDeletion(db);

		expect((await db.profile.get("me"))?.deletionRequested).toBe(false);
		server.deleteFails = false;
		expect((await syncOutbox(db, server.fetch)).status).toBe("synced");
	});

	it("overlapping deletions keep the flag until the last one has finished", () => {
		const db = testDb();
		beginDeletion(db);
		beginDeletion(db);
		endDeletion(db);
		expect(isDeleting(db)).toBe(true);
		endDeletion(db);
		expect(isDeleting(db)).toBe(false);
	});
});
