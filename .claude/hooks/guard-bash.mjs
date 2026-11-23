// PreToolUse (Bash): refuse dangerous commands.
import { block, readInput } from "./lib.mjs";

const command = readInput().tool_input?.command ?? "";

const SAFE_RM_TARGET =
	/(node_modules|dist|test-results|playwright-report|\.generated|qr-out)/;
const rules = [
	{
		test: (c) =>
			/\brm\s+(-\w*[rR]\w*\s+)*-?\w*[fF]\w*|\brm\s+-\w*[rR]/.test(c) &&
			!SAFE_RM_TARGET.test(c),
		why: "rm -r/-f outside build folders (node_modules, dist, test-results, playwright-report, .generated, qr-out)",
	},
	{
		test: (c) =>
			/\bgit\s+push\b[^|;&]*(--force\b|--force-with-lease|\s-f\b)/.test(c),
		why: "force push",
	},
	{ test: (c) => /\bgit\s+reset\s+--hard\b/.test(c), why: "git reset --hard" },
	{ test: (c) => /\bgit\s+clean\s+-\w*f/.test(c), why: "git clean -f" },
	{
		test: (c) =>
			/\bgit\s+commit\b[^|;&]*(--no-verify|-n\b|--no-gpg-sign)/.test(c),
		why: "skipping commit hooks or signing",
	},
	{
		test: (c) =>
			/\b(curl|wget|iwr|Invoke-WebRequest)\b[^|]*\|\s*(sh|bash|zsh|pwsh|powershell|iex)\b/i.test(
				c,
			),
		why: "piping a download into a shell",
	},
	{
		test: (c) => /\b(drop|truncate)\s+(table|database|schema)\b/i.test(c),
		why: "destructive SQL on the command line",
	},
	{
		test: (c) =>
			/(^|[\s"'/\\=])\.env(?!\.example)(\.[\w-]+)?(?=[\s"']|$)/.test(c),
		why: "touching .env files (secrets). Use .env.example for documentation",
	},
];

for (const rule of rules) {
	if (rule.test(command)) {
		block(
			`Blocked by .claude/hooks/guard-bash.mjs: ${rule.why}.\nIf this is really needed, ask the user to run it themselves.\nCommand: ${command}`,
		);
	}
}
