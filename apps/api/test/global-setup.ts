import { ensureDatabase } from "../src/db/admin";
import { createDb, migrateDb } from "../src/db/client";

const TEST_DB_URL =
	process.env.TEST_DATABASE_URL ??
	"postgres://qurally:qurally_dev@localhost:5433/qurally_test";

/** Creates the test database if needed and applies all migrations once per run. */
export default async function setup(): Promise<void> {
	await ensureDatabase(TEST_DB_URL);
	const { db, close } = createDb(TEST_DB_URL);
	try {
		await migrateDb(db);
	} finally {
		await close();
	}
}
