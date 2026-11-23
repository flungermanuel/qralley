import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { getOrCreateProfile } from "../src/data/profile";
import { loadRoute } from "../src/data/route";
import { texts } from "../src/texts";
import { bundleFixture, jsonResponse, offlineFetch, testDb } from "./helpers";

const onlineFetch =
	(bundle = bundleFixture()) =>
	async () =>
		jsonResponse(bundle, { etag: '"1"' });

function renderApp(
	db: ReturnType<typeof testDb>,
	fetchFn: typeof fetch,
	props: { updateAvailable?: boolean; onUpdate?: () => void } = {},
) {
	return render(
		<App
			db={db}
			fetchFn={fetchFn}
			updateAvailable={props.updateAvailable ?? false}
			onUpdate={props.onUpdate ?? (() => {})}
		/>,
	);
}

async function acknowledged(db: ReturnType<typeof testDb>) {
	await getOrCreateProfile(db);
	await db.profile.update("me", { safetyAcknowledgedAt: 1 });
}

describe("safety notice", () => {
	it("AK-SAFE-01: is shown before the route and hides the stations", async () => {
		const db = testDb();
		renderApp(db, onlineFetch());
		expect(await screen.findByText(texts.safety.title)).toBeTruthy();
		expect(screen.queryByText("Goldenes Dachl")).toBeNull();
	});

	it("AK-SAFE-01: confirming it opens the route and is remembered", async () => {
		const db = testDb();
		const first = renderApp(db, onlineFetch());
		fireEvent.click(
			await screen.findByRole("button", { name: texts.safety.confirm }),
		);
		expect(await screen.findByText("Goldenes Dachl")).toBeTruthy();
		expect((await db.profile.get("me"))?.safetyAcknowledgedAt).toEqual(
			expect.any(Number),
		);

		first.unmount();
		renderApp(db, onlineFetch());
		expect(await screen.findByText("Goldenes Dachl")).toBeTruthy();
		expect(screen.queryByText(texts.safety.title)).toBeNull();
	});

	it("mentions traffic and not looking at the phone while walking", () => {
		const text = texts.safety.items.join(" ").toLowerCase();
		expect(text).toContain("verkehr");
		expect(text).toContain("handy");
	});
});

describe("route screen", () => {
	it("lists all stations with their hints", async () => {
		const db = testDb();
		await acknowledged(db);
		renderApp(db, onlineFetch());
		for (const title of ["Goldenes Dachl", "Annasäule", "Hofkirche"]) {
			expect(await screen.findByText(title)).toBeTruthy();
		}
		expect(
			screen.getByText(/Am Ende der Herzog-Friedrich-Straße/),
		).toBeTruthy();
	});

	it("AK-LOAD-02: shows the cached route with an offline note when the network is gone", async () => {
		const db = testDb();
		await acknowledged(db);
		await loadRoute(db, "innsbruck-altstadt", onlineFetch());
		renderApp(db, offlineFetch);
		expect(await screen.findByText("Goldenes Dachl")).toBeTruthy();
		expect(screen.getByText(texts.route.offlineCached)).toBeTruthy();
	});

	it("AK-LOAD-03: explains that the route was never loaded, without crashing", async () => {
		const db = testDb();
		await acknowledged(db);
		renderApp(db, offlineFetch);
		expect(await screen.findByText(texts.route.notLoaded)).toBeTruthy();
	});

	it("AK-LOAD-05: marks blocked stations as not playable and reported ones with a hint", async () => {
		const db = testDb();
		await acknowledged(db);
		const bundle = bundleFixture();
		bundle.stationStates.annasaeule = {
			status: "blocked",
			reason: "unsafe reports",
		};
		bundle.stationStates.hofkirche = {
			status: "reported",
			reason: "report:code_damaged",
		};
		renderApp(db, onlineFetch(bundle));

		expect(await screen.findByText(texts.status.blocked)).toBeTruthy();
		expect(screen.getByText(texts.status.blockedHint)).toBeTruthy();
		expect(screen.getByText(texts.status.reported)).toBeTruthy();
		expect(screen.getByText(texts.status.reportedHint)).toBeTruthy();
	});

	it("AK-PROF-01: shows no login or registration form", async () => {
		const db = testDb();
		const { container } = renderApp(db, onlineFetch());
		await screen.findByText(texts.safety.title);
		expect(container.querySelectorAll("input, textarea")).toHaveLength(0);
	});

	it("refreshes the route when the device comes back online", async () => {
		const db = testDb();
		await acknowledged(db);
		await loadRoute(db, "innsbruck-altstadt", onlineFetch());

		const blocked = bundleFixture();
		blocked.stationStates.annasaeule = { status: "blocked", reason: null };
		const fetchFn = vi.fn<typeof fetch>(offlineFetch);
		renderApp(db, fetchFn);
		expect(await screen.findByText(texts.route.offlineCached)).toBeTruthy();

		fetchFn.mockImplementation(async () =>
			jsonResponse(blocked, { etag: '"2"' }),
		);
		window.dispatchEvent(new Event("online"));
		expect(await screen.findByText(texts.status.blocked)).toBeTruthy();
		expect(screen.queryByText(texts.route.offlineCached)).toBeNull();
	});
});

describe("update banner", () => {
	it("AK-PWA-02: is hidden when no update is available", async () => {
		const db = testDb();
		await acknowledged(db);
		renderApp(db, onlineFetch());
		await screen.findByText("Goldenes Dachl");
		expect(screen.queryByText(texts.update.message)).toBeNull();
	});

	it("AK-PWA-02: offers a reload and never reloads by itself", async () => {
		const db = testDb();
		await acknowledged(db);
		const onUpdate = vi.fn();
		renderApp(db, onlineFetch(), { updateAvailable: true, onUpdate });

		expect(await screen.findByText(texts.update.message)).toBeTruthy();
		expect(onUpdate).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: texts.update.reload }));
		expect(onUpdate).toHaveBeenCalledTimes(1);
	});
});
