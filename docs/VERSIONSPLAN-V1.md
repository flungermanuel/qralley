# Versionsplan bis v1 (MVP)

Stand: 2026-11-25 · baut auf `docs/V1-FUNDAMENT.md` auf (dort stehen die Einzelschritte mit AK-IDs, Dateien und Prüfhinweisen) · Entscheidungen: ADR 0007–0009

## Ziel von v1

v1 ist das MVP, mit dem **du selbst eine Route bauen und testen kannst**: Route als Datei anlegen und prüfen, QR-Codes erzeugen und ausdrucken, die App auf dem Handy spielen (online und offline), Meldungen und Alarme bearbeiten. Dazu ist der Code in Schichten getrennt, testbar und ohne Monolithen. **Keine neuen Spielfunktionen** (Quri, Sticker, Karte, neue Quest-Arten, Sportler-/Familienrouten kommen nach v1). Eine Oberfläche zum Routenbau (Editor) gehört nicht zu v1: Routen entstehen als `*.route.json` und werden mit den vorhandenen Befehlen geprüft und veröffentlicht.

## Regeln für jede Version

- **Ein Thema pro Version.** Jede Version besteht aus wenigen kleinen Schritten (ein Commit je Schritt, Schritt-IDs wie im Fahrplan, z. B. A2).
- **Fertig**, wenn: alle Schritte der Version committet sind, `pnpm check:layers`, `lint`, `typecheck`, `test` (und bei UI-Änderungen `test:e2e`) mit Exit-Code 0 laufen, ein unabhängiger `reviewer` den Stand gesehen hat und die Doku (SPEC, ADR, Fahrplan) mit dem Code übereinstimmt.
- **Reihenfolge** wie unten; Versionen bauen aufeinander auf. Ein Git-Tag (`v1.1` …) setze ich nur, wenn du es sagst.
- Jede Version endet mit einer kurzen Prüfhilfe für dich (was geändert, was besonders prüfenswert, was nicht gemacht).

## Überblick

| Version | Thema | Schritte (Fahrplan) | Du kannst danach |
|---|---|---|---|
| **1.1** | Meldungen ohne Auto-Sperre, Operator-Alarm | A1 ✔, A1-Nachzug (Doku ✔), A2, A3, A4 | Alarme sehen und Stationen von Hand sperren |
| **1.2** | „Unsicher gemeldet" zählt nicht fürs Abzeichen | A3a, A3b | Unsichere Stationen ohne Spielzwang auslassen |
| **1.3** | Verhalten gleich SPEC | A5, B1–B5 | XP, Kamera, Offline-Banner stimmen mit der SPEC |
| **1.4** | Sicherheitsnetz für Sync und Tests | C1–C4 (+ C5) | Client und Server sind per Vertragstest verbunden |
| **1.5** | API in Schichten | D1–D5, D7 | `app.ts` und `sync.ts` sind aufgeteilt |
| **1.6** | Quest-Typ-Registry | D6 | Neue Quest-Typen sind als Modul möglich |
| **1.7** | Web: Daten und Hooks | E1–E3 | Keine Datenbankzugriffe mehr in der UI |
| **1.8** | Web: Oberfläche in Features | E4–E7 | `App.tsx` ≤ ~150 Zeilen |
| **1.9** | Werkzeuge und Qualitätstore | F1–F3 | `check:layers` schlägt bei Verstößen an, CI läuft |
| **1.10** | Auslieferung und Betrieb | G1–G3 | Alles läuft als Docker-Stack mit HTTPS |
| **1.11** | Datenschutz und Aufräumen | G4, G5 | Fristen und Löschen sind umgesetzt |
| **1.12** | Eigene Route bauen und selbst testen | G6 + neu: Routen-Anleitung | **Eine eigene Route erstellen, drucken, am Handy testen** |
| **1.13 = v1** | Reviews und Abnahme | G7, H1–H3 | v1 abgenommen |

## Details je Version

### 1.1 – Meldungen ohne Auto-Sperre, Operator-Alarm
Ziel: Meldungen sperren nie von selbst (ADR 0007); bei 2–3 Meldungen entsteht ein Alarm für das Team.
- **A1** ✔ erledigt (Commit `3572600`): keine Auto-Sperre, fehlende Stationszeile wird angelegt.
- **A1-Nachzug [I]:**
  - ✔ Doku erledigt (2026-11-25): ADR 0007 (Folgen, Code-Punkt) und Fahrplan A1/A2 verweisen nicht mehr auf `applyReport`; die Regel „Meldungen sperren nie" steht allein im Upsert von `flagStation`.
  - ✔ Testdaten mit dem Grund „unsafe reports" auf „Baustelle" geändert (Commit `b3639a1`).
