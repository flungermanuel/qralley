import type { RouteBundle } from "@qurally/shared";
import Dexie, { type Table } from "dexie";

/** Anonymous local profile; the only identity the app has (docs/SPEC.md §8.1). */
export interface Profile {
	id: "me";
	playerId: string;
	/** Device secret. Only its hash ever reaches the server. */
	secret: string;
	registered: boolean;
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

export class QurallyDb extends Dexie {
	profile!: Table<Profile, string>;
	routeBundles!: Table<StoredBundle, string>;
	progress!: Table<LocalProgress, [string, string]>;

	constructor(name = "qurally") {
		super(name);
		this.version(1).stores({
			profile: "id",
			routeBundles: "routeId",
			progress: "[routeId+stationId]",
		});
	}
}
