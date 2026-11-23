import { base64urlEncode } from "@qurally/shared";
import type { Profile, QurallyDb } from "./db";

function newProfile(): Profile {
	return {
		id: "me",
		playerId: crypto.randomUUID(),
		secret: base64urlEncode(crypto.getRandomValues(new Uint8Array(32))),
		registered: false,
		safetyAcknowledgedAt: null,
		createdAt: Date.now(),
	};
}

/** Returns the local profile, creating it on first use. No user input involved. */
export function getOrCreateProfile(db: QurallyDb): Promise<Profile> {
	return db.transaction("rw", db.profile, async () => {
		const existing = await db.profile.get("me");
		if (existing) return existing;
		const created = newProfile();
		await db.profile.add(created);
		return created;
	});
}

export async function acknowledgeSafety(
	db: QurallyDb,
	at = Date.now(),
): Promise<void> {
	await db.profile.update("me", { safetyAcknowledgedAt: at });
}
