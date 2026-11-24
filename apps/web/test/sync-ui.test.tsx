import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import { getOrCreateProfile } from "../src/data/profile";
import { processScan } from "../src/data/scan";
import { texts } from "../src/texts";
import { FakeServer } from "./fake-server";
import { bundleFixture, FakeScanner, qrUrl, testDb, tokenFor } from "./helpers";

async function setup(
	configure: (server: FakeServer) => void = () => {},
	preload?: (db: ReturnType<typeof testDb>) => Promise<void>,
) {
	const db = testDb();
	await getOrCreateProfile(db);
	await db.profile.update("me", { safetyAcknowledgedAt: 1 });
	const server = new FakeServer();
	configure(server);
	await preload?.(db);
	const scanner = new FakeScanner();
	const utils = render(
		<App
			db={db}
			fetchFn={server.fetch}
			updateAvailable={false}
			onUpdate={() => {}}
			createScanner={() => scanner}
			initialScanText={null}
		/>,
	);
	return { db, server, scanner, ...utils };
}

async function scanStation(scanner: FakeScanner, stationId: string) {
	fireEvent.click(await screen.findByRole("button", { name: texts.scan.open }));
	await screen.findByText(texts.scan.walkingWarning);
	scanner.emit(qrUrl(tokenFor(stationId)));
	await screen.findByText(texts.station.found(10));
}

describe("sync triggers", () => {
	it("AK-SYNC-05: syncs by itself after an action and confirms the XP", async () => {
		const { scanner } = await setup();
		await scanStation(scanner, "goldenes-dachl");
		expect(await screen.findByText(texts.xp.summary(10, false))).toBeTruthy();
	});

	it("AK-SYNC-05: syncs when the device comes back online", async () => {
		const { scanner, server } = await setup((s) => {
			s.failNext = 1;
		});
		await scanStation(scanner, "goldenes-dachl");

		expect(await screen.findByText(texts.sync.failed)).toBeTruthy();
		expect(screen.getByText(texts.sync.pending(1))).toBeTruthy();
		expect(await screen.findByText(texts.xp.summary(10, true))).toBeTruthy();

		window.dispatchEvent(new Event("online"));
		expect(await screen.findByText(texts.xp.summary(10, false))).toBeTruthy();
		expect(server.serverStation("goldenes-dachl")).toMatchObject({
			state: "visited",
		});
		expect(screen.queryByText(texts.sync.pending(1))).toBeNull();
	});

	it("AK-SYNC-05: syncs when the app becomes visible again", async () => {
		const { scanner } = await setup((s) => {
			s.failNext = 1;
		});
		await scanStation(scanner, "goldenes-dachl");
		await screen.findByText(texts.sync.failed);

		document.dispatchEvent(new Event("visibilitychange"));
		expect(await screen.findByText(texts.xp.summary(10, false))).toBeTruthy();
	});

	it("AK-SYNC-05: syncs pending events when the app starts", async () => {
		await setup(
			() => {},
			async (db) => {
				await processScan(db, bundleFixture(), qrUrl(tokenFor("annasaeule")));
			},
		);
		expect(await screen.findByText(texts.xp.summary(10, false))).toBeTruthy();
	});

	it("AK-SYNC-05: offers a button to sync right now", async () => {
		const { scanner } = await setup((s) => {
			s.failNext = 1;
		});
		await scanStation(scanner, "goldenes-dachl");
		await screen.findByText(texts.sync.failed);

		fireEvent.click(screen.getByRole("button", { name: texts.sync.now }));
		expect(await screen.findByText(texts.xp.summary(10, false))).toBeTruthy();
	});

	it("tells the player that a sync failed and will be retried", async () => {
		const { scanner } = await setup((s) => {
			s.failNext = 1;
		});
		await scanStation(scanner, "goldenes-dachl");
		expect(await screen.findByText(texts.sync.failed)).toBeTruthy();
	});

	it("AK-SYNC-06: actions never wait for the network", async () => {
		const { scanner } = await setup((s) => {
			s.hangSync = true; // the server never answers a sync
		});
		await scanStation(scanner, "goldenes-dachl");

		fireEvent.click(screen.getByLabelText("Golden"));
		fireEvent.click(screen.getByRole("button", { name: texts.quest.check }));
		expect(await screen.findByText(texts.quest.correct(40))).toBeTruthy();
		expect(await screen.findByText(texts.xp.summary(50, true))).toBeTruthy();
	});
});

describe("rejected events", () => {
	it("AK-SYNC-04: shows why an entry was rejected, rolls the XP back and can be dismissed", async () => {
		const { scanner } = await setup((s) => {
			s.rejectType.set("scan", "invalid_token");
		});
		await scanStation(scanner, "goldenes-dachl");

		const message = texts.sync.issue(
			"Goldenes Dachl",
			texts.sync.reasons.invalid_token ?? texts.sync.reasonUnknown,
		);
		expect(await screen.findByText(message)).toBeTruthy();
		expect(await screen.findByText(texts.xp.summary(0, false))).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: texts.sync.dismiss }));
		await waitFor(() => expect(screen.queryByText(message)).toBeNull());
	});
});
