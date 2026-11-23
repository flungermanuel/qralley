import { defineConfig } from "@playwright/test";
import {
	E2E_API_PORT,
	E2E_DATABASE_URL,
	E2E_QR_SIGNING_KEYS,
	E2E_WEB_PORT,
} from "./e2e-env";

export default defineConfig({
	testDir: "e2e",
	globalSetup: "./e2e/global-setup.ts",
	// One shared database and service worker state: run tests one at a time.
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: "list",
	use: {
		baseURL: `http://127.0.0.1:${E2E_WEB_PORT}`,
		serviceWorkers: "allow",
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
	webServer: [
		{
			command: "pnpm exec tsx ../api/src/server.ts",
			url: `http://127.0.0.1:${E2E_API_PORT}/api/health`,
			reuseExistingServer: false,
			env: {
				DATABASE_URL: E2E_DATABASE_URL,
				QR_SIGNING_KEYS: E2E_QR_SIGNING_KEYS,
				HOST: "127.0.0.1",
				PORT: String(E2E_API_PORT),
				LOG_LEVEL: "silent",
			},
		},
		{
			// Production build: the service worker only exists there.
			command: `pnpm exec vite build && pnpm exec vite preview --host 127.0.0.1 --port ${E2E_WEB_PORT} --strictPort`,
			url: `http://127.0.0.1:${E2E_WEB_PORT}`,
			reuseExistingServer: false,
			env: { API_TARGET: `http://127.0.0.1:${E2E_API_PORT}` },
		},
	],
});
