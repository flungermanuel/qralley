import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { stationState } from "../src/db/schema";
import {
	openTestDb,
	publishExample,
	resetDb,
	validExampleRoute,
} from "./helpers";

const { db, close } = openTestDb();
let app: FastifyInstance;

beforeAll(async () => {
	app = buildApp({ db });
	await app.ready();
});
afterAll(async () => {
	await app.close();
	await close();
});
beforeEach(() => resetDb(db));

const get = (url: string, headers: Record<string, string> = {}) =>
	app.inject({ method: "GET", url, headers });

describe("GET /api/health", () => {
	it("answers ok", async () => {
		const res = await get("/api/health");
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ status: "ok" });
	});
});

describe("GET /api/routes/:id", () => {
	it("AK-LOAD-01: returns the bundle with route, station states and version", async () => {
		await publishExample(db);
		const res = await get("/api/routes/innsbruck-altstadt");
		expect(res.statusCode).toBe(200);
		const bundle = res.json();
		expect(bundle.route).toEqual(validExampleRoute());
		expect(Object.keys(bundle.stationStates).sort()).toEqual(
			validExampleRoute()
				.stations.map((s) => s.id)
				.sort(),
		);
		expect(bundle.stationStates["goldenes-dachl"]).toEqual({
			status: "ok",
			reason: null,
		});
		expect(bundle.bundleVersion).toMatch(/^[0-9a-f]{64}$/);
		expect(typeof bundle.serverTime).toBe("number");
	});

	it("serves the highest published version", async () => {
		await publishExample(db);
		const v2 = { ...validExampleRoute(), version: 2, title: "Neuer Titel" };
		const { publishRoute } = await import("../src/domain/publish");
		await publishRoute(db, v2);
		const res = await get("/api/routes/innsbruck-altstadt");
		expect(res.json().route.version).toBe(2);
		expect(res.json().route.title).toBe("Neuer Titel");
	});

	it("supports conditional requests via ETag (304)", async () => {
		await publishExample(db);
		const first = await get("/api/routes/innsbruck-altstadt");
		const etag = first.headers.etag;
		expect(etag).toBeTruthy();
		const second = await get("/api/routes/innsbruck-altstadt", {
			"if-none-match": String(etag),
		});
		expect(second.statusCode).toBe(304);
		expect(second.body).toBe("");
	});

	it("AK-LOAD-05: reflects a blocked station and changes the ETag", async () => {
		await publishExample(db);
		const before = await get("/api/routes/innsbruck-altstadt");
		await db
			.update(stationState)
			.set({ status: "blocked", statusReason: "unsafe reports" })
			.where(eq(stationState.stationId, "annasaeule"));
		const after = await get("/api/routes/innsbruck-altstadt", {
			"if-none-match": String(before.headers.etag),
		});
		expect(after.statusCode).toBe(200);
		expect(after.headers.etag).not.toBe(before.headers.etag);
		expect(after.json().stationStates.annasaeule).toEqual({
			status: "blocked",
			reason: "unsafe reports",
		});
	});

	it("returns 404 for an unknown route", async () => {
		const res = await get("/api/routes/does-not-exist");
		expect(res.statusCode).toBe(404);
		expect(res.json()).toEqual({ error: "not_found" });
	});

	it("returns 400 for ids that are not slugs", async () => {
		for (const id of ["UPPER", "a%20b", "..%2F..%2Fetc", "a.b"]) {
			const res = await get(`/api/routes/${id}`);
			expect(res.statusCode, id).toBe(400);
		}
	});
});
