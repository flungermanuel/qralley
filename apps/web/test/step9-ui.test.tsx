import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import { getOrCreateProfile } from "../src/data/profile";
import { answerQuest } from "../src/data/quest";
import { processScan } from "../src/data/scan";
import { GeolocationError } from "../src/ports/geolocation";
import { texts } from "../src/texts";
import { FakeServer } from "./fake-server";
import {
	bundleFixture,
	FakeGeolocation,
	FakeScanner,
	NEAR_DACHL,
	qrUrl,
	testDb,
	tokenFor,
} from "./helpers";

type Db = ReturnType<typeof testDb>;

interface Options {
	server?: (s: FakeServer) => void;
	preload?: (db: Db) => Promise<void>;
	geo?: ConstructorParameters<typeof FakeGeolocation>[0];
}

async function setup(opts: Options = {}) {
	const db = testDb();
	await getOrCreateProfile(db);
	await db.profile.update("me", { safetyAcknowledgedAt: 1 });
	const server = new FakeServer();
	opts.server?.(server);
	await opts.preload?.(db);
	const geo = new FakeGeolocation(opts.geo ?? NEAR_DACHL);
	const utils = render(
		<App
			db={db}
			fetchFn={server.fetch}
			updateAvailable={false}
			onUpdate={() => {}}
			createScanner={() => new FakeScanner()}
			geolocation={geo}
			initialScanText={null}
		/>,
	);
	return { db, server, geo, ...utils };
}

const openStation = async (title: RegExp | string) =>
	fireEvent.click(await screen.findByRole("button", { name: title }));

async function startFallbackCheck() {
	fireEvent.click(
		await screen.findByRole("button", { name: texts.fallback.start }),
	);
	fireEvent.click(
		await screen.findByRole("button", { name: texts.fallback.check }),
	);
}

describe("fallback (Ersatzweg)", () => {
	it("AK-FALL-01: location check, fallback question and reduced XP", async () => {
		const { db, server } = await setup();
		await openStation(/Goldenes Dachl/);
		await startFallbackCheck();

		expect(await screen.findByText(/Bogenöffnungen/)).toBeTruthy();
		fireEvent.change(await screen.findByLabelText(texts.quest.answerLabel), {
			target: { value: "3" },
		});
		fireEvent.click(screen.getByRole("button", { name: texts.quest.check }));

		expect(await screen.findByText(texts.fallback.done(25))).toBeTruthy();
		await waitFor(() =>
			expect(server.serverStation("goldenes-dachl")).toMatchObject({
				method: "fallback",
			}),
		);
		expect(
			await db.progress.get(["innsbruck-altstadt", "goldenes-dachl"]),
		).toMatchObject({
			state: "completed",
			method: "fallback",
		});
		expect(await screen.findByText(texts.xp.summary(25, false))).toBeTruthy();
	});

	it("AK-FALL-02: too far away explains itself and shows no question", async () => {
		await setup({ geo: { lat: 47.2695, lng: 11.3933, accuracyM: 10 } });
		await openStation(/Goldenes Dachl/);
		await startFallbackCheck();
		expect(await screen.findByText(texts.fallback.tooFar)).toBeTruthy();
		expect(screen.queryByText(/Bogenöffnungen/)).toBeNull();
	});

	it("AK-FALL-03: poor accuracy asks to try again", async () => {
		await setup({ geo: { ...NEAR_DACHL, accuracyM: 80 } });
		await openStation(/Goldenes Dachl/);
		await startFallbackCheck();
		expect(await screen.findByText(texts.fallback.inaccurate)).toBeTruthy();
		expect(
			screen.getByRole("button", { name: texts.fallback.check }),
		).toBeTruthy();
	});

	it("AK-FALL-04: a denied location permission is explained and nothing is stored", async () => {
		const { db } = await setup({
			geo: new GeolocationError("permission_denied"),
			server: (s) => (s.hangSync = true),
		});
		await openStation(/Goldenes Dachl/);
		await startFallbackCheck();
		expect(
			await screen.findByText(texts.fallback.permissionDenied),
		).toBeTruthy();
		expect(await db.progress.count()).toBe(0);
		expect(await db.outbox.count()).toBe(0);
	});

	it("an unavailable position is explained too", async () => {
		await setup({ geo: new GeolocationError("unavailable") });
		await openStation(/Goldenes Dachl/);
		await startFallbackCheck();
		expect(await screen.findByText(texts.fallback.unavailable)).toBeTruthy();
	});

	it("a wrong fallback answer is explained and can be retried", async () => {
		const { db } = await setup({ server: (s) => (s.hangSync = true) });
		await openStation(/Goldenes Dachl/);
		await startFallbackCheck();
		fireEvent.change(await screen.findByLabelText(texts.quest.answerLabel), {
			target: { value: "99" },
		});
		fireEvent.click(screen.getByRole("button", { name: texts.quest.check }));
		expect(await screen.findByText(texts.quest.wrong)).toBeTruthy();
		expect(await db.progress.count()).toBe(0);
	});

	it("AK-FALL-09: a station without fallback offers none", async () => {
		await setup();
		await openStation(/Hofkirche/);
		await screen.findByRole("heading", { name: "Hofkirche" });
		expect(
			screen.queryByRole("button", { name: texts.fallback.start }),
		).toBeNull();
	});

	it("is not offered once the station was visited", async () => {
		await setup({
			preload: async (db) => {
				await db.progress.put({
					routeId: "innsbruck-altstadt",
					stationId: "goldenes-dachl",
					state: "visited",
					method: "scan",
					confirmed: true,
				});
			},
		});
		await openStation(/Goldenes Dachl/);
		await screen.findByRole("heading", { name: "Goldenes Dachl" });
		expect(
			screen.queryByRole("button", { name: texts.fallback.start }),
		).toBeNull();
	});

	it("is not offered for a blocked station", async () => {
		await setup({
			server: (s) =>
				(s.bundle.stationStates.annasaeule = {
					status: "blocked",
					reason: null,
				}),
		});
		await openStation(/Annasäule/);
		await screen.findByRole("heading", { name: "Annasäule" });
		expect(
			screen.queryByRole("button", { name: texts.fallback.start }),
		).toBeNull();
	});
});

