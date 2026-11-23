import { z } from "zod";
import { slugSchema } from "./route-schema";

/** Sync protocol (docs/SPEC.md §7.1). Shared by client outbox and server. */

export const MAX_SYNC_BATCH = 50;
export const MAX_REPORT_NOTE_LENGTH = 200;

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
	note: z.string().max(MAX_REPORT_NOTE_LENGTH).optional(),
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
