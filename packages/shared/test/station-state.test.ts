import { describe, expect, it } from "vitest";
import { applyReport, type ReportKind } from "../src/index";

describe("applyReport", () => {
	it.each<ReportKind>(["code_damaged", "code_missing", "other"])(
		"AK-REP-01: %s moves ok to reported",
		(kind) => {
			expect(applyReport("ok", kind, 0)).toBe("reported");
		},
	);

	it("AK-REP-01: a single unsafe report moves ok to reported", () => {
		expect(applyReport("ok", "unsafe", 1)).toBe("reported");
	});

	it("AK-REP-02: unsafe reports from 2 distinct players block the station", () => {
		expect(applyReport("ok", "unsafe", 2)).toBe("blocked");
		expect(applyReport("reported", "unsafe", 2)).toBe("blocked");
	});

	it("AK-REP-03: the caller passes distinct reporters, so 1 stays reported", () => {
		expect(applyReport("reported", "unsafe", 1)).toBe("reported");
	});

	it("non-unsafe reports never block, even with many unsafe reporters", () => {
		expect(applyReport("reported", "code_damaged", 5)).toBe("reported");
	});

	it("a blocked station stays blocked (only the operator unblocks)", () => {
		for (const kind of [
			"code_damaged",
			"code_missing",
			"unsafe",
			"other",
		] as const) {
			expect(applyReport("blocked", kind, 0)).toBe("blocked");
		}
	});

	it("a reported station stays reported on further reports", () => {
		expect(applyReport("reported", "other", 0)).toBe("reported");
	});
});
