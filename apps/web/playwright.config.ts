import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { parseSigningKeys, signToken } from "../api/src/domain/token";
import { writeQrVideo } from "./e2e/fake-camera";
import {
	E2E_API_PORT,
	E2E_DATABASE_URL,
	E2E_QR_SIGNING_KEYS,
	E2E_WEB_PORT,
} from "./e2e-env";

const baseURL = `http://127.0.0.1:${E2E_WEB_PORT}`;

// The fake camera shows the printed code of "goldenes-dachl" (signed with the e2e key).
const cameraVideo = fileURLToPath(
	new URL("./e2e/.generated/goldenes-dachl.y4m", import.meta.url),
);
const token = signToken(parseSigningKeys(E2E_QR_SIGNING_KEYS), {
	routeId: "innsbruck-altstadt",
	stationId: "goldenes-dachl",
	keyVersion: 1,
});
writeQrVideo(cameraVideo, `${baseURL}/q/${token}`);

export default defineConfig({
	testDir: "e2e",
	globalSetup: "./e2e/global-setup.ts",
	// One shared database and service worker state: run tests one at a time.
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: "list",
	use: {
		baseURL,
		serviceWorkers: "allow",
		permissions: ["camera"],
		launchOptions: {
			args: [
				"--use-fake-device-for-media-stream",
				"--use-fake-ui-for-media-stream",
				`--use-file-for-fake-video-capture=${cameraVideo}`,
			],
		},
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
			url: baseURL,
			reuseExistingServer: false,
			env: { API_TARGET: `http://127.0.0.1:${E2E_API_PORT}` },
		},
	],
});
