import { createHash } from "node:crypto";
import type { Writable } from "node:stream";
import { base64urlDecode } from "@qurally/shared";
import { asc, desc, eq } from "drizzle-orm";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "./db/client";
import { players, routeVersions, stationState } from "./db/schema";
import { authenticate, hashesEqual, hashSecret } from "./domain/auth";

export interface AppOptions {
	db: Db;
	/** Log destination; defaults to stdout. Tests use it to inspect log content. */
	logStream?: Writable;
	/** Overrides LOG_LEVEL. */
	logLevel?: string;
}

const MIN_SECRET_BYTES = 32;

const slugParam = z.object({ id: z.string().regex(/^[a-z0-9-]+$/) });

const registerBody = z.strictObject({
	playerId: z.uuid(),
	secret: z
		.string()
		.refine((s) => (base64urlDecode(s)?.length ?? 0) >= MIN_SECRET_BYTES),
});

export function buildApp({
	db,
	logStream,
	logLevel,
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
		if (status === 413)
			return reply.code(413).send({ error: "payload_too_large" });
		if (status >= 400 && status < 500)
			return reply.code(400).send({ error: "invalid_request" });
		app.log.error({ err: { message: error.message } }, "unhandled error");
		return reply.code(500).send({ error: "internal_error" });
	});

	app.get("/api/health", async () => ({ status: "ok" }));

	app.get("/api/routes/:id", async (req, reply) => {
		const params = slugParam.safeParse(req.params);
		if (!params.success)
			return reply.code(400).send({ error: "invalid_request" });
		const routeId = params.data.id;

		const [latest] = await db
			.select()
			.from(routeVersions)
			.where(eq(routeVersions.routeId, routeId))
			.orderBy(desc(routeVersions.version))
			.limit(1);
		if (!latest) return reply.code(404).send({ error: "not_found" });

		const route = latest.content as { stations: { id: string }[] };
		const stationIds = new Set(route.stations.map((s) => s.id));
		const rows = await db
			.select()
			.from(stationState)
			.where(eq(stationState.routeId, routeId))
			.orderBy(asc(stationState.stationId));
		const stationStates = Object.fromEntries(
			rows
				.filter((r) => stationIds.has(r.stationId))
				.map((r) => [
					r.stationId,
					{ status: r.status, reason: r.statusReason },
				]),
		);

		const etag = `"${createHash("sha256")
			.update(latest.contentHash)
			.update(JSON.stringify(stationStates))
			.digest("hex")
			.slice(0, 32)}"`;
		reply.header("etag", etag).header("cache-control", "no-cache");
		if (req.headers["if-none-match"] === etag) return reply.code(304).send();

		return {
			route: latest.content,
			stationStates,
			bundleVersion: latest.contentHash,
			serverTime: Date.now(),
		};
	});

	app.post("/api/players", async (req, reply) => {
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
	});

	app.delete("/api/players/me", async (req, reply) => {
		const playerId = await authenticate(db, req.headers.authorization);
		if (!playerId) return reply.code(401).send({ error: "unauthorized" });
		// Cascades to progress, badges and sync events; reports keep existing, unlinked.
		await db.delete(players).where(eq(players.id, playerId));
		return reply.code(204).send();
	});

	return app;
}
