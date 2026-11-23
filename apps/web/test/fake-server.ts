import {
	parseToken,
	type RouteBundle,
	type SyncEvent,
	totalXp,
} from "@qurally/shared";
import { bundleFixture, jsonResponse } from "./helpers";

type Station = { state: "visited" | "completed"; method: "scan" | "fallback" };
type Verdict = {
	status: "accepted" | "duplicate" | "rejected";
	reason?: string;
};

export interface RecordedCall {
	url: string;
	method: string;
	body: unknown;
	authorization: string | null;
}

/** A scripted stand-in for the qurally API, usable as `fetchFn`. */
export class FakeServer {
	calls: RecordedCall[] = [];
	bundle: RouteBundle;
	/** HTTP status of POST /api/players. */
	playersStatus = 201;
	/** HTTP status of POST /api/sync (200 = process events). */
	syncStatus = 200;
	/** Sync requests never get an answer. */
	hangSync = false;
	/** Number of upcoming sync requests that fail before reaching the server. */
	failNext = 0;
	/** Number of upcoming sync requests that are processed but whose response is lost. */
	dropResponseNext = 0;
	/** Replaces the response body of the next successful sync. */
	garbageResponse = false;
	/** Rejects events of a type with the given reason. */
	rejectType = new Map<string, string>();
	blocked = new Set<string>();
	/** Runs while a sync request is being handled. */
	onSync: (() => Promise<void>) | null = null;

	private seen = new Map<string, Verdict>();
	private stations = new Map<string, Station>();

	constructor(bundle: RouteBundle = bundleFixture()) {
		this.bundle = bundle;
	}

	get syncCalls() {
		return this.calls.filter((c) => c.url === "/api/sync");
	}

	get playerCalls() {
		return this.calls.filter((c) => c.url === "/api/players");
	}

	/** Event ids in the order the server received them. */
	get receivedIds(): string[] {
		return this.syncCalls.flatMap((c) =>
			((c.body as { events: { id: string }[] }).events ?? []).map((e) => e.id),
		);
	}

	serverStation(stationId: string): Station | undefined {
		return this.stations.get(stationId);
	}

	fetch: typeof fetch = async (input, init) => {
		const url = String(input);
		const method = init?.method ?? "GET";
		const headers = new Headers(init?.headers);
		const body =
			typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
		this.calls.push({
			url,
			method,
			body,
			authorization: headers.get("authorization"),
		});

		if (url.startsWith("/api/routes/"))
			return jsonResponse(this.bundle, { etag: '"1"' });
		if (url === "/api/players")
			return jsonResponse({ created: true }, { status: this.playersStatus });
		if (url !== "/api/sync") return new Response("not found", { status: 404 });

		if (this.hangSync) return new Promise<Response>(() => {});
		if (this.failNext > 0) {
			this.failNext--;
			throw new TypeError("Failed to fetch");
		}
		if (this.syncStatus !== 200)
			return jsonResponse({ error: "x" }, { status: this.syncStatus });

		await this.onSync?.();
		const events = (body as { events: SyncEvent[] }).events;
		const results = events.map((e) => ({ id: e.id, ...this.process(e) }));

		if (this.dropResponseNext > 0) {
			this.dropResponseNext--;
			throw new TypeError("Failed to fetch");
		}
		if (this.garbageResponse) return jsonResponse({ nope: true });

		const routeId = this.bundle.route.id;
		const stations = Object.fromEntries(this.stations);
		return jsonResponse({
			results,
			progress: {
				[routeId]: {
					totalXp: totalXp(
						this.bundle.route.xpRules,
						[...this.stations].map(([stationId, s]) => ({ stationId, ...s })),
					),
					stations,
					badges: [],
					complete: false,
				},
			},
			stationStates: {
				[routeId]: Object.fromEntries(
					this.bundle.route.stations.map((s) => [
						s.id,
						{ status: this.blocked.has(s.id) ? "blocked" : "ok", reason: null },
					]),
				),
			},
			serverTime: 1,
		});
	};

	private process(event: SyncEvent): Verdict {
		const previous = this.seen.get(event.id);
		if (previous) {
			return previous.status === "accepted"
				? { status: "duplicate", reason: "already_processed" }
				: previous;
		}
		const verdict = this.decide(event);
		this.seen.set(event.id, verdict);
		return verdict;
	}

	private decide(event: SyncEvent): Verdict {
		const forced = this.rejectType.get(event.type);
		if (forced) return { status: "rejected", reason: forced };

		if (event.type === "scan") {
			const parsed = parseToken(event.token);
			if (!parsed.ok) return { status: "rejected", reason: "invalid_token" };
			const id = parsed.payload.stationId;
			if (this.stations.has(id))
				return { status: "duplicate", reason: "already_visited" };
			this.stations.set(id, { state: "visited", method: "scan" });
			return { status: "accepted" };
		}
		if (event.type === "quest_answer") {
			const current = this.stations.get(event.stationId);
			if (!current) return { status: "rejected", reason: "not_visited" };
			this.stations.set(event.stationId, { ...current, state: "completed" });
			return { status: "accepted" };
		}
		return { status: "accepted" };
	}
}
