import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The API runs separately in development and in the e2e setup; same origin in production.
const apiTarget = process.env.API_TARGET ?? "http://127.0.0.1:3000";
const proxy = { "/api": { target: apiTarget, changeOrigin: false } };

export default defineConfig({
	plugins: [
		react(),
		VitePWA({
			// The user decides when to reload (SPEC AK-PWA-02), so no silent auto-update.
			registerType: "prompt",
			manifest: {
				name: "qurally",
				short_name: "qurally",
				description:
					"Stadterkundung als Spiel: Stationen finden, Fragen lösen, Abzeichen sammeln.",
				lang: "de",
				start_url: "/",
				scope: "/",
				display: "standalone",
				background_color: "#ffffff",
				theme_color: "#1f6f5c",
				icons: [
					{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
					{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
					{
						src: "/icons/icon-maskable-512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
			workbox: {
				// App shell incl. WASM (the QR decoder joins in a later step) works offline.
				globPatterns: ["**/*.{js,css,html,svg,png,wasm,webmanifest}"],
				clientsClaim: true,
				cleanupOutdatedCaches: true,
				navigateFallback: "/index.html",
				// API calls always go to the network; route data is cached in IndexedDB.
				navigateFallbackDenylist: [/^\/api\//],
			},
		}),
	],
	server: { proxy },
	preview: { proxy },
});
