import { expect, type Page, test } from "@playwright/test";
import {
	playerExists,
	progressOfPlayer,
	reportsOfPlayer,
} from "../../api/src/db/admin";
import { createDb } from "../../api/src/db/client";
import { E2E_DATABASE_URL } from "../e2e-env";
import { texts } from "../src/texts";

async function confirmSafety(page: Page) {
	await page.getByRole("button", { name: texts.safety.confirm }).click();
}

async function openStation(page: Page, title: string) {
	await page.getByRole("button", { name: new RegExp(title) }).click();
	await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

/** Reads the anonymous player id from the app's IndexedDB. */
function readPlayerId(page: Page): Promise<string> {
	return page.evaluate(
		() =>
			new Promise<string>((resolve, reject) => {
				const open = indexedDB.open("qurally");
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const get = open.result
						.transaction("profile")
						.objectStore("profile")
						.get("me");
					get.onerror = () => reject(get.error);
					get.onsuccess = () => resolve(get.result.playerId);
				};
			}),
	);
}

async function withDb<T>(
	fn: (db: ReturnType<typeof createDb>["db"]) => Promise<T>,
): Promise<T> {
	const { db, close } = createDb(E2E_DATABASE_URL);
	try {
		return await fn(db);
	} finally {
		await close();
	}
}

test("AK-FALL-01 / AK-FALL-05: broken code, real position check, fallback question, server flags the station", async ({
	page,
	context,
	request,
}) => {
	// About 4 m from Goldenes Dachl.
	await context.setGeolocation({
		latitude: 47.268534,
		longitude: 11.393377,
		accuracy: 10,
	});
	await page.goto("/");
	await confirmSafety(page);
	await openStation(page, "Goldenes Dachl");

	await page.getByRole("button", { name: texts.fallback.start }).click();
	await page.getByRole("button", { name: texts.fallback.check }).click();
	await expect(page.getByText(/Bogenöffnungen/)).toBeVisible();
	await page.getByLabel(texts.quest.answerLabel).fill("3");
	await page.getByRole("button", { name: texts.quest.check }).click();

	await expect(page.getByText(texts.fallback.done(25))).toBeVisible();
	await page.getByRole("button", { name: texts.station.back }).click();
	await expect(
		page.getByText(texts.xp.summary(25, false), { exact: true }),
	).toBeVisible({
		timeout: 20_000,
	});

	const playerId = await readPlayerId(page);
	await withDb(async (db) => {
		const rows = await progressOfPlayer(db, playerId);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			stationId: "goldenes-dachl",
			state: "completed",
			method: "fallback",
		});
		const reports = await reportsOfPlayer(db, playerId);
		expect(reports.map((r) => r.kind)).toEqual(["code_damaged"]);
		// AK-FALL-06: neither the position nor its accuracy is stored anywhere in these rows.
		const dump = JSON.stringify([rows, reports]);
		expect(dump).not.toContain("47.268534");
		expect(dump).not.toContain("11.393377");
	});

	const bundle = await (
		await request.get("/api/routes/innsbruck-altstadt")
	).json();
	expect(bundle.stationStates["goldenes-dachl"].status).toBe("reported");
});

test("AK-FALL-02: too far from the station", async ({ page, context }) => {
	await context.setGeolocation({
		latitude: 47.2695,
		longitude: 11.3933,
		accuracy: 10,
	}); // ~110 m away
	await page.goto("/");
	await confirmSafety(page);
	await openStation(page, "Annasäule");
	await page.getByRole("button", { name: texts.fallback.start }).click();
	await page.getByRole("button", { name: texts.fallback.check }).click();
	await expect(page.getByText(texts.fallback.tooFar)).toBeVisible();
	await expect(page.getByText(/Jahreszahl|Figur/)).toHaveCount(0);
});

test("AK-REP / AK-SAFE-03: one tap reports an unsafe place and it reaches the server", async ({
	page,
}) => {
	await page.goto("/");
	await confirmSafety(page);
	await openStation(page, "Hofkirche");
	await page.getByRole("button", { name: texts.report.unsafe }).click();
	await expect(page.getByText(texts.report.thanks)).toBeVisible();

	const playerId = await readPlayerId(page);
	await expect
		.poll(
			() =>
				withDb(async (db) =>
					(await reportsOfPlayer(db, playerId)).map(
						(r) => `${r.stationId}:${r.kind}`,
					),
				),
			{
				timeout: 20_000,
			},
		)
		.toEqual(["hofkirche:unsafe"]);
});

test("AK-PROF-03: deleting my data removes the account on the server and starts over", async ({
	page,
}) => {
	await page.goto("/");
	await confirmSafety(page);
	await page.getByRole("button", { name: texts.scan.open }).click(); // fake camera shows Goldenes Dachl
	await expect(
		page.getByRole("heading", { name: "Goldenes Dachl" }),
	).toBeVisible({ timeout: 20_000 });
	await page.getByRole("button", { name: texts.station.back }).click();
	await expect(
		page.getByText(texts.xp.summary(10, false), { exact: true }),
	).toBeVisible({
		timeout: 20_000,
	});

	const playerId = await readPlayerId(page);
	expect(await withDb((db) => playerExists(db, playerId))).toBe(true);

	await page.getByRole("button", { name: texts.account.delete }).click();
	await expect(page.getByText(texts.account.confirmText)).toBeVisible();
	await page.getByRole("button", { name: texts.account.confirm }).click();

	await expect(page.getByText(texts.safety.title)).toBeVisible();
	expect(await withDb((db) => playerExists(db, playerId))).toBe(false);
	expect(await readPlayerId(page)).not.toBe(playerId);
});
