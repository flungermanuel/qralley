import type { QurallyDb } from "./db";

const deleting = new WeakSet<QurallyDb>();

/** While "delete my data" runs, nothing may sync, register or write server progress back. */
export const beginDeletion = (db: QurallyDb): void => void deleting.add(db);
export const endDeletion = (db: QurallyDb): void => void deleting.delete(db);
export const isDeleting = (db: QurallyDb): boolean => deleting.has(db);
