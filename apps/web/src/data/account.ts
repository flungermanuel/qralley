import type { QurallyDb } from "./db";
import { DEFAULT_TIMEOUT_MS, fetchWithTimeout, type HttpOptions } from "./http";
import { beginDeletion, endDeletion } from "./lifecycle";
import { waitForSync } from "./sync";

/** deleted: server account and local data are gone; offline/error: nothing was deleted locally. */
export type DeleteResult = { status: "deleted" | "offline" | "error" };

/**
 * "Delete my data": removes the server account (progress, badges, events) and then
 * every local table. Without a confirmed answer nothing is deleted locally, so the
 * player keeps the credentials needed to repeat it. Reports stay on the server, unlinked.
 *
 * A running sync is awaited first and no new one may start meanwhile; otherwise it could
 * re-register the deleted player or write old server progress into the fresh profile.
 * The request itself may reach the server even if its answer is lost, so `deletionRequested`
 * stays set (and syncing stays paused) until a retry succeeds or the player cancels.
 */
export async function deleteAllData(
	db: QurallyDb,
	fetchFn: typeof fetch = (...args) => fetch(...args),
	options: HttpOptions = {},
): Promise<DeleteResult> {
	beginDeletion(db);
	try {
		await waitForSync(db);
		const profile = await db.profile.get("me");

		if (profile?.registered) {
			await db.profile.update("me", { deletionRequested: true });
			let res: Response;
			try {
				res = await fetchWithTimeout(
					fetchFn,
					"/api/players/me",
					{
						method: "DELETE",
						headers: {
							authorization: `Bearer ${profile.playerId}.${profile.secret}`,
						},
					},
					options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
				);
			} catch {
				return { status: "offline" };
			}
			// 401: the server does not know us (any more), so there is nothing left to delete there.
			if (res.status !== 204 && res.status !== 401) return { status: "error" };
		}

		await db.transaction(
			"rw",
			[
				db.profile,
				db.routeBundles,
				db.progress,
				db.outbox,
				db.issues,
				db.badges,
			],
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
	} finally {
		endDeletion(db);
	}
}

/** The player gives up a deletion that could not be confirmed; syncing resumes. */
export async function cancelDeletion(db: QurallyDb): Promise<void> {
	await db.profile.update("me", { deletionRequested: false });
}
