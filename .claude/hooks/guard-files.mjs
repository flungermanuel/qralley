// PreToolUse (Read|Edit|Write): keep secrets out of reach and out of the code.
import { basename } from "node:path";
import { block, readInput } from "./lib.mjs";

const input = readInput();
const file = input.tool_input?.file_path ?? "";
const name = basename(file);

const isSecretFile =
	(/^\.env(\..+)?$/.test(name) && name !== ".env.example") ||
	/\.(pem|key|p12|pfx)$/i.test(name) ||
	/^id_(rsa|ed25519|ecdsa)/.test(name);
if (isSecretFile) {
	block(
		`Blocked by .claude/hooks/guard-files.mjs: ${name} may contain secrets. Ask the user to handle it, or use .env.example.`,
	);
}

const written = `${input.tool_input?.content ?? ""}\n${input.tool_input?.new_string ?? ""}`;
if (name !== ".env.example") {
	if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(written)) {
		block(
			"Blocked by .claude/hooks/guard-files.mjs: private key material must never be written to the repository.",
		);
	}
	if (
		/QR_SIGNING_KEYS\s*[=:]\s*['"`]?\{\s*"\d+"\s*:\s*"[A-Za-z0-9_-]{40,}"/.test(
			written,
		)
	) {
		block(
			"Blocked by .claude/hooks/guard-files.mjs: looks like a real QR signing key. Read keys from the environment only.",
		);
	}
}
