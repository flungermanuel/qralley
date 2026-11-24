import {
	MAX_SYNC_BATCH,
	parseToken,
	type SyncEvent,
	type SyncResponse,
	syncResponseSchema,
} from "@qurally/shared";
import type { OutboxEntry, QurallyDb } from "./db";
import {
	DEFAULT_TIMEOUT_MS,
	fetchWithTimeout,
	type HttpOptions,
	raceTimeout,
	TimeoutError,
} from "./http";
import { isDeleting } from "./lifecycle";
import { getOrCreateProfile } from "./profile";

/** synced: server answered; nothing: no account and no events; offline: no connection; error: server problem. */
export type SyncStatus = "synced" | "nothing" | "offline" | "error";

export interface SyncReport {
	status: SyncStatus;
	/** Events still waiting in the outbox. */
	pending: number;
	/** Events the server rejected during this run. */
	rejected: number;
}

/** Retry delay after the `attempt`-th failure: 2 s, doubling, at most 60 s. */
export function backoffDelay(attempt: number): number {
	return Math.min(2000 * 2 ** attempt, 60_000);
}

const JSON_HEADERS = { "content-type": "application/json" };

class OfflineError extends Error {}
class ServerError extends Error {}

function stationOf(event: SyncEvent): string | null {
	if (event.type === "scan") {
		const parsed = parseToken(event.token);
		return parsed.ok ? parsed.payload.stationId : null;
	}
	return event.stationId;
}

/** Sends a request; a thrown fetch error or a missing answer (timeout) means we are offline. */
async function request(
	fetchFn: typeof fetch,
	url: string,
	init: RequestInit,
	timeoutMs: number,
): Promise<Response> {
	try {
		return await fetchWithTimeout(fetchFn, url, init, timeoutMs);
	} catch (err) {
		throw new OfflineError(
			err instanceof Error ? err.message : "network error",
		);
	}
}

async function register(
	db: QurallyDb,
	fetchFn: typeof fetch,
	timeoutMs: number,
): Promise<void> {
	const profile = await getOrCreateProfile(db);
	const res = await request(
		fetchFn,
		"/api/players",
		{
			method: "POST",
			headers: JSON_HEADERS,
			body: JSON.stringify({
				playerId: profile.playerId,
				secret: profile.secret,
			}),
		},
		timeoutMs,
	);
	if (!res.ok) throw new ServerError(`registration failed (${res.status})`);
	await db.profile.update("me", { registered: true });
}

async function markAttempt(
	db: QurallyDb,
	entries: OutboxEntry[],
	message: string,
): Promise<void> {
	await db.transaction("rw", db.outbox, async () => {
		for (const entry of entries) {
			if (entry.seq !== undefined) {
				await db.outbox.update(entry.seq, {
					attempts: entry.attempts + 1,
					lastError: message,
				});
			}
		}
	});
}

/**
 * Applies a server answer in one transaction: removes answered events, records
 * rejections, takes over station states and, once nothing is pending, replaces
 * local progress by the server's (the server is authoritative).
 */
async function applyResponse(
	db: QurallyDb,
	batch: OutboxEntry[],
	data: SyncResponse,
): Promise<number> {
	const byId = new Map(data.results.map((r) => [r.id, r]));
	let rejected = 0;

	await db.transaction(
		"rw",
		[db.outbox, db.progress, db.issues, db.routeBundles, db.badges],
		async () => {
			const answeredRoutes = new Set<string>();
			for (const entry of batch) {
				const result = byId.get(entry.id);
				if (!result) continue;
				if (entry.seq !== undefined) await db.outbox.delete(entry.seq);
				answeredRoutes.add(entry.event.routeId);
				if (result.status === "rejected") {
					rejected++;
					await db.issues.add({
						eventId: entry.id,
						stationId: stationOf(entry.event),
						type: entry.event.type,
						reason: result.reason ?? "unknown",
						createdAt: Date.now(),
					});
				}
			}

			for (const [routeId, states] of Object.entries(data.stationStates)) {
				const stored = await db.routeBundles.get(routeId);
				if (stored) {
					await db.routeBundles.update(routeId, {
						bundle: { ...stored.bundle, stationStates: states },
					});
				}
			}

			// Unsent events (or ones created meanwhile) still define local progress.
			if ((await db.outbox.count()) > 0) return;

			for (const routeId of new Set([
				...Object.keys(data.progress),
				...answeredRoutes,
			])) {
				const server = data.progress[routeId]?.stations ?? {};
				const local = await db.progress
					.filter((p) => p.routeId === routeId)
					.toArray();
				for (const row of local) {
					if (!(row.stationId in server))
						await db.progress.delete([routeId, row.stationId]);
				}
				for (const [stationId, s] of Object.entries(server)) {
					await db.progress.put({
						routeId,
						stationId,
						state: s.state,
						method: s.method,
						confirmed: true,
					});
				}
				// Badges are awarded by the server only.
				await db.badges.filter((b) => b.routeId === routeId).delete();
				for (const badgeId of data.progress[routeId]?.badges ?? []) {
					await db.badges.put({ routeId, badgeId });
				}
			}
		},
	);
	return rejected;
}

