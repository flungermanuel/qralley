# Architektur und Schichten

Ziel: Der Code bleibt wartbar, weil jede Schicht genau eine Aufgabe hat und Abhängigkeiten nur in eine Richtung zeigen. Die Regeln werden **automatisch geprüft** (`pnpm check:layers`, läuft im Commit-Hook und in CI).

## 1. Schichten und erlaubte Abhängigkeiten

```
packages/shared      Schemas (Zod), reine Regeln (XP, Radius, Token-Format, Antwortprüfung)
        ▲            keine Frameworks, kein Node/Browser-spezifischer Code, kein Import aus apps/
        │
apps/api             routes (HTTP) ─▶ domain (Regeln, Abläufe) ─▶ db (Schema, Client)
apps/web             UI (App, features) ─▶ data (Dexie, Sync, Regeln) ─▶ ports ◀─ adapters
```

| Schicht                          | Aufgabe                                                    | darf nicht                                             |
| -------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| `packages/shared`                | Datenformat, reine Funktionen                              | react, dexie, fastify, drizzle, pg, `node:*`, `apps/*` |
| `apps/api/src/routes` _(Ziel)_   | HTTP: Eingaben validieren, Domain aufrufen, Antwort formen | direkt auf `db/schema` zugreifen                       |
| `apps/api/src/domain`            | Geschäftsregeln, Abläufe, Transaktionen                    | fastify, `app.ts`, `routes/`                           |
| `apps/api/src/db`                | Schema, Migrationen, Client                                | `domain/`, fastify, `app.ts`                           |
| `apps/web/src/ports`             | Schnittstellen zu Gerät/Umgebung (Scanner, Standort)       | react, dexie, `data/`, `adapters/`, UI                 |
| `apps/web/src/adapters`          | Implementierung der Ports (zxing-wasm, Geolocation API)    | react, dexie, `data/`, UI                              |
| `apps/web/src/data`              | Dexie-Zugriff, Sync, Scan-/Quest-/Ersatzweg-Regeln, Outbox | react, UI, `adapters/` (nur Ports)                     |
| `apps/web/src/features` _(Ziel)_ | UI-Bausteine pro Funktion                                  | dexie direkt, `adapters/`                              |
| `apps/web/src/App.tsx`           | Zusammenbau (Provider, Ports/Adapter verdrahten)           | Geschäftsregeln                                        |

Die Apps importieren sich **nie** gegenseitig; gemeinsam genutzter Code gehört in `packages/shared`.

## 2. Leitregeln

1. **Regeln in reine Funktionen.** Alles, was entscheidet (XP, Radius, Token, Antwort, Zustandsübergang), liegt in `shared` oder `domain` und ist ohne Datenbank/Browser testbar.
2. **Server ist maßgeblich.** Der Client zeigt „vorläufig"; Ergebnisse, XP und Abzeichen kommen vom Server (SPEC §8).
3. **Ports an den Rändern.** Kamera, Standort, Netzwerk werden über Ports/`fetchFn` hineingereicht; Tests ersetzen sie, nicht die eigene Logik.
4. **Ein Schreibpfad pro Aktion.** Aktion → lokaler Fortschritt + Outbox-Eintrag in **einer** Transaktion → Sync. Nie am Netz vorbei, nie zwei Wahrheiten.
5. **Datensparsamkeit.** Positionen nur im Outbox-Ereignis, nie persistiert oder geloggt. Keine IPs, Bodies, Tokens in Logs.
6. **Keine neue Abhängigkeit ohne ADR** (docs/adr/).
7. **Dateigröße als Frühwarnung.** Ab 500 Zeilen schlägt `check:layers` an. Bekannte Altlasten sind eingefroren und dürfen nur schrumpfen.
8. **Erweitern durch neue Module, nicht durch Umbau.** Quest-Typen kommen als Modul in eine statisch deklarierte, zur Laufzeit geschlossene Registry in `packages/shared` (ADR 0008). Der Validator bleibt das einzige Tor für Routeninhalte; neue Streckentypen nur mit eigenen Sicherheitsregeln und ADR.
9. **Domain meldet, HTTP loggt.** Die Domain gibt Ereignisse wie den Operator-Alarm als Rückgabewert zurück; geloggt wird in `routes`/`app.ts` mit expliziter Feldliste (ADR 0007).

## 3. Bekannte Schulden (ehrlich)

