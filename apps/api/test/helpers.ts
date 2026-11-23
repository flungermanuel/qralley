import { randomBytes, randomUUID } from "node:crypto";
import { validateRoute } from "@qurally/shared";
import { sql } from "drizzle-orm";
import { exampleRoute } from "../../../packages/shared/test/fixtures";
import { createDb, type Db } from "../src/db/client";
import { publishRoute } from "../src/domain/publish";

export const TEST_DB_URL =
	process.env.TEST_DATABASE_URL ??
	"postgres://qurally:qurally_dev@localhost:5433/qurally_test";

export function openTestDb() {
	return createDb(TEST_DB_URL);
}

export async function resetDb(db: Db): Promise<void> {
	await db.execute(
		sql`truncate table reports, sync_events, badges_awarded, progress, players, station_state, route_versions restart identity cascade`,
	);
}

export interface Credentials {
	playerId: string;
	secret: string;
}

export function newCredentials(): Credentials {
	return {
		playerId: randomUUID(),
		secret: randomBytes(32).toString("base64url"),
	};
}

export const bearer = (c: Credentials) => ({
	authorization: `Bearer ${c.playerId}.${c.secret}`,
});

export function validExampleRoute() {
	const result = validateRoute(exampleRoute());
	if (!result.ok) throw new Error("example route invalid");
	return result.route;
}

export async function publishExample(db: Db) {
	return publishRoute(db, validExampleRoute());
}
