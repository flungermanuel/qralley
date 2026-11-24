import { z } from "zod";
import { slugSchema } from "./route-schema";

/** Sync protocol (docs/SPEC.md §7.1). Shared by client outbox and server. */

export const MAX_SYNC_BATCH = 50;
export const MAX_REPORT_NOTE_LENGTH = 200;

/** True for NUL and other C0 control characters and DEL; tab (9), line feed (10) and carriage return (13) are allowed. */
function hasControlCharacters(text: string): boolean {
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if (
			code <= 8 ||
			code === 11 ||
			code === 12 ||
			(code >= 14 && code <= 31) ||
			code === 127
		)
			return true;
	}
	return false;
}

export const REPORT_KINDS = [
	"code_damaged",
	"code_missing",
	"unsafe",
	"other",
] as const;

const base = {
	/** Client-generated idempotency key. */
	id: z.uuid(),
	routeId: slugSchema,
	/** Informational only; the server never uses it for logic. */
	clientTs: z.number().int().optional(),
};

const answer = z.string().max(200);

export const scanEventSchema = z.strictObject({
	...base,
	type: z.literal("scan"),
	token: z.string().min(1).max(200),
});

export const questAnswerEventSchema = z.strictObject({
	...base,
	type: z.literal("quest_answer"),
	stationId: slugSchema,
	answer,
});

export const fallbackCheckinEventSchema = z.strictObject({
	...base,
	type: z.literal("fallback_checkin"),
	stationId: slugSchema,
	/** Used for the radius check only; never stored by the server. */
	position: z.strictObject({
		lat: z.number().min(-90).max(90),
		lng: z.number().min(-180).max(180),
		accuracyM: z.number().min(0).max(100_000),
	}),
	answer,
});

export const reportEventSchema = z.strictObject({
	...base,
	type: z.literal("report"),
	stationId: slugSchema,
	kind: z.enum(REPORT_KINDS),
	note: z
		.string()
		.max(MAX_REPORT_NOTE_LENGTH)
		// No NUL or other control characters (PostgreSQL rejects NUL); tab and line break are fine.
		.refine((s) => !hasControlCharacters(s), {
			message: "control characters are not allowed",
		})
		.optional(),
});

export const syncEventSchema = z.discriminatedUnion("type", [
	scanEventSchema,
	questAnswerEventSchema,
	fallbackCheckinEventSchema,
	reportEventSchema,
]);

/** Envelope: only checks batch size and that every event has an id; events are validated one by one. */
export const syncRequestSchema = z.strictObject({
	events: z.array(z.looseObject({ id: z.uuid() })).max(MAX_SYNC_BATCH),
});

export type SyncEvent = z.infer<typeof syncEventSchema>;

export const REJECTION_REASONS = [
	"malformed",
	"invalid_token",
	"unknown_key",
	"wrong_route",
	"unknown_route",
	"unknown_station",
	"station_blocked",
	"not_visited",
	"answer_incorrect",
	"too_far",
	"accuracy_too_low",
	"fallback_disabled",
	"rate_limited",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export interface SyncResult {
	id: string;
	status: "accepted" | "duplicate" | "rejected";
	reason?: string;
}

const progressStateSchema = z.object({
	state: z.enum(["visited", "completed"]),
	method: z.enum(["scan", "fallback"]),
});

/** Response of `POST /api/sync`. The client validates it before touching local data. */
export const syncResponseSchema = z.object({
	results: z.array(
		z.object({
			id: z.uuid(),
			status: z.enum(["accepted", "duplicate", "rejected"]),
			reason: z.string().optional(),
		}),
	),
	/** Authoritative server progress per route. */
	progress: z.record(
		z.string(),
		z.object({
			totalXp: z.number(),
			stations: z.record(z.string(), progressStateSchema),
			badges: z.array(z.string()),
			complete: z.boolean(),
		}),
	),
	stationStates: z.record(
		z.string(),
		z.record(
			z.string(),
			z.object({
				status: z.enum(["ok", "reported", "blocked"]),
				reason: z.string().nullable(),
			}),
		),
	),
	serverTime: z.number(),
});

export type SyncResponse = z.infer<typeof syncResponseSchema>;