| Schuld                                    | Ort                                                          | Plan                                                                                                                                                 | Risiko                                         |
| ----------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| UI-Monolith                               | `apps/web/src/App.tsx` (~1000 Zeilen, ~19 Komponenten/Hooks) | Aufteilen in `features/` (safety, route, scan, station, quest, fallback, report, sync, badge, account) plus `hooks/`; `App.tsx` nur noch Zusammenbau | Änderungen werden schwer prüfbar, Regressionen |
| HTTP und DB vermischt                     | `apps/api/src/app.ts` (Handler greifen direkt auf `db` zu)   | `routes/` (Handler) + `domain/players.ts`, `domain/routes.ts`; Handler nur noch Validierung und Antwort                                              | Auth-/Datenfehler schwer zu isolieren          |
| Großes Domänenmodul                       | `apps/api/src/domain/sync.ts` (~520 Zeilen)                  | pro Ereignistyp ein Modul (`scan`, `quest`, `fallback`, `report`) plus gemeinsamer Ablauf                                                            | Änderungen an einem Typ riskieren andere       |
| Kein Security-/Architektur-Review bisher  | gesamter Code                                                | `security-reviewer`, `reviewer`, `privacy-reviewer` vor dem Feldtest laufen lassen                                                                   | unentdeckte Lücken                             |
| Keine CSP/Security-Header, kein Container | Auslieferung                                                 | Schritt 10 (Caddy/Docker)                                                                                                                            | Angriffsfläche im Feldtest                     |

Diese Schulden werden als eigene kleine Schritte abgebaut (Verhalten gleich, Tests grün), nicht nebenbei.
Reihenfolge und Schritte: `docs/V1-FUNDAMENT.md` (Phasen D, E, F).

## 4. Arbeitsablauf mit Agenten

Details: `.claude/skills/new-feature/SKILL.md`, Hooks: `.claude/settings.json`.

| Agent               | Modell | Aufgabe                                                        | Werkzeuge                    |
| ------------------- | ------ | -------------------------------------------------------------- | ---------------------------- |
| `planner`           | opus   | Gesprächspartner: Features und Vorgehen durchdenken, Optionen mit Empfehlung, Schritte (schreibt nichts) | nur Lesen |
| `architect`         | opus   | Planung, ADRs, SPEC, Schichtenregeln                           | Lesen, nur Doku schreiben    |
| `test-writer`       | sonnet | rote Tests aus Abnahmekriterien                                | Lesen, Tests schreiben, Bash |
| `implementer`       | sonnet | minimaler Code bis grün, richtige Schicht                      | Lesen, Schreiben, Bash       |
| `reviewer`          | opus   | unabhängige Diff-Prüfung (Spec, Tests, Schichten, Korrektheit) | nur Lesen + Prüfbefehle      |
| `security-reviewer` | opus   | Sicherheitsaudit (Token, Auth, Sync, PWA, Abhängigkeiten)      | nur Lesen + Audit-Befehle    |
| `privacy-reviewer`  | sonnet | Datenflüsse gegen SPEC §10, ⚖-Liste                            | nur Lesen                    |

Ein stärkeres Modell (opus) für die Aufgaben, bei denen ein Fehler teuer ist: Planung, unabhängige Prüfung, Sicherheit. Das schnellere Modell (sonnet) für Test- und Code-Routinearbeit. **Wichtig:** Der Reviewer ist nur dann unabhängig, wenn er mit frischem Kontext startet (eigener Subagent), nicht im selben Gespräch, das den Code geschrieben hat.

## 5. Qualitätstore

| Tor                          | Wo                       | Was                                                                    |
| ---------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| Format/Lint                  | Hook nach jedem Edit     | Biome, behebt automatisch, meldet den Rest                             |
| Gefährliche Befehle, Secrets | Hook vor Bash/Read/Write | blockiert `rm -rf`, Force-Push, `.env`, Schlüssel im Code              |
| Commit                       | Hook vor `git commit`    | Schichten, Lint, Typecheck, alle Tests grün (Doku-Commits ausgenommen) |
| Abschluss                    | Stop-Hook                | schnelle Tests (`shared`, `web`) grün, wenn Code geändert wurde        |
| CI                           | GitHub Actions           | dasselbe plus Playwright gegen echte Datenbank                         |
| Review                       | Agenten                  | `reviewer` je Schritt, `security-reviewer` vor Meilensteinen           |
