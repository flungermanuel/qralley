# qurally – Projektanweisungen für Claude

> **Vorschlag zur Prüfung.** Befehle unter „Befehle" existieren erst, nachdem Schritt 1 des Umsetzungsplans (`docs/UMSETZUNGSPLAN.md`) fertig ist.

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
pnpm route:validate      # content/routes/*.route.json prüfen
pnpm db:migrate          # Drizzle-Migrationen anwenden
docker compose -f infra/docker-compose.yml up db   # lokale PostgreSQL
```
Handy-Test: Produktions-Build starten, dann `cloudflared tunnel --url http://localhost:<port>`.

## Arbeitsregeln
1. **Spezifikation vor Code.** Jede Änderung bezieht sich auf Funktionen/Abnahmekriterien in `docs/SPEC.md` (AK-IDs). Fehlt ein Kriterium oder widerspricht der Code der SPEC, zuerst SPEC (bzw. ADR) anpassen und dem Entwickler zeigen.
2. **Tests zuerst.** Erst den Test aus dem Abnahmekriterium schreiben (AK-ID im Testnamen), ausführen und den **roten** Lauf zeigen; dann minimal implementieren, bis grün.
3. **Kleine Schritte.** Ein Schritt = eine überprüfbare Änderung (Richtwert ≤ ~300 geänderte Zeilen ohne generierte Dateien). Größeres vorher in Teilschritte zerlegen und den Plan nennen.
4. **Ein Commit pro Schritt**, nur bei grünen Tests, Lint und Typecheck. Nur auf ausdrückliche Anweisung committen; nie pushen ohne Anweisung. Commit-Format: Conventional Commits (`feat(api): …`, `test(shared): …`, `docs: …`), Referenz auf AK-IDs im Text.
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

## Wo was steht
- `docs/SPEC.md` – Spezifikation, Datenmodell, Routenformat, Abnahmekriterien
- `docs/adr/` – Architekturentscheidungen
- `docs/UMSETZUNGSPLAN.md` – Reihenfolge der Schritte
- `docs/AGENTEN-PLAN.md` – geplante Agenten/Skills/Hooks
- `content/routes/` – Routendateien (nur über `route:validate` ändern/prüfen)
