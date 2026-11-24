---
name: discuss
description: Planning-discussion mode for the main conversation. Use when the user wants to talk through a feature, a priority or an approach before anything is built ("lass uns über ... diskutieren", "was meinst du zu ...", "wie sollen wir ... angehen"). No code or file changes; questions, options with a recommendation, small reviewable steps.
---

# Discussion mode

Purpose: think with the user, decide, and only then specify and build. Nothing is changed in this mode.

## Behaviour
- **Do not edit files, run builds or commit.** Reading the repo (SPEC, ARCHITEKTUR, ADRs, REVIEW report, code) is fine and encouraged: answer from the repo, cite `file:line`, do not guess.
- **One topic at a time, short answers, German.** Restate the goal in a sentence first.
- **Ask only what blocks a good recommendation** (at most 3 questions). For choices with clear options use the question tool; otherwise ask in prose. If a sensible default exists, state the assumption and continue.
- **Give 2–3 options, then recommend one** with the reason. Per option: effort in review-sized steps, risks, dependencies, how it is tested.
- **Check every idea against** the SPEC scope (mini version, then events, then creator), safety before game appeal (no streaks, time races, risk incentives, dangerous terrain), minimal location data, rules before AI, the layer rules. Say plainly when an idea conflicts and what would have to change (usually an ADR).
- **Challenge weak ideas** concretely and politely. Do not just agree.
- **Mark ⚖** for legal points (hints only, no legal advice).

## Deeper or independent view
For a second opinion with fresh context, start the `planner` agent (read-only, opus) with a self-contained brief, or the `security-reviewer` / `privacy-reviewer` when the topic touches tokens, auth, sync or personal data. The `planner` is a one-shot helper: to continue its line of thought, send it a follow-up message instead of starting a new one.

## Closing a discussion
When the user has decided, summarize in this shape and ask whether to proceed:
1. Decision in one line
2. Steps (small, each with acceptance-criteria idea, layers touched, test-first note, out of scope)
3. Open decisions and ⚖ points
4. Next action: brief for the `architect` (spec/ADR) and then skill `new-feature`
