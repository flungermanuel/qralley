---
name: new-feature
description: Workflow for building any new function or change in qurally, from acceptance criteria to commit, using the architect, test-writer, implementer, reviewer and (when relevant) security-reviewer agents. Use at the start of every feature or step.
---

# New feature workflow

Follow in order. One feature = one small step = one commit.

1. **Scope** – name the acceptance criteria (AK-IDs, docs/SPEC.md §14). If none fit, extend SPEC first. Anything outside the mini-version scope (events, partners, AI, admin UI) is out.
2. **Plan** – use the `architect` agent for anything beyond a trivial change: steps, layers, files, risks, open questions. Write an ADR for new dependencies, schema/protocol changes or deviations (skill `adr`). Get the user's OK on the plan.
3. **Tests first** – `test-writer` writes the tests (AK-ID in the title) and shows the RED run with exit code.
4. **Implement** – `implementer` makes them green in the right layer (see docs/ARCHITEKTUR.md). Smallest change that works.
5. **Verify yourself** – run, and check the exit codes of: `pnpm check:layers`, `pnpm lint`, `pnpm typecheck`, `pnpm test`; and `pnpm test:e2e` when UI/flows/PWA changed (needs `pnpm db:up`).
6. **Independent review** – `reviewer` on the diff. Fix blockers and should-fix items.
7. **Security/privacy** – run `security-reviewer` when the change touches auth, tokens, sync, input handling, headers, dependencies, infra or personal data; `privacy-reviewer` when collected/sent data changes. Mandatory before field tests.
8. **Hand over to the user** – summary with: what changed, files worth reading closely, tests and results, what was NOT done or verified. The user reviews every diff.
9. **Commit** (skill `commit-conventions`) only when the user asks; the commit hook blocks red commits.

Never judge test results from piped or filtered output; check the exit code.
