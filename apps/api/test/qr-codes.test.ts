import { tokenFromQrText, validateRoute } from "@qurally/shared";
import { describe, expect, it } from "vitest";
import { exampleRoute } from "../../../packages/shared/test/fixtures";
import { buildQrJobs, renderQrSvg } from "../src/domain/qr-codes";
import { verifyToken } from "../src/domain/token";

const keys = new Map([[1, Buffer.alloc(32, 1)]]);

function route() {
	const result = validateRoute(exampleRoute());
	if (!result.ok) throw new Error("fixture invalid");
	return result.route;
}

describe("buildQrJobs", () => {
	it("AK-CLI-02: creates one job per station with a verifiable token in the URL", () => {
		const r = route();
		const jobs = buildQrJobs(r, "https://example.org", keys);
		expect(jobs.map((j) => j.stationId)).toEqual(r.stations.map((s) => s.id));
		for (const job of jobs) {
			expect(job.url.startsWith("https://example.org/q/")).toBe(true);
			const token = tokenFromQrText(job.url);
			expect(token).not.toBeNull();
			expect(verifyToken(keys, token ?? "")).toEqual({
				ok: true,
				routeId: r.id,
				stationId: job.stationId,
				keyVersion: 1,
			});
		}
	});

	it("tolerates a trailing slash in the base url", () => {
		const jobs = buildQrJobs(route(), "https://example.org/", keys);
		expect(jobs[0]?.url.startsWith("https://example.org/q/q1.")).toBe(true);
	});

	it("rejects a base url that is not https (cameras and PWA need it) unless localhost", () => {
		expect(() => buildQrJobs(route(), "http://example.org", keys)).toThrow(
			/https/,
		);
		expect(() => buildQrJobs(route(), "not a url", keys)).toThrow(/base url/i);
		expect(() =>
			buildQrJobs(route(), "http://localhost:5173", keys),
		).not.toThrow();
	});

	it("fails clearly when a station uses a key version without key", () => {
		expect(() =>
			buildQrJobs(
				route(),
				"https://example.org",
				new Map([[2, Buffer.alloc(32, 2)]]),
			),
		).toThrow(/key version 1/);
	});
});

describe("renderQrSvg", () => {
	it("AK-CLI-02: renders an svg with a readable caption", () => {
		const svg = renderQrSvg("https://example.org/q/q1.a.b", "Goldenes Dachl");
		expect(svg.startsWith("<svg")).toBe(true);
		expect(svg).toContain("Goldenes Dachl");
		expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
	});

	it("escapes xml special characters in the caption", () => {
		const svg = renderQrSvg("https://example.org/q/q1.a.b", `<b>&"'`);
		expect(svg).not.toContain("<b>");
		expect(svg).toContain("&lt;b&gt;&amp;");
	});
});
