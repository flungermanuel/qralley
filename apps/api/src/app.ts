import { createHash } from "node:crypto";
import type { Writable } from "node:stream";
import rateLimit from "@fastify/rate-limit";
import { base64urlDecode, syncRequestSchema } from "@qurally/shared";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "./db/client";
import { players } from "./db/schema";
import { authenticate, hashesEqual, hashSecret } from "./domain/auth";
import { getLatestRoute, getStationStates } from "./domain/route-store";
import { syncPlayer } from "./domain/sync";
import type { SigningKeys } from "./domain/token";

export interface AppOptions {
	db: Db;
	/** QR signing keys (see parseSigningKeys). Without keys every scan is rejected. */
	signingKeys?: SigningKeys;
	/** Log destination; defaults to stdout. Tests use it to inspect log content. */
	logStream?: Writable;
	/** Overrides LOG_LEVEL. */
	logLevel?: string;
	/** Requests per minute and client. */
	rateLimit?: { playersPerMinute?: number; globalPerMinute?: number };
}

const MIN_SECRET_BYTES = 32;
const DEFAULT_PLAYERS_PER_MINUTE = 20;
const DEFAULT_GLOBAL_PER_MINUTE = 300;

const slugParam = z.object({ id: z.string().regex(/^[a-z0-9-]+$/) });

const registerBody = z.strictObject({
	playerId: z.uuid(),
	secret: z
		.string()
		.refine((s) => (base64urlDecode(s)?.length ?? 0) >= MIN_SECRET_BYTES),
});

export function buildApp({
	db,
	signingKeys = new Map(),
	logStream,
	logLevel,
	rateLimit: limits,
}: AppOptions): FastifyInstance {
	const app = Fastify({
		bodyLimit: 64 * 1024,
		logger: {
			level: logLevel ?? process.env.LOG_LEVEL ?? "info",
			...(logStream ? { stream: logStream } : {}),
			// Privacy (SPEC §10.2): no IPs, no headers, no query strings, no bodies.
			serializers: {
				req: (req: { method?: string; url?: string }) => ({
					method: req.method,
					url: req.url?.split("?")[0],
				}),
				res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
			},
		},
	});

	app.setErrorHandler((error: FastifyError, _req, reply) => {
		const status =
			typeof error.statusCode === "number" ? error.statusCode : 500;
		if (status === 429) return reply.code(429).send({ error: "rate_limited" });
		if (status === 413)
			return reply.code(413).send({ error: "payload_too_large" });
		if (status >= 400 && status < 500)
			return reply.code(400).send({ error: "invalid_request" });
		// Never log the message: database errors carry the SQL and its bound parameters
		// (player ids, secret hashes, report notes). Name and SQLSTATE are enough to find the cause.
		// Drizzle wraps driver errors: the PostgreSQL SQLSTATE sits in `cause.code`.
		const cause = (error as { cause?: { code?: unknown } }).cause;
		const code = [(error as { code?: unknown }).code, cause?.code].find(
			(c): c is string => typeof c === "string" && /^[0-9A-Z]{5}$/.test(c),
		);
		app.log.error(
			{
				err: {
					name: error.name,
					...(code ? { code } : {}),
				},
			},
			"unhandled error",
		);
		return reply.code(500).send({ error: "internal_error" });
	});

	// Counters live in memory only; nothing about clients is persisted.
	app.register(rateLimit, {
		global: true,
		max: limits?.globalPerMinute ?? DEFAULT_GLOBAL_PER_MINUTE,
		timeWindow: "1 minute",
		errorResponseBuilder: () => ({ statusCode: 429, error: "rate_limited" }),
	});

	// Routes are registered in a plugin so they are loaded after the rate limiter.
	app.register(async (api) => {
		api.get("/api/health", async () => ({ status: "ok" }));

		api.get("/api/routes/:id", async (req, reply) => {
			const params = slugParam.safeParse(req.params);
			if (!params.success)
				return reply.code(400).send({ error: "invalid_request" });

			const latest = await getLatestRoute(db, params.data.id);
			if (!latest) return reply.code(404).send({ error: "not_found" });
			const stationStates = await getStationStates(db, latest.route);

			const etag = `"${createHash("sha256")
				.update(latest.contentHash)
				.update(JSON.stringify(stationStates))
				.digest("hex")
				.slice(0, 32)}"`;
			reply.header("etag", etag).header("cache-control", "no-cache");
			if (req.headers["if-none-match"] === etag) return reply.code(304).send();

			return {
				route: latest.route,
				stationStates,
				bundleVersion: latest.contentHash,
				serverTime: Date.now(),
			};
		});

		api.post(
			"/api/players",
			{
				config: {
					rateLimit: {
						max: limits?.playersPerMinute ?? DEFAULT_PLAYERS_PER_MINUTE,
						timeWindow: "1 minute",
					},
				},
			},
			async (req, reply) => {
				const body = registerBody.safeParse(req.body);
				if (!body.success)
					return reply.code(400).send({ error: "invalid_request" });
				const { playerId, secret } = body.data;
				const secretHash = hashSecret(secret);

				const inserted = await db
					.insert(players)
					.values({ id: playerId, secretHash })
					.onConflictDoNothing()
					.returning({ id: players.id });
				if (inserted.length > 0) return reply.code(201).send({ created: true });

				const [existing] = await db
					.select({ secretHash: players.secretHash })
					.from(players)
					.where(eq(players.id, playerId))
					.limit(1);
				if (existing && hashesEqual(existing.secretHash, secretHash)) {
					return reply.code(200).send({ created: false });
				}
				return reply.code(409).send({ error: "conflict" });
			},
		);

		api.delete("/api/players/me", async (req, reply) => {
			const playerId = await authenticate(db, req.headers.authorization);
			if (!playerId) return reply.code(401).send({ error: "unauthorized" });
			// Cascades to progress, badges and sync events; reports keep existing, unlinked.
			await db.delete(players).where(eq(players.id, playerId));
			return reply.code(204).send();
		});

		api.post("/api/sync", async (req, reply) => {
			const playerId = await authenticate(db, req.headers.authorization);
			if (!playerId) return reply.code(401).send({ error: "unauthorized" });

			const body = syncRequestSchema.safeParse(req.body);
			if (!body.success)
				return reply.code(400).send({ error: "invalid_request" });

			const response = await syncPlayer(
				db,
				signingKeys,
				playerId,
				body.data.events,
			);
			if (!response) return reply.code(401).send({ error: "unauthorized" });
			return response;
		});
	});

	return app;
}
