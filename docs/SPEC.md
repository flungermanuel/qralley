# qurally – Spezifikation der Mini-Version

Status: **Entwurf zur Prüfung** · Version 0.1 · Sprache der Doku: Deutsch, Code-Bezeichner: Englisch

> Rechtliche Punkte in diesem Dokument sind mit **⚖ Hinweis** markiert. Das ist keine Rechtsberatung, sondern eine Erinnerung, dass dort vor dem Feldtest bzw. Livegang jemand Kundiges draufschauen sollte.

---

## 0. Annahmen (statt Rückfragen)

| # | Annahme | Auswirkung, falls falsch |
|---|---|---|
| A1 | Die Route wird von dir selbst vor Ort ausgesucht, QR-Codes werden selbst gedruckt und angebracht. | Bei Fremdpersonal: Prozess für Anbringung/Wartung nötig. |
| A2 | XP und Abzeichen sind in der Mini-Version **rein kosmetisch** (keine Preise, keine Rangliste). Deshalb ist Betrug (Teilen von Codes, GPS-Fälschung) bewusst ein geringes Risiko. | Sobald Events/Partner-Belohnungen kommen, muss das Betrugsmodell neu bewertet werden (→ ADR). |
| A3 | Spieler sind überwiegend Erwachsene/Jugendliche mit eigenem Smartphone; keine Registrierung, kein Alter abgefragt. | Bei Kindern als Zielgruppe: Datenschutz/Jugendschutz neu prüfen. ⚖ |
| A4 | Verlust des Geräts/der Browserdaten = Verlust des Fortschritts (kein Konto, keine Wiederherstellung). | Optional später: Export-/Wiederherstellungscode. |
| A5 | Eine Sprache (Deutsch) in der UI; Routen-Format enthält aber schon `locale`. | – |
| A6 | Ein Server, eine Region (Innsbruck), kein Lastproblem (< 100 gleichzeitige Spieler). | – |

---

## 1. Ziel und Nicht-Ziele

### Ziel (Mini-Version, Wochen 1–2)
Eine PWA, mit der eine Person eine Stadtroute mit 3–4 Stationen abläuft: an jeder Station QR-Code scannen, eine Frage beantworten, XP sammeln; am Ende gibt es ein Abzeichen. Alles funktioniert auch ohne Netz und wird später synchronisiert. Die Route ist ein validiertes Datenformat, kein Code.

### Nicht-Ziele (bewusst nicht in dieser Version)
- Kein Login, keine Konten, keine E-Mail/Telefonnummer.
- Keine Admin-/Creator-Oberfläche (Route = Datei im Repo + CLI-Skripte).
- Kein Event-Modus, keine Einmal-Codes, keine Abschlussparty.
- Keine Partner-Belohnungen, keine Gutscheine.
- Keine KI-Funktionen (Schaden-Warner, Wetter-/Lawinenwarner, Betrugserkennung).
- Keine Rangliste, keine Tages-Serien, keine Zeitrennen, keine Push-Benachrichtigungen.
- Keine Quests in alpinem/gefährlichem Gelände (wird vom Validator technisch verhindert).
- Keine native App, kein App-Store.
- Keine Karte mit Live-Position als Pflichtbestandteil (Stationsliste mit Hinweistext reicht; eine einfache Karte ist optional, siehe §15).

---

## 2. Begriffe

- **Route**: Geordnete/ungeordnete Menge von Stationen mit Belohnung. Statischer Inhalt (Datei).
- **Station**: Ort mit QR-Code, einer Quest, optionalem Ersatzweg.
- **Quest**: Aufgabe an der Station (Mini: Frage mit Auswahl- oder Textantwort).
- **Besucht / Abgeschlossen**: Station besucht = gültiger Scan (oder Ersatzweg-Check-in). Abgeschlossen = zusätzlich Quest korrekt.
- **Vorläufig / Bestätigt**: Lokal berechneter Fortschritt, solange der Server ihn noch nicht bestätigt hat, bzw. nach Bestätigung. Der **Server ist maßgeblich**.
- **Outbox**: Lokale Warteschlange (IndexedDB) für noch nicht gesendete Ereignisse.
- **Operator**: Du. Pflegt Routen und Stationszustände per CLI.

---

## 3. Nutzerabläufe

**A – Erststart**
1. Spieler öffnet URL (oder scannt einen Poster-QR, der die Start-URL enthält) → App lädt, bietet „Zum Startbildschirm hinzufügen" an (nicht erzwungen).
2. Sicherheitshinweis (Verkehr, nicht beim Gehen aufs Handy schauen, nur öffentliche Orte, keine Abkürzungen über Privatgrund) → „Verstanden".
3. Anonymes Profil wird lokal erzeugt (keine Eingabe). Optional: Spitzname (nur lokal angezeigt, nicht gesendet).
4. Route wird geladen und offline gecacht → Stationsliste.

**B – Station spielen (online oder offline)**
1. Spieler geht zur Station (Hinweistext), tippt „Scannen", erlaubt Kamera.
2. QR wird dekodiert → App prüft Format und ob die Station zur geladenen Route gehört → Station „besucht" (vorläufig), Scan-XP wird angezeigt.
3. Quest erscheint → Spieler antwortet. Falsch: Hinweis, beliebig wiederholbar. Richtig: Station „abgeschlossen", Quest-XP.
4. Ereignisse landen in der Outbox und werden gesendet, sobald Netz da ist.

**C – Offline**
Wie B; Banner „Offline – Fortschritt wird später bestätigt". Nach Netzrückkehr automatischer Sync; Einträge wechseln von „vorläufig" auf „bestätigt". Wird ein Ereignis abgelehnt, wird es mit Grund angezeigt und der vorläufige Fortschritt zurückgenommen.

