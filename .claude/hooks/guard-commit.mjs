// PreToolUse (Bash): a commit only goes through when layering, lint, types and tests are green.
import { block, readInput, run, tail } from "./lib.mjs";

const command = readInput().tool_input?.command ?? "";
if (!/\bgit\s+commit\b/.test(command)) process.exit(0);

const staged = run("git", ["diff", "--cached", "--name-only"])
	.output.split("\n")
	.filter(Boolean);
const docsOnly =
	staged.length > 0 &&
	staged.every((f) => /^(docs\/|\.claude\/|CLAUDE\.md$)|\.md$/.test(f));
if (docsOnly) process.exit(0);

const steps = [
	["layer check", "pnpm", ["check:layers"]],
	["lint", "pnpm", ["lint"]],
	["typecheck", "pnpm", ["typecheck"]],
	["tests", "pnpm", ["test"]],
];

for (const [name, cmd, args] of steps) {
	const result = run(cmd, args);
	if (!result.ok) {
		const hint =
			name === "tests" ? "\n(API tests need the database: pnpm db:up)" : "";
		block(
			`Commit blocked by .claude/hooks/guard-commit.mjs: ${name} failed.${hint}\n${tail(result.output)}`,
		);
	}
}
