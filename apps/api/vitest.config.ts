import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globalSetup: ["./test/global-setup.ts"],
		// Integration tests share one database, so test files run one after another.
		fileParallelism: false,
		env: { LOG_LEVEL: "silent" },
		// Some tests send up to 50 events, each in its own transaction; give them room on a busy machine.
		testTimeout: 20_000,
	},
});
