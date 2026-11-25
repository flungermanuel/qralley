import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { reports, stationState } from "../src/db/schema";
import { setStationStatus } from "../src/domain/station-admin";
import { syncPlayer } from "../src/domain/sync";
import { signToken } from "../src/domain/token";
import {
	bearer,
	type Credentials,
	newCredentials,
	openTestDb,
	publishExample,
	resetDb,
} from "./helpers";

// Operator alarm (ADR 0007, SPEC AK-REP-08/09/11, AK-PRIV-01). The alarm is one log line
// `station_alert`; these tests read the captured log stream.

const { db, close } = openTestDb();
afterAll(close);

// Test-only signing keys, not real secrets.
const keys = new Map([[1, Buffer.alloc(32, 1)]]);
const ROUTE = "innsbruck-altstadt";
const G = "goldenes-dachl"; // fallback: text "3", radius 40
const A = "annasaeule";
const G_POSITION = { lat: 47.268534, lng: 11.393377, accuracyM: 12 };

let output = "";
let app: FastifyInstance;

async function startApp(alertThresholds?: {
	minReporters: number;
	minUnsafeReporters: number;
}) {
	output = "";
	const logStream = new Writable({
		write(chunk, _enc, cb) {
			output += chunk.toString();
			cb();
		},
	});
	app = buildApp({
		db,
		signingKeys: keys,
		logStream,
		logLevel: "info",
		rateLimit: { playersPerMinute: 10_000, globalPerMinute: 100_000 },
		...(alertThresholds ? { alertThresholds } : {}),
	});
	await app.ready();
}

beforeEach(async () => {
	await app?.close();
	await resetDb(db);
	await publishExample(db);
	await startApp();
});
afterAll(async () => {
	await app?.close();
});

const report = (stationId: string, kind: string, note?: string) => ({
	id: randomUUID(),
	type: "report",
	routeId: ROUTE,
	stationId,
	kind,
	...(note ? { note } : {}),
});
const fallback = (stationId: string) => ({
	id: randomUUID(),
	type: "fallback_checkin",
	routeId: ROUTE,
	stationId,
	position: G_POSITION,
	answer: "3",
});

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
	expect(res.statusCode).toBe(200);
	return res.json();
}

const logLines = () =>
	output
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l) as Record<string, unknown>);
const alerts = (stationId?: string) =>
	logLines().filter(
		(l) =>
			l.msg === "station_alert" && (!stationId || l.stationId === stationId),
	);

function leaves(value: unknown): unknown[] {
	if (value !== null && typeof value === "object")
		return Object.values(value).flatMap(leaves);
	return [value];
}

describe("operator alarm thresholds", () => {
	it("AK-REP-08: the third distinct reporter (any kind) writes exactly one station_alert", async () => {
		const [a, b, c] = [await player(), await player(), await player()];
		await sync(a, [report(G, "other")]);
		await sync(b, [report(G, "code_missing")]);
		expect(alerts()).toHaveLength(0);
		await sync(c, [report(G, "code_damaged")]);

		const lines = alerts();
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({ routeId: ROUTE, stationId: G });
	});

	it("AK-REP-08: two distinct unsafe reporters write exactly one station_alert", async () => {
		const [a, b] = [await player(), await player()];
		await sync(a, [report(G, "unsafe")]);
		expect(alerts()).toHaveLength(0);
		await sync(b, [report(G, "unsafe")]);
		expect(alerts(G)).toHaveLength(1);
	});

	it("AK-REP-08: one unsafe plus one other reporter is below both thresholds", async () => {
		await sync(await player(), [report(G, "unsafe")]);
		await sync(await player(), [report(G, "other")]);
		expect(alerts()).toHaveLength(0);
	});

	it("AK-REP-08: the same player with several kinds counts once", async () => {
		const a = await player();
		await sync(a, [
			report(G, "other"),
			report(G, "code_missing"),
			report(G, "unsafe"),
		]);
		await sync(await player(), [report(G, "other")]);
		expect(alerts()).toHaveLength(0);
	});

	it("AK-REP-08: a fallback check-in (automatic code_damaged report) can trigger the alarm", async () => {
		await sync(await player(), [report(G, "other")]);
		await sync(await player(), [report(G, "other")]);
		expect(alerts()).toHaveLength(0);
		const body = await sync(await player(), [fallback(G)]);
		expect(body.results[0].status).toBe("accepted");
		expect(alerts(G)).toHaveLength(1);
	});

	it("AK-REP-08: reports of deleted players count once each", async () => {
		const [a, b] = [await player(), await player()];
		await sync(a, [report(G, "other")]);
		await sync(b, [report(G, "other")]);
		for (const p of [a, b]) {
			const res = await app.inject({
				method: "DELETE",
				url: "/api/players/me",
				headers: bearer(p),
			});
			expect(res.statusCode).toBe(204);
		}
		const orphans = await db.select().from(reports);
		expect(orphans.map((r) => r.playerId)).toEqual([null, null]);
		expect(alerts()).toHaveLength(0);

		await sync(await player(), [report(G, "other")]);
		expect(alerts(G)).toHaveLength(1);
	});

	it("AK-REP-08: thresholds come from the app option (1/1 alarms on the first report)", async () => {
		await app.close();
		await startApp({ minReporters: 1, minUnsafeReporters: 1 });
		await sync(await player(), [report(G, "other")]);
		expect(alerts(G)).toHaveLength(1);
	});

	it("AK-REP-08: a raised threshold (5) delays the alarm to the fifth reporter", async () => {
		await app.close();
		await startApp({ minReporters: 5, minUnsafeReporters: 5 });
		for (let i = 0; i < 4; i++)
			await sync(await player(), [report(G, "other")]);
		expect(alerts()).toHaveLength(0);
		await sync(await player(), [report(G, "other")]);
		expect(alerts(G)).toHaveLength(1);
	});
});