describe("report", () => {
	it("AK-SAFE-03: 'unsafe' is one tap away on the station view and queues a report", async () => {
		const { db } = await setup({ server: (s) => (s.hangSync = true) });
		await openStation(/Annasäule/);
		fireEvent.click(
			await screen.findByRole("button", { name: texts.report.unsafe }),
		);

		expect(await screen.findByText(texts.report.thanks)).toBeTruthy();
		const events = (await db.outbox.toArray()).map((e) => e.event);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			type: "report",
			stationId: "annasaeule",
			kind: "unsafe",
		});
	});

	it("reporting twice says it was already sent", async () => {
		await setup({ server: (s) => (s.hangSync = true) });
		await openStation(/Annasäule/);
		const button = await screen.findByRole("button", {
			name: texts.report.unsafe,
		});
		fireEvent.click(button);
		await screen.findByText(texts.report.thanks);
		fireEvent.click(button);
		expect(await screen.findByText(texts.report.alreadySent)).toBeTruthy();
	});

	it("another problem can be described with a short note", async () => {
		const { db } = await setup({ server: (s) => (s.hangSync = true) });
		await openStation(/Annasäule/);
		fireEvent.click(
			await screen.findByRole("button", { name: texts.report.other }),
		);
		fireEvent.click(
			await screen.findByLabelText(texts.report.kinds.code_missing),
		);
		fireEvent.change(screen.getByLabelText(texts.report.noteLabel), {
			target: { value: "Aufkleber ist ab" },
		});
		fireEvent.click(screen.getByRole("button", { name: texts.report.send }));

		expect(await screen.findByText(texts.report.thanks)).toBeTruthy();
		expect((await db.outbox.toArray())[0]?.event).toMatchObject({
			type: "report",
			kind: "code_missing",
			note: "Aufkleber ist ab",
		});
	});

	it("AK-REP-07: the note field is limited to 200 characters", async () => {
		await setup();
		await openStation(/Annasäule/);
		fireEvent.click(
			await screen.findByRole("button", { name: texts.report.other }),
		);
		const note = (await screen.findByLabelText(
			texts.report.noteLabel,
		)) as HTMLTextAreaElement;
		expect(note.maxLength).toBe(200);
	});

	it("a rejected report (rate limit) is shown to the player", async () => {
		await setup({
			server: (s) => s.rejectType.set("report", "rate_limited"),
		});
		await openStation(/Annasäule/);
		fireEvent.click(
			await screen.findByRole("button", { name: texts.report.unsafe }),
		);
		const expected = texts.sync.issue(
			"Annasäule",
			texts.sync.reasons.rate_limited,
		);
		expect(await screen.findByText(expected)).toBeTruthy();
	});
});

