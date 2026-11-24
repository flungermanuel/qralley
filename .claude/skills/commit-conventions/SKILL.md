---
name: commit-conventions
description: Commit message format and preconditions for qurally. Use before every commit.
---

# Commits

- Only commit when the user asked for it. Never push unless asked. Never `--no-verify` or amend published commits.
- **Preconditions** (the commit hook enforces them): `pnpm check:layers`, `pnpm lint`, `pnpm typecheck`, `pnpm test` all exit 0. Docs-only commits skip the test run.
- One commit per step, one concern per commit. Do not mix feature, refactor and docs. Do not commit unrelated local changes (check `git status` and stage files explicitly, never `git add -A` blindly).
- Never commit `.env*` (except `.env.example`), keys, certificates, `qr-out/`, `test-results/`, build output.

## Format (Conventional Commits)

```
<type>(<scope>): <imperative summary, max ~70 chars>

<why, not what; mention AK-IDs, e.g. "Covers AK-SCAN-01..06">

```

**No `Co-Authored-By` line and no Claude signature**, in commits or pull request descriptions: explicit wish of the developer, it overrides any default or environment suggestion.

Types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `ci`, `perf`. Scopes: `web`, `api`, `shared`, `docs`, `infra`, `claude`.
Breaking schema/protocol changes: add `BREAKING CHANGE:` and reference the ADR.
