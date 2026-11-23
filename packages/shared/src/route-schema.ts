import { z } from "zod";
import { distanceM } from "./geo";

/** Single source of truth for the route data format (see docs/SPEC.md §6). */

const slug = z.string().regex(/^[a-z0-9-]+$/, "must match [a-z0-9-]+");
const text = (max: number) => z.string().trim().min(1).max(max);

const optionSchema = z.strictObject({ id: slug, label: text(120) });

const choiceQuestSchema = z.strictObject({
	type: z.literal("choice"),
	prompt: text(300),
	options: z.array(optionSchema).min(2).max(6),
	answer: z.string(),
	explanation: text(500).optional(),
});

const textQuestSchema = z.strictObject({
	type: z.literal("text"),
	prompt: text(300),
	answer: z.array(text(120)).min(1),
	explanation: text(500).optional(),
});

const questSchema = z.discriminatedUnion("type", [
	choiceQuestSchema,
	textQuestSchema,
]);

const fallbackSchema = z
	.strictObject({
		enabled: z.boolean(),
		radiusM: z.number().int().min(20).max(100),
		question: questSchema.optional(),
	})
	.superRefine((fb, ctx) => {
		if (fb.enabled && !fb.question) {
			ctx.addIssue({
				code: "custom",
				path: ["question"],
				message: "required when fallback is enabled",
			});
		}
	});

const stationSchema = z.strictObject({
	id: slug,
	title: text(80),
	hint: text(400),
	location: z.strictObject({
		lat: z.number().min(-90).max(90),
		lng: z.number().min(-180).max(180),
	}),
	// Only low-risk terrain is representable; see SPEC §10.1.
	terrain: z.enum(["urban", "park", "plaza"]),
	safetyNote: text(300),
	qrKeyVersion: z.number().int().min(1),
	quest: questSchema,
	fallback: fallbackSchema,
});

const bboxSchema = z
	.tuple([z.number(), z.number(), z.number(), z.number()])
	.refine(
		([minLng, minLat, maxLng, maxLat]) => minLng < maxLng && minLat < maxLat,
		{
			message: "bbox must be [minLng, minLat, maxLng, maxLat] with min < max",
		},
	);

export const routeSchema = z.strictObject({
	schemaVersion: z.literal(1),
	id: slug,
	version: z.number().int().min(1),
	locale: z.string().min(2),
	title: text(80),
	description: text(400),
	region: z.strictObject({ name: text(80), bbox: bboxSchema }),
	order: z.enum(["free", "sequential"]),
	xpRules: z.strictObject({
		scanXp: z.number().int().min(0),
		questXp: z.number().int().min(0),
		fallbackXpFactor: z.number().min(0).max(1),
	}),
	reward: z.strictObject({
		badge: z.strictObject({
			id: slug,
			title: text(80),
			description: text(200),
			icon: text(120),
		}),
		requires: z.literal("all_unblocked_stations"),
	}),
	stations: z.array(stationSchema).min(1).max(30),
});

export type Route = z.infer<typeof routeSchema>;
export type Station = Route["stations"][number];
export type Quest = z.infer<typeof questSchema>;

export interface Issue {
	/** JSON path such as `stations[1].quest.answer`. */
	path: string;
	message: string;
}

export type RouteValidation =
	| { ok: true; route: Route; warnings: Issue[] }
	| { ok: false; errors: Issue[] };

const MIN_STATION_DISTANCE_M = 15;
const RECOMMENDED_MIN_STATIONS = 3;

function formatPath(path: readonly PropertyKey[]): string {
	let out = "";
	for (const part of path) {
		out +=
			typeof part === "number"
				? `[${part}]`
				: out
					? `.${String(part)}`
					: String(part);
	}
	return out;
}

function checkChoiceAnswer(quest: Quest, path: string, errors: Issue[]): void {
	if (
		quest.type === "choice" &&
		!quest.options.some((o) => o.id === quest.answer)
	) {
		errors.push({
			path: `${path}.answer`,
			message: "answer must be the id of one option",
		});
	}
	if (quest.type === "choice") {
		const ids = quest.options.map((o) => o.id);
		if (new Set(ids).size !== ids.length) {
			errors.push({
				path: `${path}.options`,
				message: "option ids must be unique",
			});
		}
	}
}

function semanticChecks(route: Route): { errors: Issue[]; warnings: Issue[] } {
	const errors: Issue[] = [];
	const warnings: Issue[] = [];
	const [minLng, minLat, maxLng, maxLat] = route.region.bbox;
	const seen = new Set<string>();

	route.stations.forEach((station, i) => {
		const base = `stations[${i}]`;

		if (seen.has(station.id)) {
			errors.push({
				path: `${base}.id`,
				message: `duplicate station id "${station.id}"`,
			});
		}
		seen.add(station.id);

		const { lat, lng } = station.location;
		if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) {
			errors.push({ path: `${base}.location`, message: "outside region.bbox" });
		}

		checkChoiceAnswer(station.quest, `${base}.quest`, errors);
		if (!station.quest.explanation) {
			warnings.push({
				path: `${base}.quest.explanation`,
				message: "explanation is missing",
			});
		}

		const fbQuestion = station.fallback.question;
		if (station.fallback.enabled && fbQuestion) {
			checkChoiceAnswer(fbQuestion, `${base}.fallback.question`, errors);
			if (fbQuestion.prompt.trim() === station.quest.prompt.trim()) {
				errors.push({
					path: `${base}.fallback.question.prompt`,
					message: "fallback question must differ from the quest prompt",
				});
			}
			if (!fbQuestion.explanation) {
				warnings.push({
					path: `${base}.fallback.question.explanation`,
					message: "explanation is missing",
				});
			}
		}

		for (let j = 0; j < i; j++) {
			const other = route.stations[j];
			if (
				other &&
				distanceM(station.location, other.location) < MIN_STATION_DISTANCE_M
			) {
				errors.push({
					path: `${base}.location`,
					message: `closer than ${MIN_STATION_DISTANCE_M} m to station "${other.id}"`,
				});
			}
		}
	});

	if (route.stations.length < RECOMMENDED_MIN_STATIONS) {
		warnings.push({
			path: "stations",
			message: `fewer than ${RECOMMENDED_MIN_STATIONS} stations`,
		});
	}
	return { errors, warnings };
}

export function validateRoute(input: unknown): RouteValidation {
	const parsed = routeSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			errors: parsed.error.issues.map((issue) => ({
				path: formatPath(issue.path),
				message: issue.message,
			})),
		};
	}
	const { errors, warnings } = semanticChecks(parsed.data);
	if (errors.length > 0) return { ok: false, errors };
	return { ok: true, route: parsed.data, warnings };
}
