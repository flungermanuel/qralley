import { buildApp } from "./app";
import { loadAlertThresholds } from "./config";
import { createDb } from "./db/client";
import { parseSigningKeys } from "./domain/token";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL is not set (see .env.example).");
	process.exit(1);
}

// Fails fast with a clear message when QR_SIGNING_KEYS is missing or too weak.
const signingKeys = parseSigningKeys(process.env.QR_SIGNING_KEYS);

// Aborts before connecting or listening when a threshold variable is malformed.
let alertThresholds: ReturnType<typeof loadAlertThresholds>;
try {
	alertThresholds = loadAlertThresholds(process.env);
} catch (err) {
	console.error(
		err instanceof Error ? err.message : "invalid alert thresholds",
	);
	process.exit(1);
}

const { db, close } = createDb(databaseUrl);
const app = buildApp({ db, signingKeys, alertThresholds });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, async () => {
		await app.close();
		await close();
		process.exit(0);
	});
}

await app.listen({
	host: process.env.HOST ?? "127.0.0.1",
	port: Number(process.env.PORT ?? 3000),
});
