import { expect, type Page, test } from "@playwright/test";
import { parseSigningKeys, signToken } from "../../api/src/domain/token";
import { E2E_QR_SIGNING_KEYS } from "../e2e-env";
import { texts } from "../src/texts";

async function confirmSafety(page: Page) {
	await page.getByRole("button", { name: texts.safety.confirm }).click();
}

async function waitForServiceWorker(page: Page) {
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

// The fake camera (see playwright.config.ts) shows the signed code of "Goldenes Dachl".

test("AK-SCAN-01 / AK-QUEST-01: scanning with the camera opens the station and the quest completes it", async ({
	page,
}) => {
	const foreign: string[] = [];
	page.on("request", (req) => {
		const url = req.url();
		if (
			!url.startsWith("data:") &&
			!url.startsWith("blob:") &&
			!url.startsWith("http://127.0.0.1:4173")
		) {
			foreign.push(url);
		}
	});

	await page.goto("/");
	await confirmSafety(page);
	await page.getByRole("button", { name: texts.scan.open }).click();
	await expect(page.getByText(texts.scan.walkingWarning)).toBeVisible();

	await expect(
		page.getByRole("heading", { name: "Goldenes Dachl" }),
	).toBeVisible({ timeout: 20_000 });
	await expect(page.getByText(texts.station.found(10))).toBeVisible();

	await page.getByLabel("Golden").check();
	await page.getByRole("button", { name: texts.quest.check }).click();
	await expect(page.getByText(texts.quest.correct(40))).toBeVisible();
	await expect(page.getByText(texts.xp.summary(50, true))).toBeVisible();

	// Progress is stored locally and survives a reload.
	await page.reload();
	await expect(page.getByText(texts.xp.summary(50, true))).toBeVisible();
	await expect(page.getByText(texts.station.stateCompleted)).toBeVisible();

	// AK-PRIV-02: the QR decoder (WASM) comes from our own origin, nothing from a CDN.
	expect(foreign).toEqual([]);
});

test("AK-PWA-03 / AK-SYNC-06: the scanner works offline once the app was opened online", async ({
	page,
	context,
}) => {
	await page.goto("/");
	await confirmSafety(page);
	await expect(
		page.getByRole("button", { name: texts.scan.open }),
	).toBeVisible();
	await waitForServiceWorker(page);

	await context.setOffline(true);
	await page.reload();
	await expect(page.getByText(texts.route.offlineCached)).toBeVisible();

	await page.getByRole("button", { name: texts.scan.open }).click();
	await expect(
		page.getByRole("heading", { name: "Goldenes Dachl" }),
	).toBeVisible({ timeout: 20_000 });
	await expect(page.getByText(texts.station.found(10))).toBeVisible();
});

test("AK-SCAN-09: opening a code URL directly (system camera) lands on the station after the safety notice", async ({
	page,
}) => {
	const token = signToken(parseSigningKeys(E2E_QR_SIGNING_KEYS), {
		routeId: "innsbruck-altstadt",
		stationId: "annasaeule",
		keyVersion: 1,
	});
	await page.goto(`/q/${token}`);
	await expect(page.getByText(texts.safety.title)).toBeVisible();
	await confirmSafety(page);

	await expect(page.getByRole("heading", { name: "Annasäule" })).toBeVisible();
	await expect(page.getByText(texts.station.found(10))).toBeVisible();
	// The code is no longer in the address bar, so a reload does not scan it again.
	expect(new URL(page.url()).pathname).toBe("/");
});
