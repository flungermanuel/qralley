import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateRoute } from "@qurally/shared";
import { createDb } from "../apps/api/src/db/client";
import { publishRoute } from "../apps/api/src/domain/publish";

const file = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;
if (!file || !databaseUrl) {
	console.error(
		"Usage: pnpm route:publish <file.route.json>   (DATABASE_URL must be set, see .env.example)",
	);
	process.exit(1);
}

const result = validateRoute(JSON.parse(readFileSync(resolve(file), "utf8")));
if (!result.ok) {
	console.error(
		`Route is invalid:\n${result.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n")}`,
	);
	process.exit(1);
}

const { db, close } = createDb(databaseUrl);
try {
	const published = await publishRoute(db, result.route);
	console.log(
		published.status === "published"
			? `Published ${result.route.id} version ${published.version}.`
			: `Unchanged: ${result.route.id} version ${published.version} is already published.`,
	);
} catch (err) {
	console.error(err instanceof Error ? err.message : String(err));
	process.exitCode = 1;
} finally {
	await close();
}