describe("operator alarm fires exactly once", () => {
	it("AK-REP-08: three players syncing in parallel produce exactly one station_alert", async () => {
		const ps = [await player(), await player(), await player()];
		await Promise.all(ps.map((p) => sync(p, [report(G, "other")])));
		expect(alerts(G)).toHaveLength(1);
	});

	it("AK-REP-08: two unsafe reporters syncing in parallel produce exactly one station_alert", async () => {
		const ps = [await player(), await player()];
		await Promise.all(ps.map((p) => sync(p, [report(G, "unsafe")])));
		expect(alerts(G)).toHaveLength(1);
	});

	it("AK-REP-08: five parallel reporters still produce exactly one station_alert", async () => {
		const ps = await Promise.all(Array.from({ length: 5 }, () => player()));
		await Promise.all(ps.map((p) => sync(p, [report(G, "other")])));
		expect(alerts(G)).toHaveLength(1);
	});

	it("AK-REP-08: later reports on the same station write no further line", async () => {
		for (let i = 0; i < 3; i++)
			await sync(await player(), [report(G, "other")]);
		expect(alerts()).toHaveLength(1);
		await sync(await player(), [report(G, "unsafe")]);
		await sync(await player(), [report(G, "unsafe")]);
		expect(alerts()).toHaveLength(1);
	});

	it("AK-REP-08: a retried (duplicate) event does not write another line", async () => {
		const [a, b, c] = [await player(), await player(), await player()];
		const last = report(G, "other");
		await sync(a, [report(G, "other")]);
		await sync(b, [report(G, "other")]);
		await sync(c, [last]);
		const again = await sync(c, [last]);
		expect(again.results[0].status).toBe("duplicate");
		expect(alerts()).toHaveLength(1);
	});

	it("AK-REP-08: alarms are per station", async () => {
		for (let i = 0; i < 3; i++)
			await sync(await player(), [report(G, "other")]);
		for (let i = 0; i < 3; i++)
			await sync(await player(), [report(A, "other")]);
		expect(alerts(G)).toHaveLength(1);
		expect(alerts(A)).toHaveLength(1);
	});

	it("AK-REP-08: after the operator sets ok the alarm may fire again", async () => {
		for (let i = 0; i < 3; i++)
			await sync(await player(), [report(G, "other")]);
		expect(alerts()).toHaveLength(1);

		await setStationStatus(db, ROUTE, G, "ok");
		const open = await db
			.select()
			.from(reports)
			.where(and(eq(reports.stationId, G), eq(reports.status, "open")));
		expect(open).toHaveLength(0);

		// Two reports after the reset stay below the threshold ...
		await sync(await player(), [report(G, "other")]);
		await sync(await player(), [report(G, "other")]);
		expect(alerts()).toHaveLength(1);
		// ... the third crosses it again.
		await sync(await player(), [report(G, "other")]);
		expect(alerts()).toHaveLength(2);
	});
});

