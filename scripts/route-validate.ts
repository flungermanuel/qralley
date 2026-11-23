import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateRoute } from "@qurally/shared";

const routesDir = resolve(import.meta.dirname, "../content/routes");
const files = process.argv.slice(2);
const targets =
	files.length > 0
		? files.map((f) => resolve(f))
		: readdirSync(routesDir)
				.filter((f) => f.endsWith(".route.json"))
				.map((f) => join(routesDir, f));

if (targets.length === 0) {
	console.error("No route files found.");
	process.exit(1);
}

let failed = false;
for (const file of targets) {
	let json: unknown;
	try {
		json = JSON.parse(readFileSync(file, "utf8"));
	} catch (err) {
		console.error(
			`FAIL ${file}\n  not readable as JSON: ${(err as Error).message}`,
		);
		failed = true;
		continue;
	}
	const result = validateRoute(json);
	if (result.ok) {
		console.log(`OK   ${file}`);
		for (const w of result.warnings)
			console.warn(`  warning ${w.path}: ${w.message}`);
	} else {
		failed = true;
		console.error(`FAIL ${file}`);
		for (const e of result.errors) console.error(`  ${e.path}: ${e.message}`);
	}
}
process.exit(failed ? 1 : 0);
