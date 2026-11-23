import { fileURLToPath } from "node:url";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

export function createDb(connectionString: string): {
	db: Db;
	close: () => Promise<void>;
} {
	const pool = new pg.Pool({ connectionString, max: 10 });
	return { db: drizzle(pool, { schema }), close: () => pool.end() };
}

export async function migrateDb(db: Db): Promise<void> {
	await migrate(db, {
		migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
	});
}
