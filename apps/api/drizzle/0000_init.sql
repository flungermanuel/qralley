CREATE TABLE "badges_awarded" (
	"player_id" uuid NOT NULL,
	"route_id" text NOT NULL,
	"badge_id" text NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "badges_awarded_player_id_route_id_badge_id_pk" PRIMARY KEY("player_id","route_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY NOT NULL,
	"secret_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"player_id" uuid NOT NULL,
	"route_id" text NOT NULL,
	"station_id" text NOT NULL,
	"state" text NOT NULL,
	"method" text NOT NULL,
	"scan_xp" integer DEFAULT 0 NOT NULL,
	"quest_xp" integer DEFAULT 0 NOT NULL,
	"visited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "progress_player_id_route_id_station_id_pk" PRIMARY KEY("player_id","route_id","station_id"),
	CONSTRAINT "progress_state_check" CHECK ("progress"."state" in ('visited', 'completed')),
	CONSTRAINT "progress_method_check" CHECK ("progress"."method" in ('scan', 'fallback')),
	CONSTRAINT "progress_xp_check" CHECK ("progress"."scan_xp" >= 0 and "progress"."quest_xp" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid,
	"route_id" text NOT NULL,
	"station_id" text NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_kind_check" CHECK ("reports"."kind" in ('code_damaged', 'code_missing', 'unsafe', 'other')),
	CONSTRAINT "reports_status_check" CHECK ("reports"."status" in ('open', 'resolved')),
	CONSTRAINT "reports_note_length_check" CHECK (char_length("reports"."note") <= 200)
);
--> statement-breakpoint
CREATE TABLE "route_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"route_id" text NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_versions_route_id_version_unique" UNIQUE("route_id","version"),
	CONSTRAINT "route_versions_route_id_content_hash_unique" UNIQUE("route_id","content_hash")
);
--> statement-breakpoint
CREATE TABLE "station_state" (
	"route_id" text NOT NULL,
	"station_id" text NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_reason" text,
	CONSTRAINT "station_state_route_id_station_id_pk" PRIMARY KEY("route_id","station_id"),
	CONSTRAINT "station_state_status_check" CHECK ("station_state"."status" in ('ok', 'reported', 'blocked'))
);
--> statement-breakpoint
CREATE TABLE "sync_events" (
	"player_id" uuid NOT NULL,
	"client_event_id" uuid NOT NULL,
	"type" text NOT NULL,
	"result" text NOT NULL,
	"reason" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_events_player_id_client_event_id_pk" PRIMARY KEY("player_id","client_event_id"),
	CONSTRAINT "sync_events_result_check" CHECK ("sync_events"."result" in ('accepted', 'duplicate', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "badges_awarded" ADD CONSTRAINT "badges_awarded_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;