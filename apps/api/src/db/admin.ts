import { sql } from "drizzle-orm";
import pg from "pg";
import type { Db } from "./client";

/** Development and test helpers; never used by the production server. */

/** Creates the database named in the URL if it does not exist yet. */
export async function ensureDatabase(connectionString: string): Promise<void> {
	const url = new URL(connectionString);
	const dbName = url.pathname.slice(1);
	if (!/^[a-z0-9_]+$/.test(dbName))
		throw new Error(`Unsafe database name: ${dbName}`);

	const admin = new pg.Client({
		connectionString: new URL("/postgres", url).toString(),
	});
	try {
		await admin.connect();
	} catch (err) {
		throw new Error(
			`Cannot reach PostgreSQL (${(err as Error).message}).\n` +
				"Start it with: docker compose -f infra/docker-compose.yml up -d --wait db",
		);
	}
	try {
		const exists = await admin.query(
			"select 1 from pg_database where datname = $1",
			[dbName],
		);
		if (exists.rowCount === 0) await admin.query(`create database ${dbName}`);
	} finally {
		await admin.end();
	}
}

/** Empties all tables. */
export async function resetDatabase(db: Db): Promise<void> {
	await db.execute(
		sql`truncate table reports, sync_events, badges_awarded, progress, players, station_state, route_versions restart identity cascade`,
	);
}
