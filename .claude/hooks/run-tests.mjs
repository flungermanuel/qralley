// Stop: when code changed, the fast tests (no database needed) must be green before Claude finishes.
import { block, readInput, run, tail } from "./lib.mjs";

// Avoid endless loops: if we already blocked once, let Claude stop.
if (readInput().stop_hook_active) process.exit(0);

const changed = run("git", ["status", "--porcelain"])
	.output.split("\n")
	.filter(Boolean);
const codeChanged = changed.some((line) =>
	/\s(apps|packages|scripts)\//.test(line),
);
if (!codeChanged) process.exit(0);

for (const filter of ["@qurally/shared", "@qurally/web"]) {
	const result = run("pnpm", ["--filter", filter, "test"]);
	if (!result.ok)
		block(
			`Tests of ${filter} are failing. Fix them before finishing:\n${tail(result.output)}`,
		);
}
