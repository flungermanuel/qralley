import type { Quest } from "./route-schema";

/** Trim, collapse inner whitespace, lowercase, Unicode NFC. */
export function normalizeAnswer(input: string): string {
	return input.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Choice ids are compared exactly; text answers after normalization. */
export function isCorrectAnswer(quest: Quest, answer: string): boolean {
	if (quest.type === "choice") return answer === quest.answer;
	const given = normalizeAnswer(answer);
	if (given === "") return false;
	return quest.answer.some((accepted) => normalizeAnswer(accepted) === given);
}
