import { sql } from "drizzle-orm";
import {
	check,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

/** Data model: docs/SPEC.md §5. No names, e-mails, IPs or coordinates are stored. */

const now = () =>
	timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const routeVersions = pgTable(
	"route_versions",
	{
		id: serial("id").primaryKey(),
		routeId: text("route_id").notNull(),
		version: integer("version").notNull(),
		content: jsonb("content").notNull(),
		contentHash: text("content_hash").notNull(),
		publishedAt: timestamp("published_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		unique().on(t.routeId, t.version),
		unique().on(t.routeId, t.contentHash),
	],
);

export const stationState = pgTable(
	"station_state",
	{
		routeId: text("route_id").notNull(),
		stationId: text("station_id").notNull(),
		status: text("status").notNull().default("ok"),
		statusChangedAt: timestamp("status_changed_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		statusReason: text("status_reason"),
	},
	(t) => [
		primaryKey({ columns: [t.routeId, t.stationId] }),
		check(
			"station_state_status_check",
			sql`${t.status} in ('ok', 'reported', 'blocked')`,
		),
	],
);

export const players = pgTable("players", {
	id: uuid("id").primaryKey(),
	/** SHA-256 (hex) of the device secret; the secret itself is never stored. */
	secretHash: text("secret_hash").notNull(),
	createdAt: now(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const progress = pgTable(
	"progress",
	{
		playerId: uuid("player_id")
			.notNull()
			.references(() => players.id, { onDelete: "cascade" }),
		routeId: text("route_id").notNull(),
		stationId: text("station_id").notNull(),
		state: text("state").notNull(),
		method: text("method").notNull(),
		scanXp: integer("scan_xp").notNull().default(0),
		questXp: integer("quest_xp").notNull().default(0),
		visitedAt: timestamp("visited_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
	},
	(t) => [
		primaryKey({ columns: [t.playerId, t.routeId, t.stationId] }),
		check("progress_state_check", sql`${t.state} in ('visited', 'completed')`),
		check("progress_method_check", sql`${t.method} in ('scan', 'fallback')`),
		check("progress_xp_check", sql`${t.scanXp} >= 0 and ${t.questXp} >= 0`),
	],
);

export const badgesAwarded = pgTable(
	"badges_awarded",
	{
		playerId: uuid("player_id")
			.notNull()
			.references(() => players.id, { onDelete: "cascade" }),
		routeId: text("route_id").notNull(),
		badgeId: text("badge_id").notNull(),
		awardedAt: timestamp("awarded_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.playerId, t.routeId, t.badgeId] })],
);

export const syncEvents = pgTable(
	"sync_events",
	{
		playerId: uuid("player_id")
			.notNull()
			.references(() => players.id, { onDelete: "cascade" }),
		clientEventId: uuid("client_event_id").notNull(),
		type: text("type").notNull(),
		result: text("result").notNull(),
		reason: text("reason"),
		receivedAt: timestamp("received_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.playerId, t.clientEventId] }),
		check(
			"sync_events_result_check",
			sql`${t.result} in ('accepted', 'duplicate', 'rejected')`,
		),
	],
);

export const reports = pgTable(
	"reports",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		/** Set to NULL when the player deletes their data; the report itself stays. */
		playerId: uuid("player_id").references(() => players.id, {
			onDelete: "set null",
		}),
		routeId: text("route_id").notNull(),
		stationId: text("station_id").notNull(),
		kind: text("kind").notNull(),
		note: text("note"),
		status: text("status").notNull().default("open"),
		createdAt: now(),
	},
	(t) => [
		check(
			"reports_kind_check",
			sql`${t.kind} in ('code_damaged', 'code_missing', 'unsafe', 'other')`,
		),
		check("reports_status_check", sql`${t.status} in ('open', 'resolved')`),
		check("reports_note_length_check", sql`char_length(${t.note}) <= 200`),
	],
);
