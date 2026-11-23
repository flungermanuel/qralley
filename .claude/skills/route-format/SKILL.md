---
name: route-format
description: Rules and commands for creating or changing route files (content/routes/*.route.json), the Zod route schema, route versions and QR codes. Use whenever a route, station, quest or the route data format is touched.
---

# Route format

Single source of truth: `packages/shared/src/route-schema.ts` (Zod). Format described in docs/SPEC.md §6.

## Commands

- `pnpm route:validate` – validate all route files (exit code ≠ 0 on errors; warnings are printed)
- `pnpm db:up` / `pnpm db:migrate` – local database
- `pnpm route:publish content/routes/<id>.route.json` – store a new version (needs `DATABASE_URL`)
- `pnpm qr:generate --route <file> --base-url https://<host> [--out dir]` – printable SVG per station (needs `QR_SIGNING_KEYS`)

## Rules

- Changed content needs a higher `version`; identical content is a no-op. Never edit a published version.
- Each station: slug id, `terrain` only `urban | park | plaza`, a `safetyNote`, coordinates inside `region.bbox`, at least 15 m from other stations, a quest, and a fallback question that differs from the quest when the fallback is enabled.
- A changed `schemaVersion` or any schema change needs an ADR and a migration plan for stored bundles.
- Station choice checklist (safety first): publicly accessible, safe by day, no climbing or hillside, no crossing without a crossing aid, no private ground, no construction site, no water. No incentives for risk, no time pressure.
- Coordinates and questions in the example route are placeholders: verify on site before printing codes.
- Retiring a code: raise `qrKeyVersion` of the station, add the new key to `QR_SIGNING_KEYS`, reprint, then remove the old key.
- Never commit signing keys; `.env` stays out of git.
