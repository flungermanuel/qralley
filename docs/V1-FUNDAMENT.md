# Fahrplan v1 – Fundament-Release

Stand: 2026-11-24 · Bezug: SPEC 0.3 §1 („v1 – Fundament-Release"), `docs/REVIEW-2026-11-23.md`, ADR 0007, ADR 0008, ADR 0009

**Ziel:** Die Mini-Version bleibt funktional gleich, wird aber sauber geschichtet, ohne Monolithen, mit Tests, die ihr Ziel prüfen, und betriebsbereit für den Feldtest. **Keine neuen Spielfunktionen.**

## Spielregeln für jeden Schritt

- Ein Schritt = ein Commit, Richtwert ≤ ~300 geänderte Zeilen (reine Verschiebungen dürfen größer sein, wenn sie als Verschiebung prüfbar sind: `git diff -M --color-moved=zebra`).
- Art des Schritts steht in Klammern:
  - **[R]** Refactoring: Verhalten gleich, **kein Test wird geändert** außer Importpfaden. Rote Tests = Fehler im Refactoring.
  - **[V]** Verhaltens-Commit: zuerst roter Test mit AK-ID (Lauf zeigen), dann minimal grün.
  - **[T]** nur Tests: neue/strengere Tests. Grün auf heutigem Code ist erwartet; **Prüfhinweis:** einmal die geprüfte Stelle testweise kaputt machen und den roten Lauf zeigen (sonst ist der Test wertlos).
  - **[I]** Infrastruktur/Werkzeug/Doku.
- **[?]** = vor Beginn Rückfrage beim Entwickler. **[ADR]** = ADR nötig (vom `architect`, vor der Umsetzung).
- Agentenkette: [V] `test-writer` → `implementer` → `reviewer`; [R] `implementer` → `reviewer`; [T] `test-writer` → `reviewer`; [I] wie angegeben. Der Reviewer startet immer mit frischem Kontext.
- Jede Schicht-Verbesserung, die ein Refactoring erreicht, wird im **selben** Commit als Regel in `check:layers` aktiviert bzw. das Größenbudget gesenkt (Phase F bündelt nur den Rest).

---

## Phase A – Fehler aus Review §1 und Sperr-Regel Q1 (ADR 0007)

Review-Befunde 1, 3–8 sind bereits behoben. Offen: Befund 2 (Q1) und die Nits N2, N5, N7, N8. Dazu der Ausgleich aus OE1 (ADR 0009): A3a (Server) und A3b (Client), in dieser Reihenfolge nach A3 und vor D4, damit die spätere Aufteilung von `sync.ts` das neue Verhalten nur noch verschiebt. A3a hängt nicht von A1–A3 ab, berührt aber dieselben Dateien; deshalb nacheinander, nicht parallel.

| # | Schritt | AK | Dateien (voraussichtlich) | Sicherheitsnetz | Prüfhinweis | Agent |
|---|---|---|---|---|---|---|
| A0 | **[I]** SPEC 0.2, ADR 0007/0008, dieser Fahrplan | – | `docs/` | – | Schwellen, Alarm-Inhalt, AK-REP-02/03/08–11 | `architect` (erledigt) |
| A1 | **[V]** ✔ **erledigt (Commit `3572600`).** Keine Auto-Sperre: `applyReport` und `UNSAFE_BLOCK_THRESHOLD` sind aus `shared` entfernt; die Regel steht allein im Upsert von `flagStation` (nur `ok` → `reported`, `setWhere` auf `status = 'ok'`), `statusReason` ohne „unsafe reports". Fehlende `station_state`-Zeile (N5) wird per Upsert angelegt statt ignoriert. | AK-REP-01/02/03 | `packages/shared/src/station-state.ts` (nur noch Typen), `apps/api/src/domain/sync.ts` (`flagStation`), Tests: `packages/shared/test/station-state.test.ts` (entfernt), `apps/api/test/sync.test.ts`, `apps/api/test/hardening.test.ts` | rot: „2 / 5 verschiedene `unsafe`-Melder, auch parallel → `reported`, nie `blocked`"; „gesperrt bleibt gesperrt"; „Meldung ohne Stationszeile → `reported`" | Alte Sperr-Tests werden **umgekehrt**, nicht gelöscht; Sperre gewinnt weiter vor Offline-Scan (AK-SCAN-06 grün) | test-writer → implementer → reviewer |
| A2 | **[V]** Reine Alarmlogik in `shared`: `reportAlertCrossed(before, after, thresholds)` und Zählregel (gleicher Spieler einmal, `player_id` NULL je einmal); Schwellen-Konfiguration als Zod-Schema mit Defaults 3/2, Grenzen 1–10 | AK-REP-03, AK-REP-08 (Logik), AK-REP-11 (nur Einlesen und Prüfen; der Startabbruch kommt in A3) | `packages/shared/src/report-alert.ts` (neu; `station-state.ts` enthält seit A1 nur noch die Typen `StationStatus`/`ReportKind`, es gibt keine Report-Logik in `shared` mehr, an die angeknüpft wird), `apps/api/src/config.ts` o. ä. für Umgebung, `.env.example` (Platzhalter, vom Entwickler) | tabellengetriebene Tests: genau beim Erreichen `true`, darunter/darüber `false`, `unsafe`-Pfad und Gesamtpfad, ungültige Umgebung → Startabbruch | Kein I/O in `shared`; Umgebung wird nur in `apps/api` gelesen | test-writer → implementer → reviewer |
| A3 | **[V]** Alarm im Sync: `flagStation` zählt unter der bestehenden Zeilensperre vorher/nachher und gibt einen Alarm zurück; der Sync-Handler loggt genau eine Zeile `station_alert` | AK-REP-08, AK-REP-09, AK-REP-11 (Startabbruch), AK-PRIV-01 | `apps/api/src/domain/sync.ts`, `apps/api/src/app.ts` (Log im Handler), `apps/api/src/server.ts` (ruft `loadAlertThresholds(process.env)` beim Start auf, ungültiger Wert → Abbruch mit Variablennamen) und `apps/api/test/config.test.ts`/Starttest, `apps/api/test/hardening.test.ts`, `apps/api/test/logging.test.ts` | rot: drei Spieler parallel → genau **eine** Log-Zeile; Log enthält keine Spieler-ID/Notiz/Koordinaten; gesperrte Station → kein Alarm | Domain importiert weiter kein Fastify; Log-Feldliste explizit (Whitelist), nicht das ganze Objekt; offene Meldungen (`playerId`, `kind`) laden und durch `countReporters` aus `shared` zählen, nicht per SQL `COUNT(DISTINCT)` (NULL verhält sich dort anders) | test-writer → implementer → reviewer |
| A3a | **[V] [ADR 0009] [?]** Server: „als unsicher gemeldet" zählt nicht für den Abschluss (OE1, Variante B). Gemeinsames `stationStateSchema` in `shared` (Bundle + Sync-Antwort) mit optionalem `unsafeReported`; reine Funktion `countingStations(stationIds, stationStates)` in `shared/progress.ts` (nicht `blocked`, nicht `unsafeReported === true`), `isRouteComplete` nutzt sie; `getStationStates` leitet das Merkmal aus offenen `unsafe`-Meldungen ab (eine gruppierte Abfrage je Route, keine Migration); `evaluateRoute` nutzt die geteilte Funktion. **Rückfrage vor Beginn:** Protokollfeld laut ADR 0009 Punkt 3 bestätigen. | AK-REP-12, AK-REP-04, AK-REP-05, AK-BADGE-01, AK-BADGE-05, AK-BADGE-06, AK-BADGE-08 (Server), AK-SYNC-09 (Schema) | `packages/shared/src/bundle-schema.ts`, `packages/shared/src/sync-schema.ts`, `packages/shared/src/progress.ts`, `apps/api/src/domain/route-store.ts`, `apps/api/src/domain/sync.ts` (`evaluateRoute`); Tests: `packages/shared/test/progress.test.ts`, `packages/shared/test/sync-schema.test.ts`, `apps/api/test/routes.test.ts`, `apps/api/test/sync.test.ts`, `apps/api/test/hardening.test.ts` | **rot zuerst** (`shared`): tabellengetriebene Tests für `countingStations`/`isRouteComplete`: `unsafeReported` ausgeschlossen, andere Meldungsarten bleiben Pflicht, Feld fehlt → zählt, alle ausgeschlossen → `false`. **rot** (API): offene `unsafe`-Meldung eines zweiten Spielers → erster Spieler bekommt Abzeichen beim nächsten Sync **ohne** neue Ereignisse; Meldung `code_missing` → kein Abzeichen; Bundle enthält `unsafeReported: true` ohne Notiz/Anzahl (Antwort-JSON nach Notiztext durchsuchen), ETag ändert sich; `station:set-status ok` → `false`, Abzeichen bleibt, zweiter Spieler ohne Abzeichen braucht die Station wieder; Meldung ohne Spielerbezug (gelöschter Spieler) zählt; alle Stationen gemeldet → kein Abzeichen. | Bestehende `toEqual({status, reason})`-Erwartungen (`routes.test.ts`, `hardening.test.ts`) werden um das Feld **ergänzt**, nicht gelockert. Eine Regel, eine Funktion: Server und Client rufen dieselbe `shared`-Funktion. Abfrage nutzt `status='open'`, nicht `reason`. Kein Entzug von Abzeichen (es gibt keinen `DELETE` auf `badges_awarded`). Mutationsprobe: Filter `kind='unsafe'` entfernen → AK-BADGE-05-Test (Fall `code_missing`) wird rot. | test-writer → implementer → reviewer (+ privacy-reviewer für AK-REP-12) |
| A3b | **[V]** Client: stärkerer Hinweis und vorläufiger Abschluss nach derselben Regel. `badgeStatus` nutzt `countingStations` mit den gecachten `stationStates` **plus** eigenen offenen `unsafe`-Meldungen aus der Outbox (sofort, offline); Hinweistexte in `texts.ts`; Hinweis „gerade zählt keine Station" (AK-BADGE-08); Rücknahme des vorläufigen Abzeichens nach Server-Antwort mit Hinweis. | AK-REP-13, AK-BADGE-07, AK-BADGE-08 (Client), AK-BADGE-04, AK-SYNC-09 (Client), AK-SAFE-03 | `apps/web/src/data/badge.ts`, `apps/web/src/data/report.ts` (Abfrage eigener offener `unsafe`-Meldungen, falls nicht schon vorhanden), `apps/web/src/texts.ts`, `apps/web/src/App.tsx` (nur Anzeige: Liste ~Z. 587, Stationsansicht ~Z. 632), Tests: `apps/web/test/badge-account.test.ts`, `apps/web/test/step9-ui.test.tsx`, `apps/web/test/sync.test.ts`, `apps/web/test/fake-server.ts` (liefert das Feld) | **rot zuerst**: Bundle mit `unsafeReported` → beide Hinweistexte in Liste und Stationsansicht, Scan-/Ersatzweg-Knopf weiter da; nur `reported` ohne Merkmal → nur „Gemeldet"; `blocked` → nur Sperrhinweis; offline eigene `unsafe`-Meldung → vorläufiges Abzeichen ohne diese Station, **ohne** Netz; Server lehnt Meldung ab (`rate_limited`) bzw. Sync liefert Merkmal `false` → vorläufiges Abzeichen zurückgenommen, Hinweis sichtbar; gecachtes Bundle ohne Feld (Dexie-Eintrag aus altem Stand) → kein Fehler, Station zählt; alle Stationen gemeldet → ruhiger Hinweis, kein Abschluss-Bildschirm. | Texte nur in `texts.ts`, kein Druck („im Zweifel auslassen", nie „noch schnell"); Logik in `data/`, nicht im JSX; `App.tsx` wächst nur um Anzeige (Budget beachten, sonst vorher E-Schritt); „Ort unsicher" weiter ≤ 2 Taps. | test-writer → implementer → reviewer |
| A4 | **[V]** CLI `pnpm station:alerts` (listet Alarme mit Anzahlen, ältester Meldung, Notizen); Exit-Codes von `station:set-status`, `station:alerts`, `route:validate`, `qr:generate` testen (N7) | AK-REP-10, AK-REP-05, AK-CLI-03, AK-ROUTE-01/02 | `apps/api/src/domain/station-admin.ts` (`listAlerts`), `scripts/station-alerts.ts`, `package.json` (Skript), Tests unter `apps/api/test/` | rot: Station über/unter Schwelle, gesperrt → nicht gelistet; Exit-Code ≠ 0 ohne `DATABASE_URL` | Gleiche Zählregel wie A2 (eine Funktion, nicht kopiert); Notizen nur in der CLI-Ausgabe | test-writer → implementer → reviewer |
| A5 | **[V]** Netz-Nits: Antwort-Body am selben Abbruch wie die Header (N2); überholende `loadRoute`-Aufrufe (N8: neuere Anfrage gewinnt) | AK-LOAD-02, AK-SYNC-06 | `apps/web/src/data/http.ts`, `apps/web/src/data/route.ts`, `apps/web/test/resilience.test.tsx` | rot: hängender Body → Abbruch nach Timeout; zwei überlappende Ladevorgänge → kein falscher Offline-Hinweis | Fake-Timer statt echter Wartezeiten | test-writer → implementer → reviewer |

## Phase B – Abweichungen von der SPEC (Review §2)

| # | Schritt | AK | Dateien | Sicherheitsnetz | Prüfhinweis | Agent |
|---|---|---|---|---|---|---|
| B1 | **[V] [?]** Server summiert gespeicherte `scan_xp`/`quest_xp` statt mit neuesten `xpRules` neu zu rechnen (Befund 10; Entscheidung OE4) | AK-XP-03, AK-LOAD-04 | `apps/api/src/domain/sync.ts` (Fortschritt), `apps/api/test/sync.test.ts` | rot: neue Routenversion mit anderen `xpRules` ändert bisherige XP nicht | Spalten werden wirklich gelesen; Abzeichen-Logik unverändert | test-writer → implementer → reviewer |
| B2 | **[V]** XP-Anzeige „X bestätigt + Y vorläufig", bestätigte Summe vom Server (Befund 9) | AK-XP-01 | `apps/web/src/data/progress`-Teil von `sync.ts`/`badge.ts`, Anzeige in `App.tsx`, `texts.ts`, `apps/web/test/sync-ui.test.tsx` | rot: Server-Summe weicht von lokaler Rechnung ab → Server-Wert wird angezeigt | Texte zentral in `texts.ts` | test-writer → implementer → reviewer |
| B3 | **[V]** Kamera verweigert → Weg zum Ersatzweg sichtbar (Befund 11) | AK-SCAN-08 | `App.tsx` (Scan-Ansicht), `apps/web/test/scan-flow.test.tsx` | rot: verweigerte Berechtigung zeigt Ersatzweg-Knopf (bei `fallback.enabled`) | nur bei aktivem Ersatzweg (AK-FALL-09) | test-writer → implementer → reviewer |
| B4 | **[V]** Offline-Banner beim Wechsel in den Offline-Modus, Text laut SPEC §3C (Befund 12) | AK-SYNC-05, AK-LOAD-02 | `App.tsx`, `texts.ts`, `apps/web/test/sync-ui.test.tsx` | rot: `offline`-Ereignis → Banner mit SPEC-Text | – | test-writer → implementer → reviewer |
| B5 | **[I] [?]** `GET /api/players/me/progress`: bauen oder aus SPEC §7 streichen (Befund 13; Empfehlung: streichen, die Sync-Antwort liefert den Fortschritt) | – | `docs/SPEC.md` | – | – | `architect` |

## Phase C – Sicherheitsnetz für Sync und schwache Tests (Review §3)

| # | Schritt | AK | Dateien | Sicherheitsnetz | Prüfhinweis | Agent |
|---|---|---|---|---|---|---|
| C1 | **[T]** Fake-Server validiert Anfragen und Antworten mit den geteilten Zod-Schemas, verlangt Registrierung, prüft Antworten mit `isCorrectAnswer` und gesperrte Stationen | AK-SYNC-*, AK-QUEST-04 | `apps/web/test/fake-server.ts` | bestehende Web-Tests müssen grün bleiben; ein absichtlich falsches Ereignis im Test → 400 | Fake nutzt nur `@qurally/shared`, nie `apps/api` | test-writer → reviewer |
| C2 | **[T] [?]** Vertragstest: `syncOutbox` (Web) gegen echte `buildApp` (API) mit Test-DB | AK-SYNC-02/04, AK-FALL-07, AK-PROF-02 | Ort ist die Rückfrage: eigenes Workspace-Paket `tests/contract/` (Empfehlung; einzige Stelle, die beide Apps importieren darf, ohne neue externe Abhängigkeit) oder dokumentierte Ausnahme in `check:layers` | Offline-Ereignisse → Sync → Server-Fortschritt; Ablehnung nimmt zurück | Ausnahme in `check:layers` ausdrücklich, nicht per Wildcard | test-writer → reviewer |
| C3 | **[T]** API-Lücken: AK-REP-05 (Integration), AK-PRIV-03 (DB-Durchsuchung), AK-PRIV-01 und AK-FALL-06 auf dem Sync-Pfad (Logs), AK-SYNC-08 (Vergleich mit/ohne `clientTs`) | wie genannt | `apps/api/test/*.test.ts` | – | Jeder Test einmal durch Mutation rot gesehen | test-writer → reviewer |
| C4 | **[T]** E2E-Lücken: AK-PRIV-02 inkl. Service-Worker-Anfragen, AK-PWA-02 so, dass er fehlschlagen kann, `getByText(…, { exact: true })` | wie genannt | `apps/web/e2e/*.spec.ts` | – | wie C3 | test-writer → reviewer |

## Phase D – API-Refactoring (Review §6 API)

Sicherheitsnetz für alle: `apps/api/test/*` plus Vertragstest C2, unverändert grün.

| # | Schritt | Dateien | Prüfhinweis | Agent |
|---|---|---|---|---|
| D1 | **[R]** `domain/players.ts` (`registerPlayer`, `deletePlayer`) aus `app.ts` | `apps/api/src/app.ts`, `apps/api/src/domain/players.ts` | Transaktionsgrenzen unverändert | implementer → reviewer |
| D2 | **[R]** `domain/route-bundle.ts` (`getBundle`, ETag) | `app.ts`, `domain/route-store.ts`, `domain/route-bundle.ts` | ETag-Wert byte-gleich | implementer → reviewer |
| D3 | **[R]** `routes/{health,routes,players,sync}.ts` als Fastify-Plugins; `app.ts` behält Logger, Fehlerhandler, Rate-Limit. Regel: kein `db/schema` in `app.ts`/`routes/` | `apps/api/src/app.ts`, `apps/api/src/routes/*`, `scripts/check-layers.mjs` | Rate-Limit- und Log-Konfiguration gilt weiter für alle Routen (`rate-limit.test.ts`, `logging.test.ts`) | implementer → reviewer |
| D4 | **[R]** `domain/sync.ts` teilen, Teil 1: `domain/sync/station-status.ts` (`flagStation`, Alarm), `domain/progress.ts`, `domain/sync/index.ts` (Ablauf, Transaktion) | `apps/api/src/domain/sync*` | Zeilensperre (`FOR UPDATE`) wandert unverändert mit | implementer → reviewer |
| D5 | **[R]** Teil 2: `domain/sync/{scan,quest,fallback,report}.ts`; Budget für `sync.ts`-Ausnahme entfernen | wie D4, `scripts/check-layers.mjs` | Je Ereignistyp ein Modul, gemeinsame Hilfen nicht dupliziert | implementer → reviewer |
| D6 | **[R] [?] [ADR 0008]** Quest-Typ-Registry in `shared` (nur `choice`, `text`) | `packages/shared/src/quest-types/*`, `route-schema.ts`, `answer.ts` | `z.infer` liefert dieselbe Union, keine Casts; AK-ROUTE-*, AK-QUEST-* unverändert grün | implementer → reviewer |
| D7 | **[R]** Test-Hilfen (`TRUNCATE`, E2E-Abfragen) aus `apps/api/src/db/admin.ts` in Testcode (Befund 19) | `apps/api/src/db/admin.ts`, `apps/api/test/helpers.ts`, E2E-Setup | Produktionscode enthält kein `TRUNCATE` mehr | implementer → reviewer |

## Phase E – Web-Refactoring (Review §6 Web)

Sicherheitsnetz: Komponententests, Fake-Server (C1), Vertragstest (C2), E2E. Ziel: `App.tsx` ≤ ~150 Zeilen.

| # | Schritt | Dateien | Prüfhinweis | Agent |
|---|---|---|---|---|
| E1 | **[R]** Dexie-Abfragen nach `data/queries.ts`, `data/issues.ts`, `hooks/useLive.ts`; Regel: kein `dexie` in `App.tsx`/`features/` | `App.tsx`, `data/*`, `hooks/*`, `check-layers.mjs` | Abfragen 1:1, nur verschoben | implementer → reviewer |
| E2 | **[R]** `useSync` nach `hooks/useSync.ts` | `App.tsx`, `hooks/useSync.ts` | reine Verschiebung | implementer → reviewer |
| E3 | **[V]** Doppel-Timer bei `online` + `visibilitychange` (erster Timer geht verloren) | `hooks/useSync.ts`, Test mit Fake-Timern | AK-SYNC-05 | test-writer → implementer → reviewer |
| E4 | **[R]** `features/common`, `features/safety`, `features/account` | `App.tsx`, `features/*` | Texte bleiben in `texts.ts` | implementer → reviewer |
| E5 | **[R]** `features/scan`, `features/fallback` | dto. | Kamera-Stream wird weiter gestoppt | implementer → reviewer |
| E6 | **[R]** `features/quest` (Ansicht je Quest-Typ, Gegenstück zu D6), `features/report`, `features/badge` | dto. | „Ort unsicher" weiter ≤ 2 Taps (AK-SAFE-03) | implementer → reviewer |
| E7 | **[R]** `features/sync`, `features/route`, `features/station`; `RouteView` mit `useRouteBundle`; Budget `App.tsx` auf 500 bzw. Ausnahme entfernen | dto., `check-layers.mjs` | Befund 3 ist schon behoben: hier nur verschieben, Gating-Verhalten nicht ändern | implementer → reviewer |

## Phase F – Werkzeuge und Qualitätstore (Review §4)

| # | Schritt | Dateien | Prüfhinweis | Agent |
|---|---|---|---|---|
| F1 | **[I]** `check:layers` schärfen: verbleibende Regeln aus ARCHITEKTUR §1, eingefrorene Budgets = Ist, eigener Test mit absichtlich verletzenden Beispieldateien | `scripts/check-layers.mjs`, Test dazu | Der Selbsttest muss bei jeder Regel einmal rot werden | test-writer → implementer → reviewer |
| F2 | **[I] [?]** Commit-Hook nur `*.md` als Doku, `-a` nur mit Vollprüfung, Index statt Arbeitsbaum prüfen (Befund 15); `guard-bash` `rm`/`-n`-Regeln (17); `Bash(pnpm *)` einschränken (16, Q6) | `.claude/hooks/*`, `.claude/settings.json` | Änderungen an `.claude/` nur mit ausdrücklicher Freigabe des Entwicklers | implementer → security-reviewer |
| F3 | **[I]** CI: `timeout-minutes`, `permissions: contents: read`, Actions per SHA gepinnt, `pnpm audit` zuerst, Playwright-Report als Artefakt (18); **erster echter CI-Lauf** | `.github/workflows/ci.yml` | CI-Lauf grün mit Link | implementer → reviewer |

## Phase G – Betrieb (Schritt 10) und Datenschutz (Review §5)

| # | Schritt | AK | Dateien | Sicherheitsnetz | Prüfhinweis | Agent |
|---|---|---|---|---|---|---|
| G1 | **[V]** API liefert Web-Build aus (ADR 0005), `/q/*` ohne Service Worker erreichbar | AK-SCAN-09 | `apps/api/src/app.ts`/`routes/static.ts` | rot: `GET /q/<token>` → `index.html` | Kein Verzeichnislisting, `/api/*` unverändert | test-writer → implementer → reviewer |
| G2 | **[I]** Dockerfile (ohne Root, keine Geheimnisse im Image), `docker-compose` (app, db, caddy), DB-Port nicht veröffentlicht, DB-Rolle ohne Superuser, `NODE_ENV=production` | – | `infra/*` | Smoke-Test gegen Compose-Stack (Health, Route, Sync) | `docker history` ohne Secrets | implementer → security-reviewer |
| G3 | **[I] [?]** Caddy: HTTPS/HSTS, CSP (`wasm-unsafe-eval` messen, Q3; sonst ADR), `Permissions-Policy`, `Referrer-Policy: no-referrer`, Zugriffslog aus/ohne IP, Schwärzung von `/q/*`, `trustProxy` nur auf Caddy | AK-PRIV-01/02, AK-PWA-03 | `infra/Caddyfile`, `app.ts` | E2E gegen Stack: Scanner startet unter CSP | Header per `curl -I` zeigen | implementer → security-reviewer |
| G4 | **[V] [?] [ADR]** Server-Aufräumen `pnpm data:cleanup`: Meldungen `resolved` + 90 Tage, inaktive Spieler nach Frist, Notizen beim Löschen entfernen, `last_seen_at` entfällt (Schemaänderung) (Befunde 20–22, Q4/Q5, Entscheidung OE3) | AK-PRIV-03, neue AK-IDs im ADR | `apps/api/src/domain/retention.ts`, `scripts/`, Migration | rot: alte Daten werden gelöscht, frische bleiben | Löschen nur mit Fristen aus der SPEC, Trockenlauf-Option | architect (ADR) → test-writer → implementer → privacy-reviewer |
| G5 | **[V]** Client: Ersatzweg-Ereignisse mit Position verfallen nach Frist in der Outbox (Befund 23); „Daten löschen" leert auch SW-Caches (24) | AK-FALL-06, AK-PROF-03 | `apps/web/src/data/outbox`/`account.ts` | rot: altes Ereignis wird verworfen und angezeigt | Verfall darf keine anderen Ereignisse blockieren | test-writer → implementer → privacy-reviewer |
| G6 | **[I]** Backup (verschlüsselt, kurzlebig) und **einmal Wiederherstellung ausprobiert**; frische Produktionsschlüssel; `docs/BETRIEB.md` (inkl. Alarm-Routine nach ADR 0007), `docs/FELDTEST.md`, Stationsauswahl-Checkliste (SPEC §10.1 Nr. 5) | – | `infra/`, `docs/` | Wiederherstellungsprotokoll | Keine Schlüssel in Doku | implementer + architect |
| G7 | **[I]** Unabhängige Reviews vor dem Feldtest: `security-reviewer`, `privacy-reviewer`, `reviewer` über den Stand nach G6; ⚖ Datenschutzinfo, Impressum, Einverständnis, Aufkleber-Genehmigung durch den Entwickler (keine Rechtsberatung) | alle | – | – | Befunde → neue Schritte, nicht nebenbei | Reviewer-Agenten, Entwickler |

## Phase H – Selbsttest und Feldtest

| # | Schritt | Prüfhinweis |
|---|---|---|
| H1 | Selbsttest am Handy (SPEC §11 Stufe 2, Tunnel): Checkliste `docs/FELDTEST.md`, iOS + Android, Flugmodus, GPS in der Altstadt, CSP mit echtem Scanner | Befunde als Issues |
| H2 | Feldtest mit 3–5 Erwachsenen (A3) auf dem EU-Server, Operator-Alarm-Routine wird gelebt | ⚖ Einverständnis vorher |
| H3 | Auswertung → Korrekturschritte; v1 gilt als abgenommen, wenn alle AK-IDs aus SPEC §14 durch Tests abgedeckt und grün sind, `check:layers` ohne Ausnahmen über 500 Zeilen läuft, die CI grün ist und der Feldtest keine offenen Sicherheitsbefunde hinterlässt | Entscheidung durch den Entwickler |

---

## Offene Entscheidungen (vor den markierten Schritten)

| # | Frage | Empfehlung | betrifft |
|---|---|---|---|
| OE1 | Soll eine Station mit offener `unsafe`-Meldung einen **stärkeren Hinweis** zeigen („Als unsicher gemeldet – im Zweifel auslassen")? Ausgleich für die entfallene Auto-Sperre. | **Entschieden (2026-11-24): Variante B.** Stärkerer Hinweis **und** die Station zählt nicht für das Abzeichen; bleibt spielbar, nie Auto-Sperre. A (nur Text) und C (Bestätigungsdialog) verworfen. Öffentlich über ein abgeleitetes Boolean `unsafeReported`, nicht über `reason` (unzuverlässig). ADR 0009, SPEC 0.3, Schritte A3a/A3b | A3a, A3b, SPEC §2, §3 F, §5.3 |
| OE2 | **Reaktionszeit und Routine des Operators** (z. B. Feldtest: vor/während jedes Termins `station:alerts`; Betrieb: täglich). Reicht Log + CLI, oder braucht es vor einer Öffnung jenseits des Freundeskreises einen Benachrichtigungskanal (eigener ADR)? | Für v1 Log + CLI, Routine in `docs/BETRIEB.md`; Kanal nach dem Feldtest entscheiden – **entschieden: Log + CLI (2026-11-24)** | A3/A4, G6 |
| OE3 | **Aufbewahrung** (Q4/Q5): Frist für inaktive Spieler, Notizen beim Löschen entfernen, wer `data:cleanup` wann ausführt (manuell oder Zeitplan im Container), `last_seen_at` streichen | 12 Monate Inaktivität, Notizen beim Spielerlöschen entfernen, Aufräumen manuell wöchentlich im Feldtest; `last_seen_at` streichen – **entschieden wie vorgeschlagen (2026-11-24)** | G4 |
| OE4 | **XP-Quelle** (Befund 10): gespeicherte Werte summieren (wie SPEC §5.1) oder Neuberechnung per ADR festschreiben? | Gespeicherte Werte summieren – **entschieden (2026-11-24)** | B1 |
| OE5 | **Ort des Vertragstests** (C2): eigenes Workspace-Paket `tests/contract/` oder Ausnahme in `check:layers`? Dazu: `GET /api/players/me/progress` streichen (B5)? | `tests/contract/`; Endpoint streichen – **entschieden (2026-11-24)** | C2, B5 |
| OE6 | **ADR 0008** annehmen: Quest-Typ-Registry schon in v1 (nur Struktur), Streckentypen erst mit dem ersten neuen Typ? | Ja – **entschieden: angenommen (2026-11-24)** | D6, E6 |
| OE7 | Eine **einzelne** `unsafe`-Meldung hebt die Abzeichen-Pflicht auf, erreicht aber keine Alarmschwelle (2 Melder). Der Operator sieht sie heute nur über die DB. Soll `station:alerts` zusätzlich Stationen mit `unsafeReported` unter der Schwelle als **Info** listen (keine Log-Zeile, Alarmregel unverändert)? | Ja, als Ergänzung in A4 (AK-REP-10 erweitern); kein neuer Kanal – **entschieden: ja (2026-11-24)** | A4, ADR 0009 |
| OE8 | Sollen an einer als unsicher gemeldeten Station weiter **XP** vergeben werden (heute: ja, AK-REP-04)? XP sind ein kleiner Anreiz, den Ort zu betreten. | XP unverändert lassen (kosmetisch, Abzeichen ist der Hauptanreiz, die Station ist ja nicht gesperrt); nach dem Feldtest neu bewerten – **entschieden: XP unverändert (2026-11-24)** | A3a, AK-REP-04 |

---

## Nach v1 (nur Ausblick, nichts davon wird in v1 gebaut)

Jede Idee wird vor dem Bau gegen SPEC §10.1 geprüft und bekommt eigene AK-IDs.

| Idee | Sicherheits-/Datenschutzprüfung | Voraussetzung |
|---|---|---|
| Begleiter „Quri" mit Leveln | Level nur aus besuchten Orten, nie aus Tempo, Serien oder Tageszielen | XP-Quelle geklärt (OE4) |
| Sticker pro Station | Sammeln ohne Zeitdruck, keine „nur heute"-Sticker | Routenformat-Erweiterung → ADR |
| Illustrierte Karte | Kacheln/Grafik selbst ausgeliefert, keine Drittanbieter, keine Live-Position als Pflicht (SPEC §1, F15) | ADR (Karte, Assets) |
| Bonus-Überraschungen | Zufall erlaubt, aber keine Zeitfenster, keine Verknappung, die zum Eilen anreizt | ADR |
| Neue Quest-Arten | Über die Registry (ADR 0008), keine Eingabe in Bewegung, keine Zeitmessung | ADR je Typ |
| Routen für Sportler und Familien | Neue Streckentypen nur mit eigenen Sicherheitsregeln (SPEC §10.1 Nr. 10–12), ⚖ Minderjährige (§10.4) | ADR je Streckentyp |
