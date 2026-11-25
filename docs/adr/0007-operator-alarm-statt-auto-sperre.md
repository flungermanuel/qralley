# 0007 – Meldungen lösen einen Operator-Alarm aus, nie eine automatische Sperre

Status: Angenommen (Entscheidung des Entwicklers, 2026-11-24)
Datum: 2026-11-24
Bezug: SPEC §5.3, §10.1 Nr. 7, AK-REP-02/03/08–11; ändert den Kontext von ADR 0004; Review 2026-11-23 Befund 2 / Q1

## Kontext

Bisher sperren `unsafe`-Meldungen von zwei verschiedenen Spielern eine Station automatisch. Spieler sind anonym und kostenlos anlegbar (kein Konto, A3/F3). Wer zwei Identitäten anlegt, kann jede Station für alle sperren (Sybil-Angriff, Review Befund 2). Die geprüfte Alternative „nur Melder mit Fortschritt an der Station zählen" schützt nur halb (ein Token ist fotografierbar, SPEC §9.4) und bestraft gerade das gewünschte Verhalten: wer einen Ort unsicher findet und **vor** dem Scan umkehrt, könnte nicht mehr wirksam melden.

## Entscheidung

1. Meldungen setzen eine Station höchstens auf `reported`. `blocked` setzt nur der Operator (`pnpm station:set-status`). Bereits gesperrte Stationen bleiben gesperrt.
2. **Operator-Alarm**, sobald die offenen Meldungen einer nicht gesperrten Station die Schwelle erreichen: ≥ 3 verschiedene Spieler (beliebige Art) oder ≥ 2 verschiedene Spieler mit `unsafe`. Derselbe Spieler zählt einmal; Meldungen ohne Spielerbezug (gelöschter Spieler) zählen je als ein Melder (sichere Richtung). Schwellen über Umgebung einstellbar (1–10, Default 3/2, Zod-geprüft beim Start).
3. Der Alarm ist **kein neuer Datensatz** und braucht keine Schemaänderung: Er wird aus der Tabelle `reports` abgeleitet. Die Prüfung, ob die Schwelle **gerade jetzt** erreicht wird, ist eine reine Funktion in `packages/shared` (Anzahl vorher/nachher); die Zählung läuft unter der bestehenden Zeilensperre auf `station_state`, daher genau ein Alarm auch bei gleichzeitigen Meldungen.
4. Benachrichtigung in v1, datensparsam und ohne Drittanbieter:
   - eine strukturierte Log-Zeile `station_alert` (Route, Station, Anzahl verschiedener Melder je Art, Zeitpunkt der ältesten offenen Meldung). Die Domain gibt den Alarm als Rückgabewert zurück, geloggt wird in der HTTP-Schicht (Domain bleibt ohne Fastify).
   - `pnpm station:alerts`: listet alle aktuellen Alarme, zeigt dem Operator zusätzlich die Notiztexte. Spieler-IDs, IP und Koordinaten erscheinen nirgends.
5. Der Alarm endet, wenn der Operator `ok` (Meldungen werden `resolved`) oder `blocked` setzt.
6. E-Mail, Webhook oder Push (auch selbst gehostet) sind **nicht** Teil von v1; jeder externe Kanal braucht einen eigenen ADR (Datenfluss, Geheimnisse, Drittanbieter).

## Alternativen

- Auto-Sperre beibehalten (Status quo): Sybil-Angriff sperrt die Route für alle. Abgelehnt.
- Nur Melder mit Fortschritt zählen: siehe Kontext. Abgelehnt.
- Höhere Schwelle für Auto-Sperre (z. B. 5): verschiebt das Problem nur, Identitäten kosten nichts. Abgelehnt.
- Tabelle `operator_alerts` mit Quittierung: Schemaänderung, für einen einzelnen Operator unnötig. Später, falls mehrere Operatoren.
- Sofortige E-Mail/Webhook: Drittanbieter und neues Geheimnis; eigener ADR, wenn der Feldtest zeigt, dass Log und CLI nicht reichen.

## Folgen

- Kein Spieler kann Stationen für andere sperren. Betrug trifft nur noch den Betrüger (A2).
- **Preis:** Eine wirklich unsichere Station bleibt spielbar, bis der Operator reagiert. Ausgleich: Zustand „gemeldet" mit Hinweis, Ersatzweg, Sicherheitshinweis „Station auslassen", feste Prüfroutine des Operators (Reaktionszeit = offene Entscheidung in `docs/V1-FUNDAMENT.md`).
- **Nachtrag 2026-11-24 (OE1):** Zusätzlicher Ausgleich nach ADR 0009: Eine Station mit offener `unsafe`-Meldung zeigt einen stärkeren Hinweis und zählt nicht für das Abzeichen. Alarmregel und Schwellen dieses ADR bleiben unverändert.
- Der Operator muss Log oder CLI aktiv ansehen; es gibt keinen Push.
- ADR 0004 bleibt gültig (Sperre gewinnt vor Offline-Scan), nur der Auslöser ist jetzt immer der Operator.
- Code (umgesetzt in Commit `3572600`, Schritt A1): `UNSAFE_BLOCK_THRESHOLD` und `applyReport` sind aus `packages/shared` entfernt (samt `packages/shared/test/station-state.test.ts`). Die Regel „Meldungen sperren nie" steht allein im Upsert von `flagStation` (`apps/api/src/domain/sync.ts`): eine fehlende `station_state`-Zeile wird als `reported` angelegt, eine vorhandene nur aus `ok` auf `reported` gesetzt (`setWhere` auf `status = 'ok'`), `reported` und `blocked` bleiben unverändert. Abgesichert durch die umgekehrten Tests in `apps/api/test/sync.test.ts` und `apps/api/test/hardening.test.ts`. Automatisch gesperrte Stationen in bestehenden Datenbanken bleiben gesperrt, bis der Operator sie freigibt.
