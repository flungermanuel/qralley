import { describe, expect, it } from "vitest";
import { deleteAllData } from "../src/data/account";
import { badgeStatus } from "../src/data/badge";
import { getOrCreateProfile } from "../src/data/profile";
import { processScan } from "../src/data/scan";
import { syncOutbox } from "../src/data/sync";
import { FakeServer } from "./fake-server";
import { bundleFixture, qrUrl, testDb, tokenFor } from "./helpers";

const ROUTE = "innsbruck-altstadt";
const BADGE = "altstadt-entdecker";
const row = (
	stationId: string,
	confirmed: boolean,
	state: "visited" | "completed" = "completed",
) => ({
	routeId: ROUTE,
	stationId,
	state,
	method: "scan" as const,
	confirmed,
});

describe("badgeStatus", () => {
	const all = ["goldenes-dachl", "annasaeule", "hofkirche"];

	it("is none while stations are missing or only visited", () => {
		expect(
			badgeStatus(bundleFixture(), [row(all[0] ?? "", true)], []).state,
		).toBe("none");
		const visited = all.map((id) => row(id, true, "visited"));
		expect(badgeStatus(bundleFixture(), visited, []).state).toBe("none");
	});

	it("AK-BADGE-04: is provisional when everything is done locally but not yet confirmed", () => {
		const rows = all.map((id) => row(id, false));
		const status = badgeStatus(bundleFixture(), rows, []);
		expect(status.state).toBe("provisional");
		expect(status.state !== "none" && status.badge.id).toBe(BADGE);
	});

	it("AK-BADGE-04: is confirmed once the server awarded it", () => {
		const rows = all.map((id) => row(id, true));
		expect(badgeStatus(bundleFixture(), rows, [BADGE]).state).toBe("confirmed");
	});

	it("AK-BADGE-02: blocked stations do not count", () => {
		const bundle = bundleFixture();
		bundle.stationStates.hofkirche = { status: "blocked", reason: null };
		const rows = ["goldenes-dachl", "annasaeule"].map((id) => row(id, false));
		expect(badgeStatus(bundle, rows, []).state).toBe("provisional");
	});

	it("is none when every station is blocked", () => {
		const bundle = bundleFixture();
		for (const id of all)
			bundle.stationStates[id] = { status: "blocked", reason: null };
		expect(badgeStatus(bundle, [], []).state).toBe("none");
	});

	it("ignores progress of other routes", () => {
		const rows = all.map((id) => ({ ...row(id, true), routeId: "andere" }));
		expect(badgeStatus(bundleFixture(), rows, []).state).toBe("none");
	});

	it("a confirmed badge stays confirmed even if a station is blocked later", () => {
		const bundle = bundleFixture();
		bundle.stationStates.hofkirche = { status: "blocked", reason: null };
		expect(
			badgeStatus(bundle, [row("goldenes-dachl", true)], [BADGE]).state,
		).toBe("confirmed");
	});
});

describe("sync stores badges", () => {
	it("takes over the server's badges and drops local ones the server does not know", async () => {
		const db = testDb();
		const server = new FakeServer();
		await db.badges.put({ routeId: ROUTE, badgeId: "alt" });
		await processScan(db, bundleFixture(), qrUrl(tokenFor("goldenes-dachl")));

		await syncOutbox(db, server.fetch);
		expect(await db.badges.count()).toBe(0);
	});

	it("AK-BADGE-04: awards the badge locally after the server confirmed completion", async () => {
		const db = testDb();
		const server = new FakeServer();
		const { answerQuest } = await import("../src/data/quest");
		const bundle = bundleFixture();
		for (const [id, answer] of [
			["goldenes-dachl", "a"],
			["annasaeule", "1706"],
			["hofkirche", "Universitätsstraße"],
		] as const) {
			await processScan(db, bundle, qrUrl(tokenFor(id)));
			await answerQuest(db, bundle, id, answer);
		}
		await syncOutbox(db, server.fetch);
		expect((await db.badges.toArray()).map((b) => b.badgeId)).toEqual([BADGE]);
	});
});

describe("deleteAllData", () => {
	async function registered(server: FakeServer) {
		const db = testDb();
		await processScan(db, bundleFixture(), qrUrl(tokenFor("goldenes-dachl")));
		await db.routeBundles.put({
			routeId: ROUTE,
			bundle: bundleFixture(),
			etag: null,
			fetchedAt: 1,
		});
		await syncOutbox(db, server.fetch);
		await db.outbox.add({
			id: crypto.randomUUID(),
			event: {
				id: "x",
				type: "report",
				routeId: ROUTE,
				stationId: "annasaeule",
				kind: "other",
			},
			createdAt: 1,
			attempts: 0,
		});
		return db;
	}

	it("AK-PROF-03: deletes the server account and wipes every local table", async () => {
		const server = new FakeServer();
		const db = await registered(server);
		const before = await getOrCreateProfile(db);
		server.calls.length = 0;

		expect(await deleteAllData(db, server.fetch)).toEqual({
			status: "deleted",
		});

		const del = server.calls.find((c) => c.method === "DELETE");
		expect(del?.url).toBe("/api/players/me");
		expect(del?.authorization).toBe(
			`Bearer ${before.playerId}.${before.secret}`,
		);
		for (const table of [
			db.profile,
			db.routeBundles,
			db.progress,
			db.outbox,
			db.issues,
			db.badges,
		]) {
			expect(await table.count()).toBe(0);
		}
	});

	it("a fresh identity is created afterwards", async () => {
		const server = new FakeServer();
		const db = await registered(server);
		const before = await getOrCreateProfile(db);
		await deleteAllData(db, server.fetch);
		const after = await getOrCreateProfile(db);
		expect(after.playerId).not.toBe(before.playerId);
		expect(after.safetyAcknowledgedAt).toBeNull();
	});

	it("treats 401 (server no longer knows us) as already deleted", async () => {
		const server = new FakeServer();
		const db = await registered(server);
		server.deleteStatus = 401;
		expect(await deleteAllData(db, server.fetch)).toEqual({
			status: "deleted",
		});
		expect(await db.progress.count()).toBe(0);
	});

	it("keeps all local data when offline, so the deletion can be repeated", async () => {
		const server = new FakeServer();
		const db = await registered(server);
		server.deleteFails = true;
		expect(await deleteAllData(db, server.fetch)).toEqual({
			status: "offline",
		});
		expect(await db.profile.count()).toBe(1);
		expect(await db.progress.count()).toBe(1);
		expect(await db.outbox.count()).toBe(1);
	});

	it("keeps all local data on a server error", async () => {
		const server = new FakeServer();
		const db = await registered(server);
		server.deleteStatus = 500;
		expect(await deleteAllData(db, server.fetch)).toEqual({ status: "error" });
		expect(await db.progress.count()).toBe(1);
	});

	it("needs no network when nothing was ever sent to the server", async () => {
		const server = new FakeServer();
		const db = testDb();
		await getOrCreateProfile(db);
		await processScan(db, bundleFixture(), qrUrl(tokenFor("goldenes-dachl")));

		expect(await deleteAllData(db, server.fetch)).toEqual({
			status: "deleted",
		});
		expect(server.calls).toHaveLength(0);
		expect(await db.progress.count()).toBe(0);
		expect(await db.outbox.count()).toBe(0);
	});
});