- **A2:** ✔ erledigt (2026-11-25). Reine Alarmlogik und Schwellen-Konfiguration (Standard 3 / 2) in `shared`.
- **A3:** ✔ erledigt (2026-11-25; offen: Entscheidung zu Kontolöschung und Alarm, siehe ADR 0007 „Folgen"). Alarm im Sync, genau eine Log-Zeile `station_alert` ohne Spielerbezug, Notiz oder Position.
- **A4:** CLI `pnpm station:alerts` (inkl. Info-Liste einzelner „unsicher"-Meldungen, OE7) und Exit-Code-Tests der Befehle.
- Prüfen: Alarm erscheint genau einmal, auch bei parallelen Meldungen; Log enthält keine personenbezogenen Daten.

### 1.2 – „Unsicher gemeldet" zählt nicht fürs Abzeichen
Ziel: Kein Anreiz, einen sich unsicher anfühlenden Ort zu betreten (ADR 0009).
- **A3a:** Server und `shared`: abgeleitetes Feld `unsafeReported`, gemeinsame Regel `countingStations`, Abzeichen wird nie entzogen.
- **A3b:** Client: stärkerer Hinweis, vorläufiges Abzeichen nach derselben Regel, auch offline.
- Prüfen: Meldung öffnet keine Sperre; Bundle enthält keine Notiz und keine Anzahl; „Ort unsicher" bleibt in ≤ 2 Taps.

### 1.3 – Verhalten gleich SPEC
Ziel: Die App tut, was die SPEC sagt.
- **A5** Netz-Nits (hängender Antwort-Body, überholende Ladevorgänge).
- **B1** XP aus gespeicherten Werten; **B2** XP-Anzeige „bestätigt + vorläufig"; **B3** Kamera verweigert → Weg zum Ersatzweg; **B4** Offline-Banner nach SPEC; **B5** `GET /api/players/me/progress` streichen.
- Prüfen: jede Abweichung hat einen roten Test, der danach grün ist.

> **Empfehlung:** Nach 1.3 einmal die Mini-Route probehalber am Handy durchspielen (Tunnel, wie in `CLAUDE.md` beschrieben). Das ist ein früher, günstiger Realitätscheck und ersetzt nicht den Selbsttest in 1.12.

### 1.4 – Sicherheitsnetz für Sync und Tests
Ziel: Refactoring ohne Angst. Der Fake-Server prüft heute nichts; Vertragsfehler fallen nicht auf.
- **C1** Fake-Server validiert mit den geteilten Zod-Schemas; **C2** Vertragstest `syncOutbox` gegen die echte API in `tests/contract/`; **C3** API-Testlücken; **C4** E2E-Lücken.
- **C5 (neu, [T]):** Wackelige Web-Tests untersuchen. Beim Commit von A1 schlug der Hook-Lauf einmal mit 2 Web-Tests (`sync-ui.test.tsx`, Timeout bei `findByText`) und den API-Tests fehl, obwohl dieselben Tests danach dreimal grün liefen. Vermutung: knappe Timeouts bei Last. Ursache klären, nicht nur wiederholen.
- Prüfen: jeder neue Test wurde einmal durch absichtliches Kaputtmachen rot gesehen.

### 1.5 – API in Schichten
Ziel: HTTP, Regeln und Datenbank getrennt (SRP).
- **D1–D3** `domain/players`, `domain/route-bundle`, `routes/*` als Fastify-Plugins; **D4–D5** `sync.ts` je Ereignistyp aufteilen (Zeilensperre wandert unverändert mit); **D7** Test-Hilfen aus dem Produktionscode.
- Reine Refactorings: kein Test wird geändert, rote Tests sind Fehler im Refactoring. Regeln in `check:layers` werden im selben Commit aktiviert.

### 1.6 – Quest-Typ-Registry
Ziel: Erweiterbar ohne Umbau (ADR 0008, Open/Closed).
- **D6** Registry in `packages/shared` mit den vorhandenen Typen `choice` und `text`, ohne Verhaltensänderung.
- Prüfen: `z.infer` liefert dieselben Typen ohne Casts, alle Routen- und Quest-Tests unverändert grün.

### 1.7 – Web: Daten und Hooks
Ziel: UI greift nicht mehr direkt auf Dexie zu.
- **E1** Abfragen nach `data/queries`, `data/issues`, `hooks/useLive`; **E2** `useSync` auslagern; **E3 [V]** Doppel-Timer bei `online` + `visibilitychange` beheben (roter Test mit Fake-Timern).

### 1.8 – Web: Oberfläche in Features
Ziel: Der UI-Monolith `App.tsx` verschwindet.
- **E4** common/safety/account; **E5** scan/fallback; **E6** quest/report/badge; **E7** sync/route/station, `App.tsx` nur noch Zusammenbau (≤ ~150 Zeilen), Größenbudget auf 500.
- Prüfen: Kamera-Stream wird weiter gestoppt; „Ort unsicher" weiter ≤ 2 Taps; Texte bleiben in `texts.ts`.

### 1.9 – Werkzeuge und Qualitätstore
Ziel: Die Qualitätsregeln sind verlässlich und nicht umgehbar.
- **F1** `check:layers` schärfen und selbst testen; **F2 [?]** Commit-Hook und `.claude/`-Einstellungen härten (nur mit deiner ausdrücklichen Freigabe, Befunde 15–17); **F3** CI absichern und **erstmals wirklich laufen lassen**.

### 1.10 – Auslieferung und Betrieb
Ziel: Die App läuft so, wie du sie später testen und teilen willst.
- **G1** API liefert den Web-Build aus (`/q/*` ohne Service Worker); **G2** Docker-Stack (ohne Root, DB-Port nicht veröffentlicht, DB-Rolle ohne Superuser); **G3 [?]** Caddy mit HTTPS, Sicherheits-Headern, CSP (`wasm-unsafe-eval` prüfen), Log-Schwärzung für `/q/*`.
- Prüfen: Header per `curl -I`; Scanner startet unter der CSP.

### 1.11 – Datenschutz und Aufräumen
Ziel: Daten werden nur so lange gehalten, wie nötig (⚖ Fristen sind nur ein Hinweis, keine Rechtsberatung).
- **G4 [ADR]** `pnpm data:cleanup` (inaktive Spieler nach 12 Monaten, Notizen beim Löschen entfernen, `last_seen_at` entfällt; Schemaänderung, vorher ADR); **G5** Ersatzweg-Ereignisse mit Position verfallen in der Outbox, „Daten löschen" leert auch die Service-Worker-Caches.

### 1.12 – Eigene Route bauen und selbst testen
Ziel: **Das, was du für v1 brauchst.** Du erstellst allein eine Route und spielst sie.
- **G6** Backup (einmal wiederhergestellt), frische Schlüssel, `docs/BETRIEB.md` (inkl. Alarm-Routine), `docs/FELDTEST.md`, Checkliste zur Stationsauswahl.
- **R1 (neu, [I]):** `docs/ROUTE-ERSTELLEN.md`: Schritt für Schritt von der leeren Datei zur gespielten Route (Routenformat, `route:validate`, `route:publish`, `qr:generate`, Druck, Handy-Test). Dazu eine kommentierte Vorlage-Route.
- **R2 (neu, [V], falls nötig):** Verständliche Fehlermeldungen des Validators für typische Fehler (fehlende `safetyNote`, falscher Gelände-Typ, Koordinaten) – nur wenn du beim Probieren darüber stolperst.
- **H1** Selbsttest am Handy (Tunnel, iOS und Android, Flugmodus, Standort, Scanner) nach Checkliste.
- Prüfen: Du baust die Route nur anhand der Anleitung; was dir fehlt, wird als Befund aufgenommen.

### 1.13 = v1 – Reviews und Abnahme
- **G7** `security-reviewer`, `privacy-reviewer`, `reviewer` über den Gesamtstand; ⚖-Punkte (Datenschutzerklärung, Impressum, Einverständnis, Aufkleber-Genehmigung) entscheidest du.
- **H2** Test mit 3–5 Erwachsenen, Operator-Alarm-Routine wird gelebt. **H3** Auswertung und Abnahme.
- v1 gilt als abgenommen, wenn alle AK-IDs der SPEC §14 durch grüne Tests abgedeckt sind, `check:layers` ohne Ausnahmen über 500 Zeilen läuft, die CI grün ist und der Test keine offenen Sicherheitsbefunde hinterlässt.

## Abhängigkeiten und Risiken

- **1.4 vor 1.5–1.8:** Das Sicherheitsnetz muss stehen, bevor Code verschoben wird.
- **1.6 vor 1.8:** E6 baut die Quest-Ansicht nach dem Muster der Registry.
- **1.12 hängt an 1.10:** Wer die Route nicht nur am lokalen Tunnel testen will, braucht den Stack aus 1.10. Für einen ersten Handytest reicht der Tunnel schon heute (siehe Empfehlung nach 1.3).
- **Offene Rückfragen vor Schritten:** F2 (Änderungen an `.claude/` brauchen deine Freigabe), G3 (CSP und `wasm-unsafe-eval`), G4 (ADR zur Aufbewahrung).
- **⚖ Hinweise** (keine Rechtsberatung): Datenschutzerklärung, Impressum, Einverständnis der Testpersonen, Genehmigung für QR-Aufkleber im öffentlichen Raum liegen bei dir.

## Nach v1 (Ausblick, nicht Teil dieses Plans)

Quri und Level, Sticker pro Station, illustrierte Karte, Bonus-Überraschungen, neue Quest-Arten, Routen für Sportler und Familien, Heimweg-/Weg-Bingo, Duo-Quest. Jede Idee wird vor dem Bau gegen SPEC §10.1 geprüft und braucht eigene AK-IDs und ein ADR (siehe `docs/V1-FUNDAMENT.md`, Abschnitt „Nach v1").
