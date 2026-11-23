// Enforces the layering rules from docs/ARCHITEKTUR.md by looking at import statements.
// Usage: pnpm check:layers  (exit code 1 on violations)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Each rule applies to files below `dir` (production code only, tests are exempt).
 * `forbidExternal`: package names (prefix match) that must not be imported.
 * `forbidInternal`: repo-relative path prefixes that must not be imported.
 */
const rules = [
	{
		layer: "shared (pure logic and schemas)",
		dir: "packages/shared/src",
		forbidExternal: [
			"react",
			"react-dom",
			"dexie",
			"fastify",
			"@fastify",
			"drizzle-orm",
			"pg",
			"node:",
		],
		forbidInternal: ["apps/"],
	},
	{
		layer: "web ports (interfaces)",
		dir: "apps/web/src/ports",
		forbidExternal: ["react", "react-dom", "dexie"],
		forbidInternal: [
			"apps/web/src/data",
			"apps/web/src/adapters",
			"apps/web/src/App",
			"apps/web/src/features",
			"apps/api",
		],
	},
	{
		layer: "web adapters (browser APIs, libraries)",
		dir: "apps/web/src/adapters",
		forbidExternal: ["react", "react-dom", "dexie"],
		forbidInternal: [
			"apps/web/src/data",
			"apps/web/src/App",
			"apps/web/src/features",
			"apps/api",
		],
	},
	{
		layer: "web data (storage, sync, rules; no UI)",
		dir: "apps/web/src/data",
		forbidExternal: ["react", "react-dom"],
		forbidInternal: [
			"apps/web/src/adapters",
			"apps/web/src/App",
			"apps/web/src/features",
			"apps/api",
		],
	},
	{
		layer: "api domain (business rules; no HTTP)",
		dir: "apps/api/src/domain",
		forbidExternal: ["fastify", "@fastify"],
		forbidInternal: [
			"apps/api/src/app",
			"apps/api/src/server",
			"apps/api/src/routes",
			"apps/web",
		],
	},
	{
		layer: "api db (schema, client; no rules, no HTTP)",
		dir: "apps/api/src/db",
		forbidExternal: ["fastify", "@fastify"],
		forbidInternal: [
			"apps/api/src/domain",
			"apps/api/src/app",
			"apps/api/src/server",
			"apps/api/src/routes",
			"apps/web",
		],
	},
	{
		layer: "api routes (HTTP; no direct DB schema access)",
		dir: "apps/api/src/routes",
		forbidExternal: [],
		forbidInternal: ["apps/api/src/db/schema", "apps/web"],
	},
	{
		layer: "web UI features (no storage or network details)",
		dir: "apps/web/src/features",
		forbidExternal: ["dexie"],
		forbidInternal: ["apps/web/src/adapters", "apps/api"],
	},
];

const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;

function* walk(dir) {
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return;
	}
	for (const entry of entries) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) yield* walk(path);
		else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) yield path;
	}
}

const violations = [];
let filesChecked = 0;

for (const rule of rules) {
	for (const file of walk(join(root, rule.dir))) {
		filesChecked++;
		const source = readFileSync(file, "utf8");
		for (const match of source.matchAll(IMPORT)) {
			const spec = match[1];
			const line = source.slice(0, match.index).split("\n").length;
			const where = `${relative(root, file).replaceAll("\\", "/")}:${line}`;

			if (spec.startsWith(".")) {
				const target = relative(root, resolve(dirname(file), spec)).replaceAll(
					"\\",
					"/",
				);
				const hit = rule.forbidInternal.find(
					(p) =>
						target === p || target.startsWith(`${p}/`) || target.startsWith(p),
				);
				if (hit)
					violations.push(
						`${where}  [${rule.layer}] must not import "${spec}" (${hit})`,
					);
			} else {
				const hit = rule.forbidExternal.find(
					(p) =>
						spec === p ||
						spec.startsWith(p.endsWith(":") ? p : `${p}/`) ||
						(p.endsWith(":") && spec.startsWith(p)),
				);
				if (hit)
					violations.push(
						`${where}  [${rule.layer}] must not import "${spec}"`,
					);
			}
		}
	}
}

// Size budget: big files are where layers blur. Known debt is frozen at its current size and may only shrink.
const DEFAULT_MAX_LINES = 500;
const knownDebt = {
	"apps/web/src/App.tsx": 1100, // TODO: split into src/features/* (screens, hooks, components)
	"apps/api/src/domain/sync.ts": 550, // TODO: one module per event type
};
for (const dir of ["apps/web/src", "apps/api/src", "packages/shared/src"]) {
	for (const file of walk(join(root, dir))) {
		const rel = relative(root, file).replaceAll("\\", "/");
		const lines = readFileSync(file, "utf8").split("\n").length;
		const limit = knownDebt[rel] ?? DEFAULT_MAX_LINES;
		if (lines > limit)
			violations.push(
				`${rel}  has ${lines} lines, budget is ${limit}. Split it by responsibility (docs/ARCHITEKTUR.md)`,
			);
	}
}

if (violations.length > 0) {
	console.error(
		`Layer violations (${violations.length}):\n${violations.map((v) => `  ${v}`).join("\n")}`,
	);
	process.exit(1);
}
console.log(
	`Layers OK (${filesChecked} files checked against ${rules.length} rules).`,
);
