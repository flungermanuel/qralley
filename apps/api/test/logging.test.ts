import { Writable } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { bearer, newCredentials, openTestDb, resetDb } from "./helpers";

const { db, close } = openTestDb();
afterAll(close);
beforeEach(() => resetDb(db));

describe("request logging", () => {
	let output = "";
	let app: ReturnType<typeof buildApp>;

	beforeAll(async () => {
		const stream = new Writable({
			write(chunk, _enc, cb) {
				output += chunk.toString();
				cb();
			},
		});
		app = buildApp({ db, logStream: stream, logLevel: "info" });
		await app.ready();
	});
	afterAll(() => app.close());

	it("AK-PRIV-01: logs neither secrets, IPs, headers nor query strings", async () => {
		const c = newCredentials();
		await app.inject({
			method: "POST",
			url: "/api/players",
			payload: c,
			remoteAddress: "203.0.113.7",
		});
		await app.inject({
			method: "DELETE",
			url: "/api/players/me",
			headers: bearer(c),
		});
		await app.inject({
			method: "GET",
			url: "/api/health?lat=47.1234&lng=11.5678",
		});

		expect(output).toContain("/api/players");
		expect(output).not.toContain(c.secret);
		expect(output).not.toContain(c.playerId);
		expect(output).not.toContain("203.0.113.7");
		expect(output).not.toContain("127.0.0.1");
		expect(output.toLowerCase()).not.toContain("authorization");
		expect(output).not.toContain("47.1234");
		expect(output).not.toContain("lat=");
	});
});
