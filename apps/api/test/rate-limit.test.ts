import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { newCredentials, openTestDb, resetDb } from "./helpers";

const { db, close } = openTestDb();
afterAll(close);
beforeEach(() => resetDb(db));

describe("rate limits", () => {
	it("limits player registration per client", async () => {
		const app = buildApp({
			db,
			rateLimit: { playersPerMinute: 3, globalPerMinute: 1000 },
		});
		await app.ready();
		const codes: number[] = [];
		for (let i = 0; i < 5; i++) {
			const res = await app.inject({
				method: "POST",
				url: "/api/players",
				payload: newCredentials(),
			});
			codes.push(res.statusCode);
		}
		expect(codes).toEqual([201, 201, 201, 429, 429]);
		const limited = await app.inject({
			method: "POST",
			url: "/api/players",
			payload: newCredentials(),
		});
		expect(limited.json()).toEqual({ error: "rate_limited" });
		await app.close();
	});

	it("limits all endpoints globally", async () => {
		const app = buildApp({
			db,
			rateLimit: { playersPerMinute: 1000, globalPerMinute: 4 },
		});
		await app.ready();
		const codes: number[] = [];
		for (let i = 0; i < 6; i++) {
			codes.push(
				(await app.inject({ method: "GET", url: "/api/health" })).statusCode,
			);
		}
		expect(codes).toEqual([200, 200, 200, 200, 429, 429]);
		await app.close();
	});
});