describe("badge", () => {
	async function completeAll(db: Db) {
		const bundle = bundleFixture();
		for (const [id, answer] of [
			["goldenes-dachl", "a"],
			["annasaeule", "1706"],
			["hofkirche", "Universitätsstraße"],
		] as const) {
			await processScan(db, bundle, qrUrl(tokenFor(id)));
			await answerQuest(db, bundle, id, answer);
		}
	}

	it("AK-BADGE-04: shows a provisional badge offline and confirms it after the sync", async () => {
		const { server } = await setup({
			server: (s) => (s.failNext = 100),
			preload: completeAll,
		});

		expect(await screen.findByText(texts.badge.provisional)).toBeTruthy();
		expect(screen.getByText("Altstadt-Entdecker")).toBeTruthy();
		expect(screen.queryByText(texts.badge.confirmed)).toBeNull();

		server.failNext = 0;
		window.dispatchEvent(new Event("online"));
		expect(await screen.findByText(texts.badge.confirmed)).toBeTruthy();
		expect(screen.queryByText(texts.badge.provisional)).toBeNull();
	});

	it("shows no badge while the route is incomplete", async () => {
		await setup();
		await screen.findByRole("button", { name: /Goldenes Dachl/ });
		expect(screen.queryByText(texts.badge.provisional)).toBeNull();
		expect(screen.queryByText(texts.badge.confirmed)).toBeNull();
	});
});

describe("delete my data", () => {
	const registeredScan = async (db: Db) => {
		await processScan(db, bundleFixture(), qrUrl(tokenFor("goldenes-dachl")));
	};

	it("AK-PROF-03: asks for confirmation, deletes everything and starts over", async () => {
		const { db, server } = await setup({ preload: registeredScan });
		expect(await screen.findByText(texts.xp.summary(10, false))).toBeTruthy(); // synced, so registered
		const before = (await db.profile.get("me"))?.playerId;

		fireEvent.click(screen.getByRole("button", { name: texts.account.delete }));
		expect(await screen.findByText(texts.account.confirmText)).toBeTruthy();
		expect(server.calls.some((c) => c.method === "DELETE")).toBe(false);
		fireEvent.click(
			screen.getByRole("button", { name: texts.account.confirm }),
		);

		expect(await screen.findByText(texts.safety.title)).toBeTruthy();
		expect(
			server.calls.some(
				(c) => c.method === "DELETE" && c.url === "/api/players/me",
			),
		).toBe(true);
		expect(await db.progress.count()).toBe(0);
		await waitFor(async () =>
			expect((await db.profile.get("me"))?.playerId).not.toBe(before),
		);
	});

	it("can be cancelled without any effect", async () => {
		const { db, server } = await setup({ preload: registeredScan });
		await screen.findByText(texts.xp.summary(10, false));
		fireEvent.click(screen.getByRole("button", { name: texts.account.delete }));
		fireEvent.click(
			await screen.findByRole("button", { name: texts.account.cancel }),
		);
		expect(screen.queryByText(texts.account.confirmText)).toBeNull();
		expect(server.calls.some((c) => c.method === "DELETE")).toBe(false);
		expect(await db.progress.count()).toBe(1);
	});

	it("tells the player to get online when the server cannot be reached and keeps the data", async () => {
		const { db } = await setup({
			preload: registeredScan,
			server: (s) => (s.deleteFails = true),
		});
		await screen.findByText(texts.xp.summary(10, false));

		fireEvent.click(screen.getByRole("button", { name: texts.account.delete }));
		fireEvent.click(
			await screen.findByRole("button", { name: texts.account.confirm }),
		);

		expect(await screen.findByText(texts.account.offline)).toBeTruthy();
		expect(screen.queryByText(texts.safety.title)).toBeNull();
		expect(await db.progress.count()).toBe(1);
		expect(await db.profile.count()).toBe(1);
	});
});

describe("safety wording (AK-SAFE-02)", () => {
	it("uses no streak, ranking or time-pressure wording anywhere", () => {
		const forbidden =
			/serie|streak|rangliste|bestzeit|countdown|zeitlimit|schnellste|beeil/i;
		const strings: string[] = [];
		const walk = (value: unknown) => {
			if (typeof value === "string") strings.push(value);
			else if (typeof value === "function")
				strings.push(String(value(1, true)));
			else if (Array.isArray(value)) value.forEach(walk);
			else if (value && typeof value === "object")
				Object.values(value).forEach(walk);
		};
		walk(texts);
		expect(strings.length).toBeGreaterThan(50);
		expect(strings.filter((s) => forbidden.test(s))).toEqual([]);
	});
});
