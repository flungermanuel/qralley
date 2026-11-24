# qurally – Projektanweisungen für Claude

> **Stand:** Schritte 1–9 des Umsetzungsplans sind umgesetzt (Mini-Version funktioniert End-to-End). Offen: Schritt 10 (Betrieb/Feldtest), Refactoring der Schichten und die Befunde aus `docs/REVIEW-2026-11-23.md`. Lies dieses Dokument zuerst, danach `docs/ARCHITEKTUR.md` und den Review-Bericht.

## Projektziel
qurally ist eine offline-fähige PWA, die Stadterkundung zum Spiel macht: Stationen mit QR-Codes, Fragen (Quests), XP und Abzeichen. Start: Innsbruck, eine kleine Route mit 3–4 Stationen („Mini-Version"). Später: Events, Partner-Belohnungen, Creator-Editor, KI-Bausteine. **Aktueller Scope und alle Abnahmekriterien stehen in `docs/SPEC.md`. Diese Datei hat im Zweifel Vorrang vor Gewohnheiten, SPEC.md vor Vermutungen.**

Der Entwickler ist Informatikstudent und arbeitet allein; er prüft **jeden Diff**. Schreibe daher Code, der leicht zu prüfen ist.

## Stack (Kurzfassung, Details in SPEC §13)
- TypeScript strict, pnpm-Monorepo: `apps/web` (React, Vite, vite-plugin-pwa, Dexie, zxing-wasm), `apps/api` (Node, Fastify, Drizzle, PostgreSQL), `packages/shared` (Zod-Schemas, reine Logik)
- Tests: Vitest, Playwright · Lint/Format: Biome · CI: GitHub Actions
- Später (**jetzt nicht anlegen/bauen**): `services/ai` (Python, FastAPI, uv, pytest, ruff, pyright)

## Befehle
```
pnpm install
pnpm dev                 # web (Vite) + api (Fastify) lokal
pnpm test                # alle Vitest-Tests (Unit + Integration)
pnpm test:e2e            # Playwright (baut vorher den Produktions-Build)
pnpm lint                # Biome check
pnpm format              # Biome format --write
pnpm typecheck           # tsc --noEmit in allen Paketen
pnpm build               # Produktions-Build (web + api)
pnpm check:layers        # Schichtenregeln und Dateigrößen-Budget (docs/ARCHITEKTUR.md)
pnpm route:validate      # content/routes/*.route.json prüfen
pnpm db:up               # lokale PostgreSQL (Docker, Port 5433); nötig für API-Tests und E2E
pnpm db:migrate          # Drizzle-Migrationen anwenden (braucht DATABASE_URL, siehe .env.example)
pnpm route:publish <datei>                     # Routenversion veröffentlichen
pnpm qr:generate --route <datei> --base-url https://<host>   # druckbare QR-SVGs (braucht QR_SIGNING_KEYS)
pnpm station:set-status <route> <station> <ok|reported|blocked> [Grund]   # Grund ist öffentlich
```
Handy-Test: Produktions-Build starten, dann `cloudflared tunnel --url http://localhost:<port>`.
Prüfe Testergebnisse immer am **Exit-Code**, nie an gefilterter oder durchgeleiteter Ausgabe.

## Arbeitsregeln
1. **Spezifikation vor Code.** Jede Änderung bezieht sich auf Funktionen/Abnahmekriterien in `docs/SPEC.md` (AK-IDs). Fehlt ein Kriterium oder widerspricht der Code der SPEC, zuerst SPEC (bzw. ADR) anpassen und dem Entwickler zeigen.
2. **Tests zuerst.** Erst den Test aus dem Abnahmekriterium schreiben (AK-ID im Testnamen), ausführen und den **roten** Lauf zeigen; dann minimal implementieren, bis grün.
3. **Kleine Schritte.** Ein Schritt = eine überprüfbare Änderung (Richtwert ≤ ~300 geänderte Zeilen ohne generierte Dateien). Größeres vorher in Teilschritte zerlegen und den Plan nennen.
4. **Ein Commit pro Schritt**, nur bei grünen Schichten, Lint, Typecheck und Tests (der Commit-Hook erzwingt das). Nur auf ausdrückliche Anweisung committen; nie pushen ohne Anweisung. Commit-Format: Conventional Commits (`feat(api): …`, `test(shared): …`, `docs: …`), Referenz auf AK-IDs im Text. **Keine `Co-Authored-By`-Zeile und keine Claude-Signatur in Commit-Nachrichten oder PR-Beschreibungen** (ausdrücklicher Wunsch des Entwicklers; hat Vorrang vor Standardvorgaben).
5. **Nach jedem Schritt kurze Prüfhilfe** für den Entwickler: Was wurde geändert, welche Dateien, was ist besonders prüfenswert, welche Tests decken es ab, was ist bewusst nicht gemacht.
6. **Architekturentscheidungen als kurze ADRs** in `docs/adr/NNNN-titel.md` (Kontext, Entscheidung, Alternativen, Folgen; max. 1 Seite). Neue Abhängigkeit, Schemaänderung, neues Protokoll, Abweichung von SPEC → ADR **und Rückfrage** vor der Umsetzung.
7. **Keine neuen Abhängigkeiten ohne Rückfrage.** Begründung, Größe, Wartungszustand nennen.
8. **Nichts erfinden.** Bei Unklarheit fragen statt raten. Nichts außerhalb des Auftrags „nebenbei" verbessern; Auffälliges als Hinweis melden.
9. **Scope-Disziplin:** Kein Event-Modus, keine Partner-Belohnungen, keine KI, kein Admin-UI, solange die Mini-Version nicht abgenommen ist.
10. **Ehrlich berichten:** Schlägt etwas fehl oder wurde etwas nicht getestet, so sagen – mit Ausgabe.
11. Code-Konventionen: Englische Bezeichner und Code-Kommentare (kurz, nur das Warum); deutsche UI-Texte (zentral in einer Textdatei, nicht im JSX verstreut); keine `any`, keine Nicht-Null-Assertions ohne Begründung; reine Logik in `packages/shared` bzw. `apps/api/src/domain`, UI und I/O dünn halten; Zod-Schema ist Quelle der Typen (`z.infer`), keine doppelten Typdefinitionen.

## Sicherheitsprinzipien (nicht verhandelbar)
- **Sicherheit vor Spielreiz:** keine Tages-Serien, Zeitrennen, Ranglisten, Push-Erinnerungen, keine Quests in gefährlichem Gelände (Validator erlaubt nur `urban|park|plaza`; jede Station hat `safetyNote`). Neue Spielmechaniken vorher gegen diese Regel prüfen.
- **Standortdaten sparsam:** Position nur für den Ersatzweg, nur transient, **nie in DB oder Logs**. Keine IP-Speicherung. Keine Drittanbieter-Requests (Fonts, Analytics, CDNs).
- **Secrets** (`QR_SIGNING_KEYS`, DB-Passwörter) nur über Umgebungsvariablen; nie committen, nie loggen, nie in Tests hartkodieren (Test-Schlüssel klar als solche benennen). `.env*` nicht lesen oder ändern.
- **QR-Token:** nur serverseitig signieren/prüfen, `timingSafeEqual`, Format laut SPEC §9. Der Server ist maßgeblich; Client-Ergebnisse sind „vorläufig".
- **Eingaben validieren** (Zod), Längen begrenzen, Text nie als HTML rendern.
- **Rechtliches** nur als Hinweis (⚖) markieren, keine Rechtsberatung, nichts als „rechtssicher" bezeichnen.
- **Destruktive Befehle** (`rm -rf`, `git reset --hard`, `git push --force`, `DROP`, Löschen von Daten) nur nach ausdrücklicher Rückfrage.

## Agenten, Skills, Hooks (`.claude/`)
- **Agenten** (Subagenten mit frischem Kontext): `planner` (opus, Gesprächspartner, nur lesen), `architect` (opus, Plan/ADR/SPEC, schreibt nur Doku), `test-writer` (sonnet, rote Tests), `implementer` (sonnet, Code bis grün), `reviewer` (opus, unabhängige Diff-Prüfung), `security-reviewer` (opus), `privacy-reviewer` (sonnet). Wichtige Aufgaben mit dem stärkeren Modell; ein Review ist nur unabhängig, wenn der Reviewer nicht der Autor ist.
- **Skills:** `discuss` (Diskussionsmodus, keine Änderungen), `new-feature` (Ablauf Plan → Test → Code → Review → Commit), `route-format`, `adr`, `commit-conventions`.
- **Hooks** (`.claude/settings.json`, Skripte in `.claude/hooks/`): Biome nach jedem Edit; blockiert gefährliche Bash-Befehle, `.env`-Dateien und Schlüssel im Code; Commit nur mit grünen Prüfungen (Doku-Commits ausgenommen); beim Abschluss laufen die schnellen Tests. Blockiert ein Hook, ist das gewollt: Ursache beheben, nicht umgehen.
- Biome ist für Markdown abgeschaltet (es zerstörte das Frontmatter der Agenten/Skills).
- Tool-Listen können Pfade nicht einschränken; „nur Tests ändern" etc. steht deshalb nur in den Agenten-Anweisungen.

## Offene Punkte (Details und Priorität in `docs/REVIEW-2026-11-23.md`)
- **Q1 Sperr-Regel:** Mit zwei anonymen Identitäten lassen sich alle Stationen sperren. Entscheidung ausstehend (Sperre nur mit Fortschritt am Ort **oder** Sperre nur von Hand) → ADR, dann umsetzen.
- Befunde aus Abschnitt 2–5 des Berichts: XP-Anzeige (AK-XP-01), Fake-Server der Web-Tests, schwache Tests, `check:layers`-Lücken, Commit-Hook-Lücken, Aufbewahrungsfristen und Notizen.
- Refactoring: `App.tsx` (~1000 Zeilen), `apps/api/src/app.ts`, `apps/api/src/domain/sync.ts` aufteilen (Plan im Bericht, §6).
- Schritt 10: Docker, Caddy/HTTPS, CSP und Header, `trustProxy`, Log-Schwärzung für `/q/*`, DB-Rolle ohne Superuser, `NODE_ENV=production`, frische Schlüssel. ⚖-Punkte (Datenschutzerklärung, Impressum, Einverständnis, Genehmigung für Aufkleber) brauchen menschliche Entscheidungen.
- Die CI (`.github/workflows/ci.yml`) wurde noch nie ausgeführt.

## Wo was steht
- `docs/SPEC.md` – Spezifikation, Datenmodell, Routenformat, Abnahmekriterien
- `docs/ARCHITEKTUR.md` – Schichten, Regeln, bekannte Schulden, Agenten-Ablauf, Qualitätstore
- `docs/adr/` – Architekturentscheidungen (0001–0006)
- `docs/REVIEW-2026-11-23.md` – Befunde der unabhängigen Reviews, Refactoring-Plan, offene Entscheidungen
- `docs/UMSETZUNGSPLAN.md` – Reihenfolge der Schritte (1–9 erledigt)
- `docs/AGENTEN-PLAN.md` – ursprünglicher Plan für Agenten/Skills/Hooks (umgesetzt, siehe `.claude/`)
- `content/routes/` – Routendateien (nur über `route:validate` ändern/prüfen)