**D – Zerstörter/fehlender Code (Ersatzweg)**
1. In der Stationsansicht: „Code kaputt oder nicht auffindbar?"
2. App fordert Standort an, prüft lokal Radius und Genauigkeit, zeigt die Ersatzfrage („Frage vor Ort").
3. Richtige Antwort → Station abgeschlossen (Methode `fallback`), reduzierte XP.
4. Automatisch entsteht eine Meldung `code_damaged` → Station wird „gemeldet".

**E – Melden**
Auf jeder Stationsansicht: „Problem melden" (Code beschädigt / Code fehlt / Ort unsicher / Sonstiges, optional kurzer Text). „Ort unsicher" ist in ≤ 2 Taps erreichbar.

**F – Abschluss**
Alle nicht gesperrten Stationen abgeschlossen → Abzeichen-Bildschirm. Offline: „vorläufig, wird bestätigt sobald du online bist".

**G – Profil löschen**
Einstellungen → „Meine Daten löschen": lokale Daten weg, Server löscht Spieler und Fortschritt.

---

## 4. Funktionsliste

| ID | Funktion | Muss/Soll |
|---|---|---|
| F1 | Routen-Datenformat, Validierung, Build des Client-Bundles | Muss |
| F2 | Route laden, Offline-Cache, Versionswechsel | Muss |
| F3 | Anonymes Spielerprofil, Registrierung beim ersten Sync, Löschen | Muss |
| F4 | QR-Scan (Kamera, WASM-Decoder) und Token-Prüfung | Muss |
| F5 | Quest beantworten (Auswahl, Text) | Muss |
| F6 | XP und Fortschritt (vorläufig/bestätigt) | Muss |
| F7 | Abzeichen bei Routenabschluss | Muss |
| F8 | Offline-Outbox und idempotenter Sync | Muss |
| F9 | Ersatzweg (GPS + Frage vor Ort) | Muss |
| F10 | Meldungen und Stationszustand (ok/gemeldet/gesperrt) | Muss |
| F11 | Sicherheitshinweise und sicheres UX-Verhalten | Muss |
| F12 | PWA: installierbar, Offline-Start, Update-Verhalten | Muss |
| F13 | Datenschutz: Datensparsamkeit, keine Drittanbieter | Muss |
| F14 | Operator-CLI: Route validieren/veröffentlichen, QR erzeugen, Stationsstatus setzen | Muss |
| F15 | Einfache Kartenansicht der Stationen | Kann (nach Mini) |

---

## 5. Datenmodell

### 5.1 Überblick

Statischer Inhalt (Route, Stationen, Quests, Belohnung) liegt als **validiertes JSON-Snapshot pro Routenversion** in der DB (`route_versions.content`). Laufender Zustand (Stationszustand, Fortschritt, Meldungen, Spieler) ist normalisiert. So bleibt die Routendatei sauber und Creator können später dieselbe Struktur schreiben.

```
route_versions (id, route_id, slug, version, content jsonb, content_hash, published_at)
station_state (route_id, station_id, status ok|reported|blocked, status_changed_at, status_reason)
players        (id uuid, secret_hash, created_at, last_seen_at)
progress       (player_id, route_id, station_id, state visited|completed,
                method scan|fallback, scan_xp, quest_xp, visited_at, completed_at)
                UNIQUE (player_id, route_id, station_id)
badges_awarded (player_id, route_id, badge_id, awarded_at)   UNIQUE (player_id, route_id, badge_id)
sync_events    (player_id, client_event_id uuid, type, result, reason, received_at)
                UNIQUE (player_id, client_event_id)
reports        (id, player_id NULL-bar, route_id, station_id, kind, note, status open|resolved, created_at)
```

Hinweis: `route_id` (stabil, z. B. `innsbruck-altstadt`) und `version` (Ganzzahl) sind getrennt. Fortschritt hängt an `route_id` + `station_id`, nicht an der Version.

### 5.2 Entitäten

**Route** (statisch): `id`, `version`, `title`, `description`, `locale`, `region` (Bounding Box), `order` (`free`|`sequential`; Mini-Default `free`), `xpRules`, `reward`, `stations[]`.

**Station** (statisch): `id` (stabil, Slug), `title`, `hint` (Wegbeschreibung, kein Rätsel), `location {lat,lng}`, `terrain` (nur `urban`|`park`|`plaza`), `safetyNote` (Pflicht), `quest`, `fallback`, `qrKeyVersion` (Zahl, kein Geheimnis).

**Quest** (statisch): `type` (`choice`|`text`), `prompt`, `options[]` (bei `choice`, mit `id`), `answer` (Options-ID bzw. Liste akzeptierter Texte), `explanation` (nach Lösung angezeigt).

**Ersatzweg** (statisch, pro Station): `enabled`, `radiusM` (Default 40), `question` (wie Quest, aber **andere** Frage, vor Ort beobachtbar).

**Belohnung** (statisch): `badge {id, title, description, icon}`; `requires: "all_unblocked_stations"`. Platzhalter für spätere Typen (`partnerVoucher`, `eventCode`) existiert im Schema **nicht**, nur `schemaVersion` ermöglicht Erweiterung.

**Spieler** (Server): `id`, `secret_hash` (SHA-256 des Geräte-Geheimnisses; das Geheimnis liegt nur auf dem Gerät), Zeitstempel. Keine Namen, keine E-Mail, keine IP.

**Fortschritt** (Server, pro Spieler/Station): Zustand `visited`/`completed`, Methode, vergebene XP, Zeitstempel (Serverzeit).

**Meldung** (Server): `kind` ∈ `code_damaged | code_missing | unsafe | other`, `note` (≤ 200 Zeichen, optional), Status. `player_id` wird beim Löschen des Spielers auf NULL gesetzt (Meldung bleibt, Verbindung nicht).

### 5.3 Stationszustand

| Zustand | Bedeutung | Spielbar | Zählt für Abzeichen |
|---|---|---|---|
| `ok` | Normalbetrieb | ja | ja |
| `reported` (gemeldet) | ≥ 1 offene Meldung; Hinweis in UI, Ersatzweg prominent | ja | ja |
| `blocked` (gesperrt) | Aus Sicherheits-/Wartungsgründen nicht spielbar | nein | nein (wird ignoriert) |

Übergänge:
- `ok → reported`: jede Meldung (beliebige `kind`).
- `reported → blocked`: `unsafe`-Meldungen von **≥ 2 verschiedenen Spielern**, oder manuell per `station:set-status`.
- `ok/reported → blocked`: manuell (Operator).
- `reported/blocked → ok`: ausschließlich manuell (Operator); offene Meldungen werden dabei `resolved`.
- Gesperrte Station: Scan/Ersatzweg werden mit `station_blocked` abgelehnt, **auch** wenn der Scan offline vor der Sperre erfolgte (bewusst einfach; Sicherheit vor Fairness; als ADR-0004 festhalten).

Der Zustand ist **Laufzeitdaten**, nicht Teil der Routendatei. Das Client-Bundle enthält ihn als Momentaufnahme (`stationStates`, `serverTime`).

---

## 6. Routen-Datenformat

Einzige Quelle der Wahrheit: Zod-Schema in `packages/shared/src/route-schema.ts`. JSON Schema für Editor-Unterstützung wird daraus generiert (`zod-to-json-schema` o. ä.). Datei: `content/routes/<id>.route.json`.

### 6.1 Beispiel (Koordinaten und Fragen sind **Platzhalter** und vor Ort zu prüfen)

```json
{
  "schemaVersion": 1,
  "id": "innsbruck-altstadt",
  "version": 1,
  "locale": "de-AT",
  "title": "Altstadt-Runde Innsbruck",
  "description": "Vier Orte, ein Spaziergang, ca. 45 Minuten. Lauf in deinem Tempo.",
  "region": { "name": "Innsbruck", "bbox": [11.36, 47.24, 11.43, 47.29] },
  "order": "free",
  "xpRules": { "scanXp": 10, "questXp": 40, "fallbackXpFactor": 0.5 },
  "reward": {
    "badge": {
      "id": "altstadt-entdecker",
      "title": "Altstadt-Entdecker",
      "description": "Alle Stationen der Altstadt-Runde gefunden.",
      "icon": "badge-altstadt.svg"
    },
    "requires": "all_unblocked_stations"
  },
  "stations": [
    {
      "id": "goldenes-dachl",
      "title": "Goldenes Dachl",
      "hint": "Am Ende der Herzog-Friedrich-Straße. Der Code klebt am Infoschild rechts vom Eingang des Museums.",
      "location": { "lat": 47.2685, "lng": 11.3933 },
      "terrain": "plaza",
      "safetyNote": "Fußgängerzone. Auf Radfahrer und Lieferverkehr achten.",
      "qrKeyVersion": 1,
      "quest": {
        "type": "choice",
        "prompt": "Welche Farbe hat das Dach?",
        "options": [
          { "id": "a", "label": "Golden" },
          { "id": "b", "label": "Rot" },
          { "id": "c", "label": "Grün" }
        ],
        "answer": "a",
        "explanation": "Das Dach besteht aus feuervergoldeten Kupferschindeln."
      },
      "fallback": {
        "enabled": true,
        "radiusM": 40,
        "question": {
          "type": "text",
          "prompt": "Wie viele Bogenöffnungen hat der Erker im ersten Stock? (Zahl)",
          "answer": ["3"],
          "explanation": "Platzhalterfrage – vor Ort prüfen."
        }
      }
    },
    {
      "id": "annasaeule",
      "title": "Annasäule",
      "hint": "Maria-Theresien-Straße, mittig auf dem Gehsteigbereich.",
      "location": { "lat": 47.2640, "lng": 11.3947 },
      "terrain": "plaza",
      "safetyNote": "Straßenbahn und Straßenquerung. Nur an der Ampel queren.",
      "qrKeyVersion": 1,
      "quest": {
        "type": "text",
        "prompt": "Welche Jahreszahl steht am Sockel? (Platzhalter)",
        "answer": ["1706"],
        "explanation": "Platzhalter – vor Ort prüfen."
      },
      "fallback": {
        "enabled": true,
        "radiusM": 40,
        "question": {
          "type": "choice",
          "prompt": "Welche Figur steht oben auf der Säule?",
          "options": [
            { "id": "a", "label": "Eine Frau" },
            { "id": "b", "label": "Ein Ritter" }
          ],
          "answer": "a",
          "explanation": "Platzhalterfrage – vor Ort prüfen."
        }
      }
    }
  ]
}
```
(Die echte Beispielroute hat 3–4 Stationen; hier gekürzt.)

### 6.2 Validierungsregeln (`pnpm route:validate`)

Schema-Ebene (Zod): Typen, Pflichtfelder, `schemaVersion === 1`, `order ∈ {free, sequential}`, `terrain ∈ {urban, park, plaza}` (**keine** Werte wie `alpine`, `trail`, `water`), `safetyNote` nicht leer, `note`-/Textlängen begrenzt, `fallback.radiusM` ∈ [20, 100].

Semantische Ebene (zusätzliche Prüfungen):
1. Stations-IDs eindeutig, Slug-Format `[a-z0-9-]+`.
2. Koordinaten innerhalb `region.bbox`.
3. Bei `choice`: `answer` verweist auf existierende Options-ID, mindestens 2 Optionen.
4. Bei `fallback.enabled`: `fallback.question.prompt ≠ quest.prompt`.
5. Keine zwei Stationen < 15 m voneinander entfernt (sonst Ersatzweg-Verwechslung).
6. `xpRules` Werte ganzzahlig ≥ 0, `fallbackXpFactor` ∈ [0, 1].
7. Warnung (kein Fehler) bei < 3 Stationen oder `explanation` fehlt.
8. Fehler enthalten JSON-Pfad (`stations[1].quest.answer`) und eine verständliche Meldung.

### 6.3 Build des Client-Bundles (`pnpm route:build`)
Aus Routendatei wird `RouteBundle` = Route + `stationStates` + `bundleVersion` (`content_hash`) + `serverTime`. Antworten bleiben im Bundle (siehe §8.3, bewusste Entscheidung).

---

## 7. API-Überblick

Alles unter `/api`, JSON, Validierung mit denselben Zod-Schemas (`fastify-type-provider-zod`). Same-Origin (API liefert auch das Web-Build aus) → kein CORS.

| Methode/Pfad | Zweck | Auth |
|---|---|---|
| `GET /api/health` | Lebenszeichen | – |
| `GET /api/routes/:id` | Aktuelles `RouteBundle` (ETag = `content_hash`) | – |
| `POST /api/players` | Spieler registrieren `{playerId, secret}` (idempotent) | – (rate-limited) |
| `POST /api/sync` | Batch von Ereignissen senden, Ergebnisse + aktueller Fortschritt zurück | `Bearer <playerId>.<secret>` |
| `GET /api/players/me/progress?route=:id` | Server-Fortschritt (zum Abgleich) | Bearer |
| `DELETE /api/players/me` | Alle Daten des Spielers löschen | Bearer |

### 7.1 Sync-Ereignisse (`POST /api/sync`)

```jsonc
// Request
{ "events": [
  { "id": "uuid", "type": "scan",             "routeId": "…", "token": "q1.…", "clientTs": 1732350000000 },
  { "id": "uuid", "type": "quest_answer",     "routeId": "…", "stationId": "…", "answer": "a" },
  { "id": "uuid", "type": "fallback_checkin", "routeId": "…", "stationId": "…",
    "position": { "lat": 0, "lng": 0, "accuracyM": 12 }, "answer": "3" },
  { "id": "uuid", "type": "report",           "routeId": "…", "stationId": "…", "kind": "unsafe", "note": "…" }
] }  // max. 50 Ereignisse pro Request

// Response
{ "results": [ { "id": "uuid", "status": "accepted|duplicate|rejected", "reason": "…?" } ],
  "progress": { … Server-Fortschritt inkl. XP und Abzeichen … },
  "stationStates": { … }, "serverTime": 1732350001000 }
```

Ablehnungsgründe (`reason`): `invalid_token`, `unknown_key`, `wrong_route`, `unknown_station`, `station_blocked`, `not_visited`, `answer_incorrect`, `too_far`, `accuracy_too_low`, `fallback_disabled`, `rate_limited`, `malformed`.

Position wird **nur zur Prüfung** gelesen und danach verworfen (nicht in DB, nicht in Logs).

---

## 8. Offline- und Sync-Verhalten

### 8.1 Clientseitiger Speicher (Dexie / IndexedDB)
- `profile`: `playerId`, `secret`, Einstellungen, `safetyAcknowledgedAt`, `registered` (bool).
- `routeBundles`: Bundle je Route (+ `bundleVersion`, `fetchedAt`).
- `progress`: pro Station lokaler Zustand + `confirmed` (bool) + `rejectedReason?`.
- `outbox`: `id` (= `clientEventId`, UUID), `type`, Payload, `createdAt`, `attempts`, `lastError?`.
- App fragt `navigator.storage.persist()` an. ⚠ iOS Safari kann Website-Daten nach ~7 Tagen Nichtnutzung löschen, **außer** die PWA ist zum Home-Bildschirm hinzugefügt. → Install-Hinweis in der UI, Risiko in §15.

### 8.2 Ablauf
1. Jede Spieleraktion schreibt **in einer Dexie-Transaktion** lokalen Fortschritt (`confirmed=false`) **und** Outbox-Eintrag. Die UI reagiert sofort.
2. Sync-Trigger: App-Start, `online`-Ereignis, `visibilitychange → visible`, Button „Jetzt synchronisieren", nach jeder Aktion (best effort). **Kein** Background-Sync-API (fehlt auf iOS).
3. Sync sendet Outbox in Reihenfolge der Erstellung (max. 50/Request). Erst bei Antwort werden die Einträge entfernt, die ein Ergebnis haben (`accepted`/`duplicate`/`rejected`).
4. Netzfehler/5xx: Einträge bleiben, exponentielles Backoff (z. B. 2 s, 4 s … max. 60 s), kein Datenverlust.
5. `accepted`/`duplicate` → lokaler Fortschritt `confirmed=true`. `rejected` → lokaler vorläufiger Fortschritt wird **zurückgenommen** (außer der Server hat ihn auf anderem Weg bestätigt), Grund wird angezeigt.
6. Nach jedem Sync wird der Server-Fortschritt als maßgeblich übernommen (Reconcile). Lokale Werte sind nur Vorschau.
7. Erster Sync eines Offline-Erststarts: Zuerst `POST /api/players`, dann `/api/sync`.

### 8.3 Bewusste Vereinfachung
Antworten der Quests liegen im Bundle, damit offline sofort Feedback möglich ist. Die Antwort ist daher ausspähbar. Akzeptiert (A2: XP kosmetisch). Der Server prüft trotzdem jede Antwort neu. Bei Events/Partnerbelohnungen wird das neu entschieden (ADR-0003).

### 8.4 Idempotenz
- Jedes Ereignis hat eine clientseitig erzeugte UUID; Server dedupliziert über `UNIQUE(player_id, client_event_id)`.
- Zusätzlich verhindert `UNIQUE(player_id, route_id, station_id)` doppelte XP selbst bei neuer Event-ID.
- Wiederholtes Senden desselben Batches ist immer sicher.

### 8.5 Zeit
Serverzeit ist maßgeblich. `clientTs` dient nur der Reihenfolge und Anzeige, nie der Logik.

### 8.6 Konflikte
Weil Fortschritt nur wachsen kann (besucht → abgeschlossen) und pro Spieler/Station einmalig ist, gibt es keine echten Merge-Konflikte; es gewinnt das erste vom Server akzeptierte Ereignis. Zwei Geräte desselben Spielers gibt es nicht (A4).

### 8.7 Routenversionswechsel
Neues Bundle ersetzt das alte. Fortschritt bleibt für Stationen mit gleicher `station_id`. Entfernte Stationen: Fortschritt bleibt in DB, zählt aber nicht mehr für Abzeichen.

---

## 9. QR-Token-Konzept

### 9.1 Ziel
Der gedruckte Code darf nicht trivial fälschbar oder erratbar sein, und er soll **auch mit der System-Kamera** nutzbar sein.

### 9.2 Format
QR-Inhalt ist eine URL: `https://<host>/q/<token>`.

```
token   = "q1." + b64url(payload) + "." + b64url(mac)
payload = routeId + ":" + stationId + ":" + keyVersion      (UTF-8)
mac     = HMAC-SHA256( key[keyVersion], "qurally-qr-v1\0" + payload )  → auf 16 Bytes gekürzt
```

- Schlüssel kommen aus der Umgebung (`QR_SIGNING_KEYS` = Map `keyVersion → Secret`, mind. 32 Byte Zufall). **Nie** im Repo, nie im Client.
- Vergleich per `crypto.timingSafeEqual`.
- Token **laufen nicht ab** (gedruckt). Schlüsselrotation: Station bekommt neue `qrKeyVersion`, alte Codes werden ungültig, neuer Code wird gedruckt.
- Länge ≈ 80–100 Zeichen → bequem als QR (Fehlerkorrektur M oder Q, mind. 3 cm Kantenlänge empfohlen).

### 9.3 Prüfung
- **Client (offline)**: kann HMAC nicht prüfen (kein Geheimnis). Er prüft nur *Format*, ob `routeId` zur geladenen Route gehört und ob `stationId`/`keyVersion` im Bundle existieren. Das Ergebnis ist **vorläufig**.
- **Server (beim Sync)**: prüft MAC, Route, Station, Zustand → `accepted`/`rejected`.

### 9.4 Was das Token leistet – und was nicht
- ✔ Kein Spieler kann sich einen Code für eine Station ausdenken oder Stationen durchzählen.
- ✔ Ein Fremder kann keine eigenen Codes mit gleichem Aussehen herstellen.
- ✘ Es beweist **nicht**, dass jemand vor Ort ist: Ein Foto des Codes funktioniert. Das ist für kosmetische XP akzeptiert (A2). Gegenmaßnahmen später: Quest mit Vor-Ort-Beobachtung, optional Plausibilitätsprüfung (GPS grob, Zeitabstände zwischen Stationen), rotierende/dynamische Codes bei Events.

### 9.5 Alternative (für ADR-0002)
Ed25519-Signatur statt HMAC würde Client-seitige Offline-Echtheitsprüfung erlauben (öffentlicher Schlüssel im Bundle). Für die Mini-Version bleibt es bei HMAC (Entscheidung steht, einfacher, ausreichend, da XP kosmetisch). Wechsel wäre ein Formatwechsel `q1 → q2` ohne Umbau, daher die Versionskennung im Token.

---

## 10. Sicherheits- und Datenschutzprinzipien

### 10.1 Spielsicherheit (Leitprinzip: Sicherheit vor Spielreiz)
1. Keine Tages-Serien, keine Zeitrennen, keine „Nur heute"-Mechaniken, keine Ranglisten.
2. Keine Push-Benachrichtigungen oder Erinnerungen, die zu Bewegung drängen.
3. Reihenfolge der Stationen frei (`order: free` als Default), keine Pflichtwege.
4. Validator erlaubt nur `terrain ∈ {urban, park, plaza}`; jede Station hat eine `safetyNote`.
5. Stationsauswahl-Checkliste für den Operator (in `docs/` ergänzen): öffentlich zugänglich, tagsüber sicher erreichbar, kein Klettern, keine Straßenquerung ohne Ampel/Zebrastreifen als Pflicht, kein Privatgrund, keine Baustellen, kein Wasser/Hang/Fels.
6. Sicherheitshinweis beim Erststart; Hinweis „Schau nicht beim Gehen aufs Handy" im Scan-Screen.
7. „Ort unsicher" immer in ≤ 2 Taps; Station wird gemeldet bzw. bei 2 verschiedenen Spielern gesperrt.
8. XP-Belohnung ist unabhängig von Tempo.
9. Spätere Wetter-/Lawinenwarner dürfen Quests nur **sperren/abwerten**, nie zu riskantem Verhalten anreizen.

### 10.2 Datensparsamkeit
| Daten | Wo | Wie lange | Zweck |
|---|---|---|---|
| `playerId`, `secret_hash` | Server | bis „Daten löschen" | Fortschritt zuordnen |
| Fortschritt, XP, Abzeichen | Server | bis Löschen | Spielstand |
| Meldungen (ohne Spielerbezug nach Löschen) | Server | bis resolved + 90 Tage | Sicherheit |
| Position (lat/lng) | **nur transient**: Gerät (bis Sync) und Request-Verarbeitung | nie gespeichert | Ersatzweg-Prüfung |
| IP-Adresse | **nicht gespeichert** (Reverse Proxy: IP nicht loggen oder anonymisieren) | – | – |
| Antworten (Quest) | nicht gespeichert, nur Ergebnis | – | – |
| Name/E-Mail/Telefon | **nicht erhoben** | – | – |

- Keine Drittanbieter-Requests (keine Google Fonts, kein Analytics, keine CDN-Skripte). Alle Assets selbst ausliefern.
- Logs: keine Request-Bodies, keine Koordinaten, keine Tokens.
- Secrets/Keys nur per Umgebung (`.env` nicht im Repo, `.env.example` mit Platzhaltern).

### 10.3 Technische Sicherheit
- HTTPS überall (Tunnel/Caddy). HSTS am Proxy. Strenge CSP (`default-src 'self'`; `wasm-unsafe-eval` nur falls für zxing-wasm nötig).
- Eingaben mit Zod validiert, Längenlimits, Rate-Limits (`@fastify/rate-limit`), Body-Größen-Limit.
- Kein `innerHTML`, Meldungs-Notes werden als Text gerendert.
- Spieler-Geheimnis: 32 Byte Zufall, nur Hash serverseitig, `timingSafeEqual`.
- Abhängigkeiten: `pnpm audit` in CI, Lockfile committed.

### 10.4 ⚖ Hinweise (keine Rechtsberatung)
- DSGVO: Standortdaten sind personenbezogen, auch wenn nicht gespeichert; Datenschutzerklärung nötig, Browser-Berechtigung allein ist keine ausreichende Information. ⚖
- Impressum/Anbieterkennzeichnung für eine öffentlich erreichbare Seite in Österreich. ⚖
- Anbringen von QR-Codes im öffentlichen Raum (Aufkleber, Schilder): Genehmigung der Eigentümer/Stadt klären; Haftung/Verkehrssicherungspflicht. ⚖
- Minderjährige als Nutzer: Einwilligung/Altersgrenzen. ⚖
- Server in der EU (Auftragsverarbeitung mit Hoster, falls Dritter). ⚖
- Für den Feldtest mit Freunden: kurze Info + Einverständnis genügt wahrscheinlich, für Öffentlichkeit nicht. ⚖

---

## 11. Teststrategie

### Stufe 1 – Automatisiert (bei jedem Commit/CI)
| Ebene | Werkzeug | Gegenstand |
|---|---|---|
| Unit | Vitest | Zod-Schemas + Validator-Regeln, Token sign/verify, XP-Regeln, Haversine, Zustandsübergänge, Outbox-Logik (fake-indexeddb) |
| Integration | Vitest + Fastify `inject` + echte PostgreSQL (Docker-Service in CI, lokal `docker compose`) | Sync-Endpoint, Idempotenz, Ablehnungen, Löschen |
| Komponenten | Vitest + Testing Library | Scan-Flow mit `ScannerPort`-Fake, Quest-UI, Banner/Status |
| E2E | Playwright (Chromium; WebKit-Smoke) | Erststart, Route laden, **Offline-Modus** (`context.setOffline`), Scan simuliert, Sync nach „online", Ersatzweg mit gemockter Geolocation (`context.setGeolocation`) |
| Kamera | Playwright mit Chromium-Flags `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<qr.y4m>` für **einen** Smoke-Test; sonst Scanner-Fake über `ScannerPort` | Dekodier-Pfad |
| Statisch | Biome (lint+format), `tsc --noEmit`, `pnpm audit`, `route:validate` für alle Routen | |

Prinzip: **Tests zuerst** aus den Abnahmekriterien (§14). Jeder Test trägt die AK-ID im Titel (`AK-SCAN-02: …`).

### Stufe 2 – Selbsttest am Handy
- `pnpm build && pnpm preview` (bzw. API serviert Build) + **Cloudflare Tunnel** (`cloudflared tunnel --url http://localhost:<port>`) → HTTPS-URL aufs Handy. Wichtig: Service Worker nur im Produktions-Build testen, nicht im Dev-Server.
- Checkliste (in `docs/FELDTEST.md` später): Kamera-Erlaubnis, Scan bei Sonne/Dämmerung/schräg, Flugmodus-Scan, Flugmodus aus → Sync, Ersatzweg mit realem GPS, Installation auf Startbildschirm (iOS + Android), App im Hintergrund/Neustart, Akku-Verbrauch.
- Tunnel-Hostnamen sind temporär; QR-Codes für den Selbsttest daher mit Test-Host erzeugen (Skript nimmt `--base-url`).

### Stufe 3 – Feldtest (3–5 Freunde, iPhone + Android)
- Kleiner EU-Server (z. B. Hetzner o. ä.), `docker compose`: `app` (Fastify + Web-Build), `db` (PostgreSQL), `caddy` (automatisches HTTPS). Backup per `pg_dump` (täglich, kurze Aufbewahrung).
- Echte Route, echte Aufkleber. Beobachten: Scan-Erfolg, Offline-Verhalten in Funklöchern, GPS-Genauigkeit zwischen Gebäuden, Verständlichkeit der Fragen, Sicherheitsgefühl, Meldeweg.
- Auswertung: kurzer Fragebogen + Sichten der (anonymen) Server-Daten; Befunde → Issues/ADR.
- ⚖ Kurze Datenschutzinfo vor dem Test.

---

## 12. Ordnerstruktur

```
qurally/
├─ apps/
│  ├─ web/                       React + Vite + PWA
│  │  ├─ src/
│  │  │  ├─ app/                 Routing, Layout, Update-Banner
│  │  │  ├─ features/            scan/, quest/, route/, report/, profile/, badge/
│  │  │  ├─ data/                db.ts (Dexie), outbox.ts, sync.ts, progress.ts
│  │  │  └─ ports/               scanner.ts (Interface), geolocation.ts
│  │  ├─ e2e/                    Playwright-Tests
│  │  └─ public/                 Icons, Manifest-Assets
│  └─ api/                       Fastify
│     ├─ src/
│     │  ├─ server.ts
│     │  ├─ routes/              health, routes, players, sync
│     │  ├─ domain/              token.ts, xp.ts, progress.ts, geo.ts, station-state.ts
│     │  └─ db/                  schema.ts (Drizzle), migrations/
│     └─ test/                   Integrationstests
├─ packages/
│  └─ shared/                    Zod-Schemas & reine Logik ohne Node/Browser-Abhängigkeit
│     └─ src/                    route-schema.ts, sync-schema.ts, xp.ts, geo.ts, token-format.ts
├─ content/
│  └─ routes/                    innsbruck-altstadt.route.json
├─ scripts/                      route-validate.ts, route-publish.ts, qr-generate.ts, station-set-status.ts
├─ services/
│  └─ ai/                        (leer, nur README – später FastAPI/uv/pytest/ruff/pyright)
├─ infra/                        Dockerfile, docker-compose.yml, Caddyfile, .env.example
├─ docs/
│  ├─ SPEC.md
│  ├─ adr/                       0001-….md …
│  ├─ AGENTEN-PLAN.md
│  └─ UMSETZUNGSPLAN.md
├─ .claude/                      agents/, skills/, settings.json, hooks/ (später)
├─ .github/workflows/ci.yml
├─ CLAUDE.md
├─ biome.json · pnpm-workspace.yaml · package.json · tsconfig.base.json · .gitignore
```

Regel: `packages/shared` enthält **keine** Node- oder Browser-APIs außer dem, was in beiden vorhanden ist; HMAC-Signieren lebt in `apps/api` (Secret nur dort).

---

## 13. Tech-Stack und Begründung

| Baustein | Entscheidung | Begründung / Anmerkung |
|---|---|---|
| Sprache | TypeScript (strict) überall | Ein Typsystem von DB bis UI; passt für KI-geführte Entwicklung, da Compilerfehler früh Fehler fangen. |
| Repo | pnpm-Monorepo (`apps/*`, `packages/*`) | Geteiltes Schema ohne Publish-Aufwand. |
| Schema | Zod in `packages/shared` | Eine Quelle für Routenformat, API-Payloads und Typen; JSON Schema wird abgeleitet. |
| Frontend | React + Vite | Weit verbreitet, gute KI-Unterstützung, schnelle Builds. |
| PWA | `vite-plugin-pwa` (Workbox) | Precache der App-Shell inkl. WASM, `registerType: 'prompt'` für kontrollierte Updates. |
| Lokaler Speicher | Dexie (IndexedDB) | Transaktionen (Fortschritt + Outbox atomar), robust, testbar mit `fake-indexeddb`. |
| QR-Scan | `zxing-wasm` (Reader, nur QR-Format) hinter eigenem `ScannerPort` | iOS Safari hat kein `BarcodeDetector`. Der Port erlaubt Austausch (z. B. `qr-scanner`) und Fake im Test. **Hinweis:** WASM-Größe/Performance auf älteren Androids am Handy messen (Stufe 2). |
| Backend | Node + Fastify | Schnell, schema-first (`fastify-type-provider-zod`), gut testbar mit `inject`. |
| DB | PostgreSQL + Drizzle ORM | Entschieden. Mehr Betrieb als SQLite, aber für Events/Concurrency später passend und im Docker-Setup ohnehin trivial. Migrations in Git. |
| Tests | Vitest, Playwright | Siehe §11. |
| Lint/Format | Biome | Ein Werkzeug, schnell, wenig Konfiguration. |
| CI | GitHub Actions | Postgres-Service-Container, Playwright-Job. |
| Auslieferung | Fastify liefert Web-Build (`@fastify/static`) | **Kleine Abweichung/Vorschlag:** Same-Origin, kein CORS, ein Container. Dev: Vite-Proxy auf `/api`. |
| HTTPS | Dev: Cloudflare Tunnel; Feldtest: Caddy | Kamera/SW brauchen HTTPS. |
| Später | `services/ai` (FastAPI, uv, pytest, ruff, pyright) | **Nur Ordner + README**, kein Code jetzt. |

### Widerspruch / Anmerkungen zu deinem Stack
1. **HMAC-Token vs. Offline-Prüfung**: HMAC kann offline nicht im Client geprüft werden → Scan-Ergebnis ist offline *vorläufig* (so gewollt, siehe §9). Ed25519 wäre die Alternative (ADR-0002). Ich empfehle trotzdem HMAC jetzt, weil es einfacher ist und XP kosmetisch sind.
2. **Playwright + Kamera**: Echte Kamera lässt sich nicht simulieren; fake-video-capture funktioniert nur in Chromium. Deshalb die Naht `ScannerPort`; den Dekodier-Pfad deckt ein Chromium-Smoke-Test ab, iOS-Verhalten **nur** am echten Gerät (Stufe 2/3).
3. **Background Sync** fehlt auf iOS → Sync läuft nur bei geöffneter App (Trigger siehe §8).
4. Sonst keine Einwände; der Stack passt zur Aufgabe.

---

## 14. Abnahmekriterien

Format: **Gegeben … Wenn … Dann …**. ID im Testnamen verwenden. Beispielwerte aus §6.1 (scanXp 10, questXp 40, fallbackXpFactor 0.5).

### F1 – Routenformat (AK-ROUTE)
- **AK-ROUTE-01** Gegeben eine Routendatei, die dem Schema entspricht, wenn `route:validate` läuft, dann endet es mit Exit-Code 0.
- **AK-ROUTE-02** Gegeben zwei Stationen mit gleicher `id`, wenn validiert wird, dann Fehler mit Pfad und Exit-Code ≠ 0.
- **AK-ROUTE-03** Gegeben eine Station ohne `quest` oder ohne `location`, wenn validiert wird, dann Fehler mit Pfad.
- **AK-ROUTE-04** Gegeben eine Koordinate außerhalb von `region.bbox`, wenn validiert wird, dann Fehler.
- **AK-ROUTE-05** Gegeben `terrain: "alpine"` (oder ein anderer nicht erlaubter Wert), wenn validiert wird, dann Fehler.
- **AK-ROUTE-06** Gegeben eine Station ohne oder mit leerer `safetyNote`, wenn validiert wird, dann Fehler.
- **AK-ROUTE-07** Gegeben `fallback.enabled=true` und `fallback.question.prompt` gleich `quest.prompt`, wenn validiert wird, dann Fehler.
- **AK-ROUTE-08** Gegeben eine `choice`-Quest, deren `answer` auf keine Options-ID zeigt, wenn validiert wird, dann Fehler.
- **AK-ROUTE-09** Gegeben die im Repo liegende Beispielroute, wenn die Testsuite läuft, dann besteht sie die Validierung (Regression).

### F2 – Route laden und Offline-Cache (AK-LOAD)
- **AK-LOAD-01** Gegeben Netz und eine nicht geladene Route, wenn der Spieler die Route öffnet, dann liegt das Bundle samt `bundleVersion` in IndexedDB.
- **AK-LOAD-02** Gegeben die Route wurde einmal geladen, wenn die App ohne Netz neu gestartet wird, dann sind Stationsliste und Hinweistexte sichtbar.
- **AK-LOAD-03** Gegeben die Route wurde nie geladen und kein Netz, wenn die App startet, dann erscheint „Route noch nicht geladen – bitte einmal mit Internet öffnen", ohne Fehler/Absturz.
- **AK-LOAD-04** Gegeben ein neues Bundle mit höherer Version und Netz, wenn die App synchronisiert, dann ersetzt es das alte und der Fortschritt für gleich benannte Stationen bleibt erhalten.
- **AK-LOAD-05** Gegeben eine Station ist serverseitig `blocked`, wenn das Bundle aktualisiert wird, dann zeigt die UI sie als gesperrt und nicht spielbar.

### F3 – Anonymes Profil (AK-PROF)
- **AK-PROF-01** Gegeben ein Erststart, wenn die App öffnet, dann existiert ein lokales Profil (`playerId`, `secret`) ohne Eingabeformular oder Login.
- **AK-PROF-02** Gegeben ein Erststart ohne Netz, wenn später Netz da ist, dann wird der Spieler vor dem ersten Sync per `POST /api/players` registriert.
- **AK-PROF-03** Gegeben ein Spieler mit Fortschritt, wenn er „Meine Daten löschen" bestätigt, dann sind lokale Daten gelöscht und Server hat Spieler, Fortschritt und Abzeichen entfernt; Meldungen bleiben ohne Spielerbezug.
- **AK-PROF-04** Gegeben ein Sync-Request mit falschem Geheimnis, wenn er gesendet wird, dann Antwort 401 und keine Daten verändert.
- **AK-PROF-05** Gegeben ein Server-Datenbankdump, wenn er durchsucht wird, dann enthält er kein Klartext-Geheimnis.

### F4 – Scan und Token (AK-SCAN, AK-TOKEN)
- **AK-SCAN-01** Gegeben ein gültiger Token einer Station der aktiven Route und Netz, wenn gescannt wird, dann ist die Station `besucht` und 10 XP sind bestätigt.
- **AK-SCAN-02** Gegeben ein Token mit veränderter Signatur, wenn er gesendet wird, dann Ablehnung `invalid_token`, keine XP, verständliche Meldung.
- **AK-SCAN-03** Gegeben ein gültiger Token einer anderen Route, wenn gescannt wird, dann `wrong_route`, keine XP.
- **AK-SCAN-04** Gegeben ein Token mit unbekannter Key-Version, wenn gesendet, dann `unknown_key`, keine XP.
- **AK-SCAN-05** Gegeben die Station ist bereits besucht, wenn derselbe Code erneut gescannt wird, dann `duplicate` und kein weiterer XP-Zuwachs.
- **AK-SCAN-06** Gegeben eine gesperrte Station, wenn ihr Code gescannt wird, dann `station_blocked`, keine XP, Hinweistext.
- **AK-SCAN-07** Gegeben ein QR mit fremdem Inhalt (z. B. andere URL), wenn gescannt wird, dann Hinweis „Kein qurally-Code" und weder Outbox-Eintrag noch Fortschritt.
- **AK-SCAN-08** Gegeben die Kamera-Berechtigung wird verweigert, wenn der Scan-Screen öffnet, dann erscheint eine Erklärung, wie man sie erlaubt, und der Weg zum Ersatzweg bleibt sichtbar.
- **AK-SCAN-09** Gegeben ein QR wird mit der System-Kamera gescannt und öffnet `/q/<token>`, wenn die App lädt, dann wird der Token wie ein In-App-Scan verarbeitet.
- **AK-TOKEN-01** Gegeben Route, Station und Key-Version, wenn ein Token signiert und danach geprüft wird, dann ist die Prüfung erfolgreich und liefert dieselben Werte (Roundtrip).
- **AK-TOKEN-02** Gegeben ein Token, bei dem ein beliebiges Zeichen verändert wurde, wenn er geprüft wird, dann schlägt die Prüfung fehl (parametrisierter Test über Positionen).
- **AK-TOKEN-03** Gegeben zwei Key-Versionen, wenn ein Token mit Version 1 signiert und mit Schlüssel 2 geprüft wird, dann schlägt die Prüfung fehl.
- **AK-TOKEN-04** Gegeben fehlerhafte Eingaben (leer, falsches Präfix, falsches Base64, zu lang), wenn geparst wird, dann kontrollierter Fehler statt Exception.

### F5 – Quest (AK-QUEST)
- **AK-QUEST-01** Gegeben eine besuchte Station, wenn die richtige Antwort gegeben wird, dann ist sie `abgeschlossen` und weitere 40 XP sind vorläufig gutgeschrieben.
- **AK-QUEST-02** Gegeben eine falsche Antwort, wenn abgeschickt wird, dann Hinweis, keine XP, Wiederholung beliebig oft, und es entsteht kein Outbox-Eintrag.
- **AK-QUEST-03** Gegeben eine nicht besuchte Station, wenn die Quest beantwortet werden soll, dann ist das in der UI nicht möglich; serverseitig führt ein entsprechendes Ereignis zu `not_visited`.
- **AK-QUEST-04** Gegeben ein manipuliertes Ereignis mit falscher Antwort im Sync, wenn der Server es prüft, dann `answer_incorrect`, keine XP.
- **AK-QUEST-05** Gegeben eine Text-Quest mit Antwort „Innsbruck", wenn „  innsbruck " eingegeben wird, dann gilt sie als richtig (Trim, Groß-/Kleinschreibung, Unicode-Normalisierung).

### F6 – XP und Fortschritt (AK-XP)
- **AK-XP-01** Gegeben bestätigte und unbestätigte Ereignisse, wenn die XP angezeigt werden, dann sind unbestätigte Anteile als „vorläufig" markiert; die bestätigte Summe stammt vom Server.
- **AK-XP-02** Gegeben ein Ereignis mit bereits verarbeiteter `id`, wenn es erneut gesendet wird, dann Ergebnis `duplicate` und keine XP-Änderung.
- **AK-XP-03** Gegeben ein Spieler und eine Station, wenn beliebige Ereignisfolgen (auch neue IDs) gesendet werden, dann erhält er Scan-XP und Quest-XP pro Station höchstens einmal (DB-Constraint).
- **AK-XP-04** Gegeben `order: free`, wenn Stationen in beliebiger Reihenfolge abgeschlossen werden, dann ist die XP-Summe identisch.
- **AK-XP-05** Gegeben beliebige Eingaben, wenn XP berechnet werden, dann nie negativ und ganzzahlig.

### F7 – Abzeichen (AK-BADGE)
- **AK-BADGE-01** Gegeben alle nicht gesperrten Stationen sind abgeschlossen, wenn der Server den Fortschritt auswertet, dann wird das Abzeichen genau einmal vergeben.
- **AK-BADGE-02** Gegeben eine Station wird nach Teilfortschritt gesperrt und alle übrigen sind abgeschlossen, wenn ausgewertet wird, dann wird das Abzeichen trotzdem vergeben.
- **AK-BADGE-03** Gegeben ein Abzeichen wurde vergeben, wenn derselbe Sync wiederholt wird, dann entsteht kein zweites.
- **AK-BADGE-04** Gegeben der Abschluss erfolgt offline, wenn der Abschluss-Screen erscheint, dann steht dort „vorläufig – wird bestätigt, sobald du online bist"; nach erfolgreichem Sync wird er „bestätigt".

### F8 – Offline-Warteschlange und Sync (AK-SYNC)
- **AK-SYNC-01** Gegeben kein Netz, wenn ein Scan erfolgt, dann wird in einer Transaktion lokaler Fortschritt (`confirmed=false`) und ein Outbox-Eintrag mit UUID geschrieben und die UI bestätigt sofort.
- **AK-SYNC-02** Gegeben ein gefüllter Outbox und wiederkehrendes Netz, wenn der Sync läuft, dann werden Ereignisse in Erstellungsreihenfolge gesendet, vom Server bestätigt, die Outbox ist leer und der Fortschritt `confirmed`.
- **AK-SYNC-03** Gegeben der Sync bricht mitten im Request ab, wenn er erneut startet, dann geht kein Ereignis verloren und keines wird doppelt gewertet.
- **AK-SYNC-04** Gegeben der Server lehnt ein Ereignis ab, wenn das Ergebnis eintrifft, dann wird der vorläufige Fortschritt zurückgenommen und der Grund angezeigt.
- **AK-SYNC-05** Gegeben die App ist offen, wenn das Gerät wieder online geht, dann startet der Sync ohne Nutzeraktion; ebenso beim App-Start, bei `visibilitychange` und per Button.
- **AK-SYNC-06** Gegeben kein Netz, wenn irgendeine Spieleraktion ausgeführt wird, dann blockiert oder verzögert nichts die UI (kein wartender Netzwerk-Call auf dem Aktionspfad).
- **AK-SYNC-07** Gegeben mehr als 50 Ereignisse in der Outbox, wenn synchronisiert wird, dann in mehreren Requests ≤ 50.
- **AK-SYNC-08** Gegeben `clientTs` liegt in Zukunft oder Vergangenheit, wenn der Server verarbeitet, dann ändert das weder Ergebnis noch XP.

### F9 – Ersatzweg (AK-FALL)
- **AK-FALL-01** Gegeben eine Station mit `fallback.enabled`, Position innerhalb `radiusM`, Genauigkeit ≤ 50 m und richtige Ersatzantwort, wenn der Ersatzweg abgeschlossen wird, dann ist die Station `abgeschlossen` (Methode `fallback`) mit 25 XP (= 50 % von 10+40).
- **AK-FALL-02** Gegeben eine Position weiter als `radiusM` entfernt, wenn geprüft wird, dann `too_far`, keine XP.
- **AK-FALL-03** Gegeben eine Genauigkeit schlechter als 50 m, wenn geprüft wird, dann Hinweis „Standort zu ungenau" mit Möglichkeit zur Wiederholung, keine XP.
- **AK-FALL-04** Gegeben die Standort-Berechtigung wird verweigert, wenn der Ersatzweg gestartet wird, dann Erklärung, kein Fortschritt, nichts gespeichert.
- **AK-FALL-05** Gegeben ein erfolgreicher Ersatzweg, wenn er verarbeitet wird, dann entsteht automatisch eine Meldung `code_damaged` und die Station wird `gemeldet`.
- **AK-FALL-06** Gegeben ein abgeschlossener Ersatzweg, wenn die Datenbank und die Server-Logs durchsucht werden, dann enthalten sie weder Koordinaten noch Genauigkeitswerte des Spielers.
- **AK-FALL-07** Gegeben kein Netz, wenn der Ersatzweg abgeschlossen wird, dann wird er vorläufig gewertet und beim Sync serverseitig geprüft (Radius/Antwort).
- **AK-FALL-08** Gegeben die Station ist bereits abgeschlossen, wenn der Ersatzweg versucht wird, dann `duplicate`, keine zusätzlichen XP.
- **AK-FALL-09** Gegeben `fallback.enabled=false`, wenn die Stationsansicht öffnet, dann wird kein Ersatzweg angeboten.

### F10 – Meldungen und Stationszustand (AK-REP)
- **AK-REP-01** Gegeben eine Station im Zustand `ok`, wenn eine Meldung eingeht, dann wird sie `gemeldet`; nach der nächsten Bundle-Aktualisierung sehen alle Spieler den Hinweis.
- **AK-REP-02** Gegeben `unsafe`-Meldungen von 2 verschiedenen Spielern, wenn die zweite eingeht, dann wird die Station `gesperrt`.
- **AK-REP-03** Gegeben zwei `unsafe`-Meldungen desselben Spielers, wenn verarbeitet, dann zählen sie als eine.
- **AK-REP-04** Gegeben eine gemeldete (nicht gesperrte) Station, wenn gespielt wird, dann bleibt Scan und Ersatzweg möglich.
- **AK-REP-05** Gegeben eine gesperrte Station, wenn der Operator `station:set-status ok` ausführt, dann ist sie wieder spielbar und offene Meldungen sind `resolved`.
- **AK-REP-06** Gegeben kein Netz, wenn eine Meldung abgeschickt wird, dann liegt sie in der Outbox und wird später gesendet; ein Spieler darf höchstens 10 Meldungen pro Tag senden (`rate_limited` darüber).
- **AK-REP-07** Gegeben ein Meldungstext mit HTML/Skript, wenn er angezeigt oder gespeichert wird, dann wird er als reiner Text behandelt und nie ausgeführt; Länge > 200 wird abgelehnt.

### F11 – Sicherheit im UX (AK-SAFE)
- **AK-SAFE-01** Gegeben ein Erststart, wenn der Spieler die Route öffnen will, dann muss er zuerst den Sicherheitshinweis bestätigen; die Bestätigung wird lokal gespeichert.
- **AK-SAFE-02** Gegeben die fertige UI, wenn sie geprüft wird, dann enthält sie keine Serien, Zeitzähler, Ranglisten oder Push-Anfragen (Review-Checkliste + Playwright prüft: Notification-Permission wird nie angefragt).
- **AK-SAFE-03** Gegeben die Stationsansicht, wenn „Ort unsicher" gesucht wird, dann ist sie in höchstens 2 Taps erreichbar.
- **AK-SAFE-04** Gegeben der Scan-Screen, wenn er öffnet, dann zeigt er den Hinweis „Nicht beim Gehen aufs Handy schauen".

### F12 – PWA (AK-PWA)
- **AK-PWA-01** Gegeben der Produktions-Build über HTTPS, wenn Lighthouse (oder Manifest/Service-Worker-Prüfung) läuft, dann gilt die App als installierbar.
- **AK-PWA-02** Gegeben eine neue Service-Worker-Version, wenn sie bereitsteht, dann erscheint „Neue Version – neu laden" und die App lädt nicht automatisch neu, solange eine Quest offen ist.
- **AK-PWA-03** Gegeben ein einmal geladener Produktions-Build, wenn offline gestartet wird, dann sind App-Shell und der WASM-Decoder im Cache und der Scanner startet.

### F13 – Datenschutz (AK-PRIV)
- **AK-PRIV-01** Gegeben Server-Logs nach Testläufen, wenn sie durchsucht werden, dann enthalten sie keine Koordinaten, Quest-Antworten oder vollständigen Token.
- **AK-PRIV-02** Gegeben ein vollständiger E2E-Durchlauf, wenn alle Netzwerkanfragen aufgezeichnet werden, dann gehen alle an die eigene Origin.
- **AK-PRIV-03** Gegeben die Datenbank nach einem Durchlauf, wenn sie durchsucht wird, dann gibt es keine IP-Adressen, Namen oder E-Mails.

### F14 – Operator-CLI (AK-CLI)
- **AK-CLI-01** Gegeben eine gültige Route, wenn `route:publish` läuft, dann entsteht eine neue `route_versions`-Zeile mit `content_hash`; derselbe Inhalt erzeugt keine neue Version.
- **AK-CLI-02** Gegeben Route und Key-Version, wenn `qr:generate` läuft, dann entsteht pro Station ein QR (SVG/PNG) mit gültigem Token und lesbarer Stationsbeschriftung.
- **AK-CLI-03** Gegeben `QR_SIGNING_KEYS` fehlt oder ist zu kurz, wenn `qr:generate` oder der Server startet, dann Abbruch mit klarer Fehlermeldung.

---

## 15. Offene Punkte / Risiken

1. **Kartenansicht**: optional (F15). Ohne Karte muss der `hint`-Text die Orientierung tragen. Entscheidung nach Selbsttest. Wenn Karte: selbst gehostete Kacheln oder Link auf externe Karten-App (Datenschutz).
2. **iOS-Speicherlöschung** (7-Tage-Regel, nicht installierte Web-Apps) → Install-Hinweis, `storage.persist()`, Feldtest beobachten.
3. **zxing-wasm-Größe/Leistung** auf schwachen Geräten; Fallback-Bibliothek bereithalten.
4. **GPS-Genauigkeit in der Altstadt** (Häuserschluchten) → Radius 40 m kann zu streng sein; im Selbsttest messen, Radius pro Station einstellbar (20–100).
5. **Sperre vs. früherer Offline-Scan** (siehe §5.3) – Fairness-Frage, bewusst vereinfacht.
6. **ADR-Kandidaten** (siehe `docs/adr/`): 0001 Monorepo/Stack, 0002 HMAC statt Ed25519, 0003 Antworten im Bundle, 0004 Sperre gewinnt vor Offline-Scan, 0005 Same-Origin-Auslieferung, 0006 Position nur transient.
7. ⚖ Datenschutzerklärung, Impressum, Genehmigung für QR-Anbringung vor jedem Betrieb jenseits des Freundeskreises.
