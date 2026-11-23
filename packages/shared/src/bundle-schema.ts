import { z } from "zod";
import { routeSchema, slugSchema } from "./route-schema";

/** Response of `GET /api/routes/:id` (docs/SPEC.md §6.3). The client validates it before caching. */
export const routeBundleSchema = z.object({
	route: routeSchema,
	stationStates: z.record(
		slugSchema,
		z.object({
			status: z.enum(["ok", "reported", "blocked"]),
			reason: z.string().nullable(),
		}),
	),
	/** Content hash of the route version. */
	bundleVersion: z.string().min(1),
	serverTime: z.number(),
});

export type RouteBundle = z.infer<typeof routeBundleSchema>;
