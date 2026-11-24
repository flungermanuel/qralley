import type { RouteBundle, SyncEvent } from "@qurally/shared";
import Dexie, { type Table } from "dexie";

/** Anonymous local profile; the only identity the app has (docs/SPEC.md §8.1). */
export interface Profile {
	id: "me";
	playerId: string;
	/** Device secret. Only its hash ever reaches the server. */
	secret: string;
	registered: boolean;
	/** Set while a deletion request may have reached the server but was not confirmed. Syncing is paused. */
	deletionRequested?: boolean;
	safetyAcknowledgedAt: number | null;
	createdAt: number;
}

export interface StoredBundle {
	routeId: string;
	bundle: RouteBundle;
	etag: string | null;
	fetchedAt: number;
}

/** Local, possibly unconfirmed progress per station. */
export interface LocalProgress {
	routeId: string;
	stationId: string;
	state: "visited" | "completed";
	method: "scan" | "fallback";
	/** True once the server has confirmed the corresponding events. */
	confirmed: boolean;
}

/** A badge the server has awarded (confirmed). */
export interface LocalBadge {
	routeId: string;
	badgeId: string;
}

/** An event waiting to be sent. `seq` gives the creation order. */
export interface OutboxEntry {
	seq?: number;
	/** Client event id (idempotency key), identical to `event.id`. */
	id: string;
	event: SyncEvent;
	createdAt: number;
	attempts: number;
	lastError?: string;
}

/** A rejected event the player should be told about. */
export interface SyncIssue {
	id?: number;
	eventId: string;
	stationId: string | null;
	type: string;
	reason: string;
	createdAt: number;
}

export class QurallyDb extends Dexie {
	profile!: Table<Profile, string>;
	routeBundles!: Table<StoredBundle, string>;
	progress!: Table<LocalProgress, [string, string]>;
	outbox!: Table<OutboxEntry, number>;
	issues!: Table<SyncIssue, number>;
	badges!: Table<LocalBadge, [string, string]>;

	constructor(name = "qurally") {
		super(name);
		this.version(1).stores({
			profile: "id",
			routeBundles: "routeId",
			progress: "[routeId+stationId]",
		});
		this.version(2).stores({
			profile: "id",
			routeBundles: "routeId",
			progress: "[routeId+stationId]",
			outbox: "++seq, &id",
			issues: "++id",
		});
		this.version(3).stores({
			profile: "id",
			routeBundles: "routeId",
			progress: "[routeId+stationId]",
			outbox: "++seq, &id",
			issues: "++id",
			badges: "[routeId+badgeId]",
		});
	}
}
