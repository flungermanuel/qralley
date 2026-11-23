import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Plain string paths (no URL objects) so this also works under jsdom, which replaces the URL class.
const routePath = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../../content/routes/innsbruck-altstadt.route.json",
);

/** Fresh deep copy of the example route so tests can mutate it freely. */
// biome-ignore lint/suspicious/noExplicitAny: tests mutate arbitrary shapes on purpose
export function exampleRoute(): any {
	return JSON.parse(readFileSync(routePath, "utf8"));
}
