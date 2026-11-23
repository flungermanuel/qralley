// PostToolUse (Edit|Write): format and lint the changed file with Biome.
import { relative, resolve } from "node:path";
import { block, projectDir, readInput, run, tail } from "./lib.mjs";

const file = readInput().tool_input?.file_path;
if (!file || !/\.(ts|tsx|js|mjs|cjs|json|css)$/.test(file)) process.exit(0);

const absolute = resolve(file);
const rel = relative(projectDir, absolute).replaceAll("\\", "/");
if (
	rel.startsWith("..") ||
	/(^|\/)(node_modules|dist|drizzle\/meta|test-results|playwright-report|\.generated)\//.test(
		rel,
	)
) {
	process.exit(0);
}

const result = run("pnpm", ["exec", "biome", "check", "--write", rel]);
if (!result.ok)
	block(
		`Biome found problems in ${rel} that it could not fix:\n${tail(result.output)}`,
	);
