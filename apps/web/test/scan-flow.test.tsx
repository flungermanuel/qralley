import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import { getOrCreateProfile } from "../src/data/profile";
import { ScannerError } from "../src/ports/scanner";
import { texts } from "../src/texts";
import {
	bundleFixture,
	FakeScanner,
	jsonResponse,
	qrUrl,
	testDb,
	tokenFor,
} from "./helpers";

type Db = ReturnType<typeof testDb>;

async function setup(
	opts: {
		bundle?: ReturnType<typeof bundleFixture>;
		initialScanText?: string | null;
	} = {},
) {
	const db = testDb();
	await getOrCreateProfile(db);
	await db.profile.update("me", { safetyAcknowledgedAt: 1 });
	const scanner = new FakeScanner();
	const bundle = opts.bundle ?? bundleFixture();
	const utils = render(
		<App
			db={db}
			fetchFn={async () => jsonResponse(bundle, { etag: '"1"' })}
			updateAvailable={false}
			onUpdate={() => {}}
			createScanner={() => scanner}
			initialScanText={opts.initialScanText ?? null}
		/>,
	);
	return { db, scanner, ...utils };
}

const openScan = async () =>
	fireEvent.click(await screen.findByRole("button", { name: texts.scan.open }));

async function scanAndShow(scanner: FakeScanner, text: string) {
	await openScan();
	await screen.findByText(texts.scan.walkingWarning);
	scanner.emit(text);
}

const progress = (db: Db) => db.progress.toArray();

describe("scan screen", () => {
	it("AK-SAFE-04: warns not to look at the phone while walking and starts the camera", async () => {
		const { scanner } = await setup();
		await openScan();
		expect(await screen.findByText(texts.scan.walkingWarning)).toBeTruthy();
		expect(scanner.started).toBe(1);
	});

	it("AK-SCAN-01: a valid code opens the station and shows provisional XP", async () => {
		const { db, scanner } = await setup();
		await scanAndShow(scanner, qrUrl(tokenFor("goldenes-dachl")));

		expect(
			await screen.findByRole("heading", { name: "Goldenes Dachl" }),
		).toBeTruthy();
		expect(screen.getByText(texts.station.found(10))).toBeTruthy();
		expect(scanner.stopped).toBeGreaterThanOrEqual(1);
		expect(await progress(db)).toHaveLength(1);
	});

	it("AK-SCAN-07: a foreign code shows a hint, keeps scanning and stores nothing", async () => {
		const { db, scanner } = await setup();
		await scanAndShow(scanner, "https://example.org/hello");

		expect(await screen.findByText(texts.scan.foreign)).toBeTruthy();
		expect(scanner.stopped).toBe(0);
		expect(await progress(db)).toHaveLength(0);
	});

	it("AK-SCAN-03: a code of another route is explained", async () => {
		const { db, scanner } = await setup();
		await scanAndShow(
			scanner,
			qrUrl(tokenFor("goldenes-dachl", { routeId: "andere-route" })),
		);
		expect(await screen.findByText(texts.scan.wrongRoute)).toBeTruthy();
		expect(await progress(db)).toHaveLength(0);
	});

	it("AK-SCAN-06: a blocked station is explained", async () => {
		const bundle = bundleFixture();
		bundle.stationStates.annasaeule = { status: "blocked", reason: null };
		const { scanner } = await setup({ bundle });
		await scanAndShow(scanner, qrUrl(tokenFor("annasaeule")));
		expect(await screen.findByText(texts.scan.blocked)).toBeTruthy();
	});

	it("AK-SCAN-05: scanning a visited station again opens it without extra XP", async () => {
		const { db, scanner } = await setup();
		await scanAndShow(scanner, qrUrl(tokenFor("goldenes-dachl")));
		await screen.findByRole("heading", { name: "Goldenes Dachl" });
		fireEvent.click(screen.getByRole("button", { name: texts.station.back }));

		await scanAndShow(scanner, qrUrl(tokenFor("goldenes-dachl")));
		expect(
			await screen.findByRole("heading", { name: "Goldenes Dachl" }),
		).toBeTruthy();
		expect(screen.getByText(texts.scan.alreadyVisited)).toBeTruthy();
		expect(await progress(db)).toHaveLength(1);
	});

	it("AK-SCAN-08: denied camera permission is explained and the station list stays reachable", async () => {
		const { scanner } = await setup();
		scanner.failWith = new ScannerError("permission_denied");
		await openScan();

		expect(await screen.findByText(texts.scan.permissionDenied)).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: texts.scan.toList }));
		expect(
			await screen.findByRole("button", { name: /Goldenes Dachl/ }),
		).toBeTruthy();
	});

	it("stops the camera when the scan screen is left", async () => {
		const { scanner } = await setup();
		await openScan();
		await screen.findByText(texts.scan.walkingWarning);
		fireEvent.click(screen.getByRole("button", { name: texts.scan.cancel }));
		expect(scanner.stopped).toBeGreaterThanOrEqual(1);
		expect(
			await screen.findByRole("button", { name: /Goldenes Dachl/ }),
		).toBeTruthy();
	});

	it("stops the camera when the app unmounts", async () => {
		const { scanner, unmount } = await setup();
		await openScan();
		await screen.findByText(texts.scan.walkingWarning);
		unmount();
		expect(scanner.stopped).toBeGreaterThanOrEqual(1);
	});
});