async function runOnce(
	db: QurallyDb,
	fetchFn: typeof fetch,
	timeoutMs: number,
): Promise<SyncReport> {
	const nothing: SyncReport = { status: "nothing", pending: 0, rejected: 0 };
	if (isDeleting(db)) return nothing;
	const profile = await getOrCreateProfile(db);
	if (!profile.registered && (await db.outbox.count()) === 0) return nothing;

	let rejected = 0;
	let batch: OutboxEntry[] = [];
	const report = async (status: SyncStatus): Promise<SyncReport> => ({
		status,
		pending: await db.outbox.count(),
		rejected,
	});

	try {
		if (!profile.registered) await register(db, fetchFn, timeoutMs);
		let reregistered = false;

		for (;;) {
			if (isDeleting(db)) return nothing;
			batch = await db.outbox.orderBy("seq").limit(MAX_SYNC_BATCH).toArray();
			const current = await getOrCreateProfile(db);
			const res = await request(
				fetchFn,
				"/api/sync",
				{
					method: "POST",
					headers: {
						...JSON_HEADERS,
						authorization: `Bearer ${current.playerId}.${current.secret}`,
					},
					body: JSON.stringify({ events: batch.map((e) => e.event) }),
				},
				timeoutMs,
			);
			// The player may have started deleting their data while the request was in flight.
			if (isDeleting(db)) return nothing;

			if (res.status === 401) {
				// The server does not know us (e.g. its database was reset): register again, once.
				if (reregistered) throw new ServerError("unauthorized");
				reregistered = true;
				await db.profile.update("me", { registered: false });
				await register(db, fetchFn, timeoutMs);
				continue;
			}
			if (!res.ok) throw new ServerError(`sync failed (${res.status})`);

			const body = await raceTimeout(
				res.json().catch(() => null),
				timeoutMs,
			).catch((err: unknown) => {
				if (err instanceof TimeoutError) throw new OfflineError(err.message);
				return null;
			});
			const parsed = syncResponseSchema.safeParse(body);
			if (!parsed.success) throw new ServerError("unexpected sync response");
			if (isDeleting(db)) return nothing;

			const before = await db.outbox.count();
			rejected += await applyResponse(db, batch, parsed.data);
			const after = await db.outbox.count();
			if (after === 0) break;
			// Entries we sent were not answered: stop instead of looping forever.
			if (batch.length > 0 && after >= before)
				throw new ServerError("events were not answered");
		}
		return await report("synced");
	} catch (err) {
		const message = err instanceof Error ? err.message : "sync failed";
		await markAttempt(db, batch, message);
		return await report(err instanceof OfflineError ? "offline" : "error");
	}
}

const running = new WeakMap<
	QurallyDb,
	{ promise: Promise<SyncReport>; rerun: boolean }
>();

/**
 * Sends pending events and reconciles with the server. Only one sync runs at a
 * time; a call while one is running joins it and triggers one more pass afterwards.
 */
export function syncOutbox(
	db: QurallyDb,
	fetchFn: typeof fetch = (...args) => fetch(...args),
	options: HttpOptions = {},
): Promise<SyncReport> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	if (isDeleting(db))
		return Promise.resolve({ status: "nothing", pending: 0, rejected: 0 });
	const current = running.get(db);
	if (current) {
		current.rerun = true;
		return current.promise;
	}

	const state = {
		rerun: false,
		promise: Promise.resolve<SyncReport>({
			status: "nothing",
			pending: 0,
			rejected: 0,
		}),
	};
	state.promise = (async () => {
		try {
			let result = await runOnce(db, fetchFn, timeoutMs);
			// A call that joined us means something changed (e.g. back online): try once more.
			while (state.rerun) {
				state.rerun = false;
				result = await runOnce(db, fetchFn, timeoutMs);
			}
			return result;
		} finally {
			running.delete(db);
		}
	})();
	running.set(db, state);
	return state.promise;
}

/** Resolves when no sync is running (immediately if none is). Never rejects. */
export async function waitForSync(db: QurallyDb): Promise<void> {
	await running.get(db)?.promise.catch(() => undefined);
}
