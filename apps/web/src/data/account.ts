import type { QurallyDb } from "./db";

/** deleted: server account and local data are gone; offline/error: nothing was deleted locally. */
export type DeleteResult = { status: "deleted" | "offline" | "error" };

/**
 * "Delete my data": removes the server account (progress, badges, events) and then
 * every local table. Without a connection nothing is deleted locally, so the player
 * keeps the credentials needed to repeat it. Reports stay on the server, unlinked.
 */
export async function deleteAllData(
	db: QurallyDb,
	fetchFn: typeof fetch = (...args) => fetch(...args),
): Promise<DeleteResult> {
	const profile = await db.profile.get("me");

	if (profile?.registered) {
		let res: Response;
		try {
			res = await fetchFn("/api/players/me", {
				method: "DELETE",
				headers: {
					authorization: `Bearer ${profile.playerId}.${profile.secret}`,
				},
			});
		} catch {
			return { status: "offline" };
		}
		// 401: the server does not know us (any more), so there is nothing left to delete there.
		if (res.status !== 204 && res.status !== 401) return { status: "error" };
	}

	await db.transaction(
		"rw",
		[db.profile, db.routeBundles, db.progress, db.outbox, db.issues, db.badges],
		async () => {
			await Promise.all([
				db.profile.clear(),
				db.routeBundles.clear(),
				db.progress.clear(),
				db.outbox.clear(),
				db.issues.clear(),
				db.badges.clear(),
			]);
		},
	);
	return { status: "deleted" };
}