describe("blocked stations", () => {
	it("AK-REP-08: no alarm for a blocked station", async () => {
		await setStationStatus(db, ROUTE, G, "blocked", "closed for works");
		for (let i = 0; i < 4; i++)
			await sync(await player(), [report(G, "unsafe")]);
		expect(alerts()).toHaveLength(0);
		const [row] = await db
			.select()
			.from(stationState)
			.where(eq(stationState.stationId, G));
		expect(row?.status).toBe("blocked");
	});

	it("AK-REP-08: a fallback check-in on a blocked station neither succeeds nor alarms", async () => {
		await setStationStatus(db, ROUTE, G, "blocked", "closed for works");
		await sync(await player(), [report(G, "other")]);
		await sync(await player(), [report(G, "other")]);
		const body = await sync(await player(), [fallback(G)]);
		expect(body.results[0].status).toBe("rejected");
		expect(alerts()).toHaveLength(0);
	});
});

describe("alarm content and privacy", () => {
	it("AK-REP-09: the line carries route, station, counts and the oldest report time", async () => {
		const before = Date.now() - 5_000;
		await sync(await player(), [report(G, "other")]);
		await sync(await player(), [report(G, "other")]);
		await sync(await player(), [report(G, "unsafe")]);

		const [line] = alerts();
		if (!line) throw new Error("no station_alert line");
		const { level, time, pid, hostname, msg, routeId, stationId, ...rest } =
			line as Record<string, unknown>;
		expect([level, time, pid, hostname, msg]).toBeDefined();
		expect(routeId).toBe(ROUTE);
		expect(stationId).toBe(G);

		const values = leaves(rest);
		// Reporter counts: 3 distinct reporters in total, 1 of them with kind unsafe.
		expect(values).toContain(3);
		expect(values).toContain(1);
		// Time of the oldest open report (ISO string or epoch ms), not in the future.
		const stamps = values
			.map((v) =>
				typeof v === "string" ? Date.parse(v) : typeof v === "number" ? v : NaN,
			)
			.filter((t) => t > 1_000_000_000_000);
		expect(stamps.length).toBeGreaterThan(0);
		for (const t of stamps) {
			expect(t).toBeGreaterThan(before);
			expect(t).toBeLessThanOrEqual(Date.now());
		}
	});

	it("AK-REP-09: oldestOpenReportAt is exactly the oldest open report, and the key set is the whitelist", async () => {
		const past = new Date("2026-01-02T03:04:05.000Z");
		await sync(await player(), [report(G, "other")]);
		// Backdate the first report; the two later ones keep their real (newer) time.
		await db.update(reports).set({ createdAt: past });
		await sync(await player(), [report(G, "other")]);
		await sync(await player(), [report(G, "unsafe")]);

		const [line] = alerts();
		if (!line) throw new Error("no station_alert line");
		expect(line.oldestOpenReportAt).toBe(past.toISOString());

		const pino = ["level", "time", "pid", "hostname", "msg", "v"];
		const logged = Object.keys(line)
			.filter((k) => !pino.includes(k))
			.sort();
		expect(logged).toEqual(
			[
				"oldestOpenReportAt",
				"reportersAll",
				"reportersUnsafe",
				"routeId",
				"stationId",
			].sort(),
		);
		expect(line).toMatchObject({ reportersAll: 3, reportersUnsafe: 1 });
	});

	it("AK-REP-09: the alert line contains only whitelisted field types (no strings other than ids and time)", async () => {
		for (let i = 0; i < 3; i++)
			await sync(await player(), [report(G, "unsafe", "n")]);
		const [line] = alerts();
		const { level, time, pid, hostname, msg, routeId, stationId, ...rest } =
			line as Record<string, unknown>;
		expect([level, time, pid, hostname, msg, routeId, stationId]).toBeDefined();
		for (const v of leaves(rest)) {
			if (typeof v === "string")
				expect(Number.isNaN(Date.parse(v))).toBe(false);
			else expect(typeof v).toBe("number");
		}
	});

	it("AK-REP-09: the alert is not part of the /api/sync response", async () => {
		const [a, b, c] = [await player(), await player(), await player()];
		await sync(a, [report(G, "other")]);
		await sync(b, [report(G, "other")]);
		const body = await sync(c, [report(G, "other")]);
		expect(alerts()).toHaveLength(1);
		expect(Object.keys(body).sort()).toEqual(
			["progress", "results", "serverTime", "stationStates"].sort(),
		);
		expect(JSON.stringify(body).toLowerCase()).not.toContain("alert");
	});

	it("AK-REP-09 / AK-PRIV-01: the log has no player id, secret, note, token, coordinates or IP after an alarm", async () => {
		const note = "NOTE-TEXT-MUST-NOT-BE-LOGGED";
		const ps = [await player(), await player(), await player()] as const;
		await sync(ps[0], [report(G, "unsafe", note)]);
		await sync(ps[1], [report(G, "other", note)]);
		const token = signToken(keys, {
			routeId: ROUTE,
			stationId: G,
			keyVersion: 1,
		});
		const res = await app.inject({
			method: "POST",
			url: "/api/sync",
			headers: bearer(ps[2]),
			payload: {
				events: [
					fallback(G),
					{ id: randomUUID(), type: "scan", routeId: ROUTE, token },
				],
			},
			remoteAddress: "203.0.113.9",
		});
		expect(res.statusCode).toBe(200);
		expect(alerts()).toHaveLength(1);

		expect(output).not.toContain(note);
		expect(output).not.toContain(token);
		expect(output).not.toContain("203.0.113.9");
		expect(output).not.toContain("47.2685");
		expect(output).not.toContain("11.3933");
		for (const p of ps) {
			expect(output).not.toContain(p.playerId);
			expect(output).not.toContain(p.secret);
		}
	});
});

