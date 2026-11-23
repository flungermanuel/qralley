import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globalSetup: ["./test/global-setup.ts"],
		// Integration tests share one database, so test files run one after another.
		fileParallelism: false,
		env: { LOG_LEVEL: "silent" },
	},
});
