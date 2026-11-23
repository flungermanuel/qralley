import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Hook input (JSON on stdin). Empty or invalid input yields an empty object. */
export function readInput() {
	try {
		return JSON.parse(readFileSync(0, "utf8") || "{}");
	} catch {
		return {};
	}
}

export const projectDir = resolve(
	process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
);

/** Blocks the tool call / stop: exit code 2 feeds stderr back to Claude. */
export function block(message) {
	process.stderr.write(`${message}\n`);
	process.exit(2);
}

/** Runs a command in the project directory and returns { ok, output }. Checks the real exit code. */
export function run(command, args) {
	const result = spawnSync(command, args, {
		cwd: projectDir,
		encoding: "utf8",
		shell: process.platform === "win32",
		maxBuffer: 64 * 1024 * 1024,
	});
	return {
		ok: result.status === 0,
		output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
	};
}

export const tail = (text, lines = 40) =>
	text.trimEnd().split("\n").slice(-lines).join("\n");
