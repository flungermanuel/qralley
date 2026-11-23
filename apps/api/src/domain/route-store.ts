import type { Route } from "@qurally/shared";
import { asc, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { routeVersions, stationState } from "../db/schema";

/** Anything with the query methods we use: the Db itself or a transaction. */
export type Executor = Pick<
	Db,
	"select" | "insert" | "update" | "delete" | "execute"
>;

export interface LatestRoute {
	route: Route;
	contentHash: string;
}

/** Latest published version of a route. Content was validated when it was published. */
export async function getLatestRoute(
	db: Executor,
	routeId: string,
): Promise<LatestRoute | null> {
	const [row] = await db
		.select()
		.from(routeVersions)
		.where(eq(routeVersions.routeId, routeId))
		.orderBy(desc(routeVersions.version))
		.limit(1);
	return row
		? { route: row.content as Route, contentHash: row.contentHash }
		: null;
}

export type StationStates = Record<
	string,
	{ status: string; reason: string | null }
>;

/** Station states of the route's current stations, keyed by station id. */
export async function getStationStates(
	db: Executor,
	route: Route,
): Promise<StationStates> {
	const stationIds = new Set(route.stations.map((s) => s.id));
	const rows = await db
		.select()
		.from(stationState)
		.where(eq(stationState.routeId, route.id))
		.orderBy(asc(stationState.stationId));
	return Object.fromEntries(
		rows
			.filter((r) => stationIds.has(r.stationId))
			.map((r) => [r.stationId, { status: r.status, reason: r.statusReason }]),
	);
}
