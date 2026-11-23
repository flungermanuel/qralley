import pg from "pg";
import { createDb, migrateDb } from "../src/db/client";

const TEST_DB_URL =
	process.env.TEST_DATABASE_URL ??
	"postgres://qurally:qurally_dev@localhost:5433/qurally_test";

/** Creates the test database if needed and applies all migrations once per run. */
export default async function setup(): Promise<void> {
	const url = new URL(TEST_DB_URL);
	const dbName = url.pathname.slice(1);
	if (!/^[a-z0-9_]+$/.test(dbName))
		throw new Error(`Unsafe test database name: ${dbName}`);

	const admin = new pg.Client({
		connectionString: new URL("/postgres", url).toString(),
	});
	try {
		await admin.connect();
	} catch (err) {
		throw new Error(
			`Cannot reach PostgreSQL for the integration tests (${(err as Error).message}).\n` +
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

	const { db, close } = createDb(TEST_DB_URL);
	try {
		await migrateDb(db);
	} finally {
		await close();
	}
}
