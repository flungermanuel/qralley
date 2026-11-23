import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { validateRoute } from "@qurally/shared";
import { buildQrJobs, renderQrSvg } from "../apps/api/src/domain/qr-codes";
import { parseSigningKeys } from "../apps/api/src/domain/token";

const { values } = parseArgs({
	options: {
		route: { type: "string" },
		"base-url": { type: "string" },
		out: { type: "string", default: "qr-out" },
	},
});

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

if (!values.route || !values["base-url"]) {
	fail(
		"Usage: pnpm qr:generate --route <file.route.json> --base-url <https://host> [--out <dir>]",
	);
}

try {
	const keys = parseSigningKeys(process.env.QR_SIGNING_KEYS);
	const result = validateRoute(
		JSON.parse(readFileSync(resolve(values.route), "utf8")),
	);
	if (!result.ok) {
		fail(
			`Route is invalid:\n${result.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n")}`,
		);
	}
	const route = result.ok ? result.route : fail("unreachable");
	const jobs = buildQrJobs(route, values["base-url"], keys);

	const outDir = resolve(values.out);
	mkdirSync(outDir, { recursive: true });
	for (const job of jobs) {
		const file = join(outDir, `${route.id}__${job.stationId}.svg`);
		writeFileSync(file, renderQrSvg(job.url, job.title));
		console.log(`wrote ${file}`);
	}
} catch (err) {
	fail(err instanceof Error ? err.message : String(err));
}
