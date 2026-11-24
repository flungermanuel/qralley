import { createDb } from "../apps/api/src/db/client";
import { setStationStatus } from "../apps/api/src/domain/station-admin";

const [routeId, stationId, status, ...rest] = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL;

if (!routeId || !stationId || !status || !databaseUrl) {
	console.error(
		"Usage: pnpm station:set-status <routeId> <stationId> <ok|reported|blocked> [reason]\n(DATABASE_URL must be set, see .env.example)",
	);
	process.exit(1);
}

const { db, close } = createDb(databaseUrl);
try {
	await setStationStatus(
		db,
		routeId,
		stationId,
		status as "ok" | "reported" | "blocked",
		rest.join(" ") || undefined,
	);
	console.log(`Station ${routeId}/${stationId} is now "${status}".`);
} catch (err) {
	console.error(err instanceof Error ? err.message : String(err));
	process.exitCode = 1;
} finally {
	await close();
}
