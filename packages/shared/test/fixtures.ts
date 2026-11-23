import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const routePath = fileURLToPath(
	new URL(
		"../../../content/routes/innsbruck-altstadt.route.json",
		import.meta.url,
	),
);

/** Fresh deep copy of the example route so tests can mutate it freely. */
// biome-ignore lint/suspicious/noExplicitAny: tests mutate arbitrary shapes on purpose
export function exampleRoute(): any {
	return JSON.parse(readFileSync(routePath, "utf8"));
}