describe("deep link", () => {
	it("AK-SCAN-09: a code opened via the system camera is processed like an in-app scan", async () => {
		const { db } = await setup({
			initialScanText: qrUrl(tokenFor("goldenes-dachl")),
		});
		expect(
			await screen.findByRole("heading", { name: "Goldenes Dachl" }),
		).toBeTruthy();
		expect(await progress(db)).toHaveLength(1);
	});

	it("shows a message for a foreign deep link and falls back to the list", async () => {
		await setup({ initialScanText: "https://example.org/q/garbage" });
		expect(await screen.findByText(texts.scan.foreign)).toBeTruthy();
		expect(
			await screen.findByRole("button", { name: /Goldenes Dachl/ }),
		).toBeTruthy();
	});
});

describe("quest", () => {
	it("AK-QUEST-01: a right choice completes the station and updates the XP", async () => {
		const { db, scanner } = await setup();
		await scanAndShow(scanner, qrUrl(tokenFor("goldenes-dachl")));
		await screen.findByRole("heading", { name: "Goldenes Dachl" });

		fireEvent.click(await screen.findByLabelText("Golden"));
		fireEvent.click(screen.getByRole("button", { name: texts.quest.check }));

		expect(await screen.findByText(texts.quest.correct(40))).toBeTruthy();
		expect(screen.getByText(texts.xp.summary(50, true))).toBeTruthy();
		expect((await progress(db))[0]).toMatchObject({
			state: "completed",
			confirmed: false,
		});
		expect(
			screen.queryByRole("button", { name: texts.quest.check }),
		).toBeNull();
	});

	it("AK-QUEST-02: a wrong answer is explained, XP stays and it can be retried", async () => {
		const { db, scanner } = await setup();
		await scanAndShow(scanner, qrUrl(tokenFor("goldenes-dachl")));
		await screen.findByRole("heading", { name: "Goldenes Dachl" });

		fireEvent.click(await screen.findByLabelText("Rot"));
		fireEvent.click(screen.getByRole("button", { name: texts.quest.check }));

		expect(await screen.findByText(texts.quest.wrong)).toBeTruthy();
		expect(screen.getByText(texts.xp.summary(10, true))).toBeTruthy();
		expect((await progress(db))[0]).toMatchObject({ state: "visited" });
		expect(
			screen.getByRole("button", { name: texts.quest.check }),
		).toBeTruthy();
	});

	it("AK-QUEST-05: a text answer with spaces and other case is accepted", async () => {
		const { scanner } = await setup();
		await scanAndShow(scanner, qrUrl(tokenFor("annasaeule")));
		await screen.findByRole("heading", { name: "Annasäule" });

		fireEvent.change(await screen.findByLabelText(texts.quest.answerLabel), {
			target: { value: "  1706 " },
		});
		fireEvent.click(screen.getByRole("button", { name: texts.quest.check }));
		expect(await screen.findByText(texts.quest.correct(40))).toBeTruthy();
	});

	it("AK-QUEST-03: an unvisited station shows its hint but no question", async () => {
		await setup();
		fireEvent.click(
			await screen.findByRole("button", { name: /Goldenes Dachl/ }),
		);
		expect(
			await screen.findByRole("heading", { name: "Goldenes Dachl" }),
		).toBeTruthy();
		expect(
			screen.getByText(/Am Ende der Herzog-Friedrich-Straße/),
		).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: texts.quest.check }),
		).toBeNull();
		expect(screen.queryByLabelText("Golden")).toBeNull();
	});

	it("a blocked station shows no question even when it was visited before", async () => {
		const bundle = bundleFixture();
		bundle.stationStates.annasaeule = { status: "blocked", reason: null };
		const { db } = await setup({ bundle });
		await db.progress.put({
			routeId: "innsbruck-altstadt",
			stationId: "annasaeule",
			state: "visited",
			method: "scan",
			confirmed: false,
		});
		fireEvent.click(await screen.findByRole("button", { name: /Annasäule/ }));
		const heading = await screen.findByRole("heading", { name: "Annasäule" });
		expect(heading).toBeTruthy();
		expect(screen.getByText(texts.status.blockedHint)).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: texts.quest.check }),
		).toBeNull();
	});
});

describe("station list progress", () => {
	it("AK-XP-01: shows the provisional XP total and the state of each station", async () => {
		const { db } = await setup();
		await db.progress.bulkPut([
			{
				routeId: "innsbruck-altstadt",
				stationId: "goldenes-dachl",
				state: "completed",
				method: "scan",
				confirmed: false,
			},
			{
				routeId: "innsbruck-altstadt",
				stationId: "annasaeule",
				state: "visited",
				method: "scan",
				confirmed: false,
			},
		]);

		expect(await screen.findByText(texts.xp.summary(60, true))).toBeTruthy();
		const dachl = screen.getByRole("button", { name: /Goldenes Dachl/ });
		expect(within(dachl).getByText(texts.station.stateCompleted)).toBeTruthy();
		const anna = screen.getByRole("button", { name: /Annasäule/ });
		expect(within(anna).getByText(texts.station.stateVisited)).toBeTruthy();
	});
});
