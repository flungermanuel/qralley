import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateRoute } from "@qurally/shared";
import { ensureDatabase, resetDatabase } from "../../api/src/db/admin";
import { createDb, migrateDb } from "../../api/src/db/client";
import { publishRoute } from "../../api/src/domain/publish";
import { E2E_DATABASE_URL } from "../e2e-env";

/** Prepares an empty e2e database with the example route published. */
export default async function globalSetup(): Promise<void> {
	await ensureDatabase(E2E_DATABASE_URL);
	const { db, close } = createDb(E2E_DATABASE_URL);
	try {
		await migrateDb(db);
		await resetDatabase(db);
		const file = resolve(
			process.cwd(),
			"../../content/routes/innsbruck-altstadt.route.json",
		);
		const result = validateRoute(JSON.parse(readFileSync(file, "utf8")));
		if (!result.ok) throw new Error("Example route is invalid");
		await publishRoute(db, result.route);
	} finally {
		await close();
	}
}
