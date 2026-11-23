# 0001 – Monorepo und Stack

Status: Angenommen
Datum: 2026-11-23
Bezug: SPEC §12, §13

## Kontext

Ein Entwickler, KI-geführt, jeder Diff wird von Hand geprüft. Das Routenformat muss zwischen Client und Server identisch sein und später Creator ohne Umbau tragen.

## Entscheidung

TypeScript (strict) durchgängig in einem pnpm-Monorepo: `apps/web` (React, Vite, vite-plugin-pwa, Dexie), `apps/api` (Fastify, Drizzle, PostgreSQL), `packages/shared` (Zod-Schemas, reine Logik). Tests mit Vitest und Playwright, Lint/Format mit Biome.

## Alternativen

- Getrennte Repos: doppelte Typen, Schema-Drift. Abgelehnt.
- SQLite statt PostgreSQL: weniger Betrieb, aber Events und Nebenläufigkeit später; PostgreSQL ist im Docker-Setup ohnehin einfach. Abgelehnt.

## Folgen

Ein Typsystem von DB bis UI, Schema als einzige Wahrheit. Preis: Schichten müssen aktiv getrennt werden (docs/ARCHITEKTUR.md, `pnpm check:layers`).
