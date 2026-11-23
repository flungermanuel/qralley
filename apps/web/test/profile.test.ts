import { base64urlDecode } from "@qurally/shared";
import { describe, expect, it } from "vitest";
import { acknowledgeSafety, getOrCreateProfile } from "../src/data/profile";
import { testDb } from "./helpers";

describe("local profile", () => {
	it("AK-PROF-01: creates an anonymous profile without any input", async () => {
		const db = testDb();
		const profile = await getOrCreateProfile(db);
		expect(profile.playerId).toMatch(/^[0-9a-f-]{36}$/);
		expect(base64urlDecode(profile.secret)?.length).toBe(32);
		expect(profile.registered).toBe(false);
		expect(profile.safetyAcknowledgedAt).toBeNull();
	});

	it("AK-PROF-01: stores no personal fields", async () => {
		const db = testDb();
		const profile = await getOrCreateProfile(db);
		expect(Object.keys(profile).sort()).toEqual(
			[
				"createdAt",
				"id",
				"playerId",
				"registered",
				"safetyAcknowledgedAt",
				"secret",
			].sort(),
		);
	});

	it("returns the same profile on every call", async () => {
		const db = testDb();
		const a = await getOrCreateProfile(db);
		const b = await getOrCreateProfile(db);
		expect(b).toEqual(a);
		expect(await db.profile.count()).toBe(1);
	});

	it("concurrent first calls still create exactly one profile", async () => {
		const db = testDb();
		const [a, b] = await Promise.all([
			getOrCreateProfile(db),
			getOrCreateProfile(db),
		]);
		expect(a.playerId).toBe(b.playerId);
		expect(await db.profile.count()).toBe(1);
	});

	it("different devices get different identities", async () => {
		const a = await getOrCreateProfile(testDb());
		const b = await getOrCreateProfile(testDb());
		expect(a.playerId).not.toBe(b.playerId);
		expect(a.secret).not.toBe(b.secret);
	});

	it("AK-SAFE-01: remembers the safety acknowledgement", async () => {
		const db = testDb();
		await getOrCreateProfile(db);
		await acknowledgeSafety(db, 1234);
		expect((await getOrCreateProfile(db)).safetyAcknowledgedAt).toBe(1234);
	});
});
