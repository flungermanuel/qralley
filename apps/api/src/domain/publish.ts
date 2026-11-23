import { createHash } from "node:crypto";
import type { Route } from "@qurally/shared";
import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { routeVersions, stationState } from "../db/schema";

/** JSON with recursively sorted object keys, so equal content always hashes equally. */
function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (value !== null && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
	}
	return JSON.stringify(value);
}

export function canonicalHash(route: Route): string {
	return createHash("sha256").update(canonicalJson(route)).digest("hex");
}

export type PublishResult = {
	status: "published" | "unchanged";
	version: number;
};

/**
 * Stores a validated route as a new version. Identical content is a no-op;
 * changed content must carry a higher `version`. Station states of existing
 * stations are kept, new stations start as "ok".
 */
export async function publishRoute(
	db: Db,
	route: Route,
): Promise<PublishResult> {
	const hash = canonicalHash(route);
	return db.transaction(async (tx) => {
		const [latest] = await tx
			.select({
				version: routeVersions.version,
				contentHash: routeVersions.contentHash,
			})
			.from(routeVersions)
			.where(eq(routeVersions.routeId, route.id))
			.orderBy(desc(routeVersions.version))
			.limit(1);

		if (latest?.contentHash === hash)
			return { status: "unchanged", version: latest.version };
		if (latest && route.version <= latest.version) {
			throw new Error(
				`Route "${route.id}" changed, but its version ${route.version} is not higher than the published version ${latest.version}. Increase "version".`,
			);
		}

		await tx.insert(routeVersions).values({
			routeId: route.id,
			version: route.version,
			content: route,
			contentHash: hash,
		});
		await tx
			.insert(stationState)
			.values(
				route.stations.map((s) => ({ routeId: route.id, stationId: s.id })),
			)
			.onConflictDoNothing();
		return { status: "published", version: route.version };
	});
}
