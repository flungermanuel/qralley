import type { QurallyDb } from "./db";

/** Reference counted, so overlapping deletions cannot clear each other's flag. */
const deleting = new WeakMap<QurallyDb, number>();

/** While "delete my data" runs, nothing may sync, register or write server progress back. */
export function beginDeletion(db: QurallyDb): void {
	deleting.set(db, (deleting.get(db) ?? 0) + 1);
}

export function endDeletion(db: QurallyDb): void {
	const left = (deleting.get(db) ?? 0) - 1;
	if (left > 0) deleting.set(db, left);
	else deleting.delete(db);
}

export const isDeleting = (db: QurallyDb): boolean =>
	(deleting.get(db) ?? 0) > 0;