describe("alarm after commit (domain seam)", () => {
	it("AK-REP-08: syncPlayer hands the alert to onAlert only after the transaction committed", async () => {
		const ps = [await player(), await player(), await player()] as const;
		await sync(ps[0], [report(G, "other")]);
		await sync(ps[1], [report(G, "other")]);

		const received: unknown[] = [];
		let openAtCallback = -1;
		const thresholds = { minReporters: 3, minUnsafeReporters: 2 };
		const res = await syncPlayer(
			db,
			keys,
			ps[2].playerId,
			[report(G, "other")],
			{
				thresholds,
				onAlert: async (alert: unknown) => {
					received.push(alert);
					// A different connection must already see the third report.
					openAtCallback = (
						await db
							.select()
							.from(reports)
							.where(and(eq(reports.stationId, G), eq(reports.status, "open")))
					).length;
				},
			},
		);
		expect(res?.results[0]?.status).toBe("accepted");
		expect(received).toHaveLength(1);
		expect(openAtCallback).toBe(3);
		expect(received[0]).toMatchObject({ routeId: ROUTE, stationId: G });
		expect(JSON.stringify(received[0])).not.toContain(ps[2].playerId);
		// The domain result carries no alert.
		expect(JSON.stringify(res).toLowerCase()).not.toContain("alert");
	});

	it("AK-REP-08: rejected and duplicate events produce no alert callback", async () => {
		const a = await player();
		const calls: unknown[] = [];
		const options = {
			thresholds: { minReporters: 1, minUnsafeReporters: 1 },
			onAlert: (alert: unknown) => {
				calls.push(alert);
			},
		};
		const bad = { ...report(G, "other"), stationId: "no-such-station" };
		const res = await syncPlayer(db, keys, a.playerId, [bad], options);
		expect(res?.results[0]?.status).toBe("rejected");
		expect(calls).toHaveLength(0);

		const ok = report(G, "other");
		await syncPlayer(db, keys, a.playerId, [ok], options);
		await syncPlayer(db, keys, a.playerId, [ok], options);
		expect(calls).toHaveLength(1);
	});
});

describe("start-up validation", () => {
	const serverEntry = fileURLToPath(
		new URL("../src/server.ts", import.meta.url),
	);
	const apiDir = fileURLToPath(new URL("..", import.meta.url));

	it.each([
		["REPORT_ALERT_MIN_REPORTERS", "abc"],
		["REPORT_ALERT_MIN_REPORTERS", "0"],
		["REPORT_ALERT_MIN_UNSAFE_REPORTERS", "11"],
	])(
		"AK-REP-11: server.ts aborts with the variable name when %s=%s",
		(name, value) => {
			const run = spawnSync(
				process.execPath,
				["--import", "tsx", serverEntry],
				{
					cwd: apiDir,
					encoding: "utf8",
					timeout: 20_000,
					killSignal: "SIGKILL",
					env: {
						...process.env,
						[name]: value,
						// Test-only key and a port that is never bound when the abort works.
						QR_SIGNING_KEYS: JSON.stringify({
							"1": Buffer.alloc(32, 7).toString("base64url"),
						}),
						DATABASE_URL:
							"postgres://qurally:qurally_dev@localhost:5433/qurally_test",
						PORT: "0",
					},
				},
			);
			expect(run.status).not.toBe(0);
			expect(run.status).not.toBeNull(); // null = still running = did not abort
			expect(`${run.stderr}${run.stdout}`).toContain(name);
		},
		40_000,
	);
});
