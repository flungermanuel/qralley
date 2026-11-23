import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { players } from "../db/schema";

const BEARER = /^Bearer ([0-9a-fA-F-]{36})\.([A-Za-z0-9_-]{43,})$/;

export function hashSecret(secret: string): string {
	return createHash("sha256").update(secret).digest("hex");
}

export function hashesEqual(a: string, b: string): boolean {
	const x = Buffer.from(a, "hex");
	const y = Buffer.from(b, "hex");
	return x.length === y.length && timingSafeEqual(x, y);
}

/** Returns the player id for a valid `Bearer <playerId>.<secret>` header, else null. */
export async function authenticate(
	db: Db,
	header: string | undefined,
): Promise<string | null> {
	const match = header ? BEARER.exec(header) : null;
	const [, playerId, secret] = match ?? [];
	if (!playerId || !secret) return null;

	const [player] = await db
		.select({ id: players.id, secretHash: players.secretHash })
		.from(players)
		.where(eq(players.id, playerId.toLowerCase()))
		.limit(1);
	if (!player || !hashesEqual(player.secretHash, hashSecret(secret)))
		return null;

	await db
		.update(players)
		.set({ lastSeenAt: new Date() })
		.where(eq(players.id, player.id));
	return player.id;
}
