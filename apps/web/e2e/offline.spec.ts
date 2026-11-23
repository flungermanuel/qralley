import { expect, type Page, test } from "@playwright/test";
import { texts } from "../src/texts";

const STATIONS = ["Goldenes Dachl", "Annasäule", "Hofkirche"];

async function confirmSafety(page: Page) {
	await page.getByRole("button", { name: texts.safety.confirm }).click();
}

/** Waits until the service worker controls the page (needed before going offline). */
async function waitForServiceWorker(page: Page) {
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

test("AK-SAFE-01: the safety notice comes first and is remembered", async ({
	page,
}) => {
	await page.goto("/");
	await expect(page.getByText(texts.safety.title)).toBeVisible();
	await expect(page.getByText(STATIONS[0] ?? "")).toHaveCount(0);

	await confirmSafety(page);
	for (const title of STATIONS)
		await expect(page.getByText(title)).toBeVisible();

	await page.reload();
	for (const title of STATIONS)
		await expect(page.getByText(title)).toBeVisible();
	await expect(page.getByText(texts.safety.title)).toHaveCount(0);
});

test("AK-LOAD-02 / AK-PWA-03: after one online visit the app starts offline", async ({
	page,
	context,
}) => {
	await page.goto("/");
	await confirmSafety(page);
	for (const title of STATIONS)
		await expect(page.getByText(title)).toBeVisible();
	await waitForServiceWorker(page);

	await context.setOffline(true);
	await page.reload();

	for (const title of STATIONS)
		await expect(page.getByText(title)).toBeVisible();
	await expect(page.getByText(texts.route.offlineCached)).toBeVisible();
});

test("AK-LOAD-03: a route that was never loaded explains itself, also offline", async ({
	page,
	context,
}) => {
	await page.route("**/api/routes/**", (route) => route.abort());
	await page.goto("/");
	await confirmSafety(page);
	await expect(page.getByText(texts.route.notLoaded)).toBeVisible();
	await waitForServiceWorker(page);

	await context.setOffline(true);
	await page.reload();
	await expect(page.getByText(texts.route.notLoaded)).toBeVisible();
	await expect(page.getByText(texts.safety.title)).toHaveCount(0);
});

test("AK-PWA-01: manifest, icons and service worker make the app installable", async ({
	page,
	request,
}) => {
	await page.goto("/");
	await waitForServiceWorker(page);

	await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
	const manifest = await (await request.get("/manifest.webmanifest")).json();
	expect(manifest).toMatchObject({
		display: "standalone",
		start_url: "/",
		lang: "de",
	});
	const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
	expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
	for (const icon of manifest.icons as { src: string }[]) {
		expect((await request.get(icon.src)).status()).toBe(200);
	}
});

test("AK-PRIV-02 / AK-SAFE-02: only own-origin requests and no notification prompt", async ({
	page,
	baseURL,
}) => {
	await page.addInitScript(() => {
		(window as unknown as { __notificationAsked: number }).__notificationAsked =
			0;
		const original = Notification.requestPermission.bind(Notification);
		Notification.requestPermission = (...args) => {
			(
				window as unknown as { __notificationAsked: number }
			).__notificationAsked += 1;
			return original(...args);
		};
	});
	const foreign: string[] = [];
	page.on("request", (req) => {
		const url = req.url();
		if (
			!url.startsWith("data:") &&
			!url.startsWith("blob:") &&
			!url.startsWith(baseURL ?? "")
		) {
			foreign.push(url);
		}
	});

	await page.goto("/");
	await confirmSafety(page);
	for (const title of STATIONS)
		await expect(page.getByText(title)).toBeVisible();
	await waitForServiceWorker(page);

	expect(foreign).toEqual([]);
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { __notificationAsked: number })
					.__notificationAsked,
		),
	).toBe(0);
});
