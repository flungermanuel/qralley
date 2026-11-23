import { createDb, migrateDb } from "./client";

const url = process.env.DATABASE_URL;
if (!url) {
	console.error("DATABASE_URL is not set (see .env.example).");
	process.exit(1);
}

const { db, close } = createDb(url);
try {
	await migrateDb(db);
	console.log("Migrations applied.");
} finally {
	await close();
}
