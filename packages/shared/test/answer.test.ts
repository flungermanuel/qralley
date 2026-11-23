import { describe, expect, it } from "vitest";
import { isCorrectAnswer, normalizeAnswer, type Quest } from "../src/index";

const choice: Quest = {
	type: "choice",
	prompt: "?",
	options: [
		{ id: "a", label: "A" },
		{ id: "b", label: "B" },
	],
	answer: "a",
};
const text: Quest = {
	type: "text",
	prompt: "?",
	answer: ["Innsbruck", "Innsbruck Stadt"],
};

describe("normalizeAnswer", () => {
	it("trims, lowercases and collapses whitespace", () => {
		expect(normalizeAnswer("  Innsbruck   Stadt ")).toBe("innsbruck stadt");
	});

	it("normalizes unicode to NFC", () => {
		expect(normalizeAnswer("Universität")).toBe(normalizeAnswer("Universität"));
	});
});

describe("isCorrectAnswer", () => {
	it("AK-QUEST-01: accepts the right option id", () => {
		expect(isCorrectAnswer(choice, "a")).toBe(true);
	});

	it("AK-QUEST-02: rejects a wrong or unknown option id", () => {
		expect(isCorrectAnswer(choice, "b")).toBe(false);
		expect(isCorrectAnswer(choice, "zzz")).toBe(false);
		expect(isCorrectAnswer(choice, "")).toBe(false);
	});

	it("choice ids are compared exactly, not normalized", () => {
		expect(isCorrectAnswer(choice, " A ")).toBe(false);
	});

	it("AK-QUEST-05: text answers ignore case and surrounding whitespace", () => {
		expect(isCorrectAnswer(text, "  innsbruck ")).toBe(true);
		expect(isCorrectAnswer(text, "INNSBRUCK STADT")).toBe(true);
	});

	it("rejects wrong or empty text answers", () => {
		expect(isCorrectAnswer(text, "Wien")).toBe(false);
		expect(isCorrectAnswer(text, "   ")).toBe(false);
	});
});
