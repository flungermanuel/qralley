# 0009 – Als unsicher gemeldete Station zählt nicht für das Abzeichen

Status: Angenommen (Variante B, Entscheidung des Entwicklers, 2026-11-24). Protokolldetail (Feld `unsafeReported`, Punkt 3) vom Entwickler **bestätigt** (2026-11-24).
Datum: 2026-11-24
Bezug: SPEC §2, §3 E/F, §5.3, §6.3, §7.1, §10.1 Nr. 7, AK-REP-04/05/12/13, AK-BADGE-01/05–08, AK-SYNC-09; ergänzt ADR 0007 (OE1 in `docs/V1-FUNDAMENT.md`)

Eigene ADR statt Nachtrag zu 0007, weil sie eine andere Regel (Abschluss/Abzeichen) und eine Protokolländerung (Bundle- und Sync-Antwort) festlegt, die 0007 nicht berührt.

## Kontext

Seit ADR 0007 sperren Meldungen nie automatisch. Eine wirklich unsichere Station bleibt spielbar, bis der Operator reagiert. Solange sie für das Abzeichen Pflicht ist, gibt es einen Anreiz, einen Ort zu betreten, der sich unsicher anfühlt. Das verletzt „Sicherheit vor Spielreiz" (CLAUDE.md, SPEC §10.1).

## Entscheidung

1. Eine Station mit **mindestens einer offenen `unsafe`-Meldung** (beliebiger Melder, auch ohne Spielerbezug) zählt **nicht** für den Routenabschluss. Sie bleibt spiel- und scanbar (AK-REP-04), XP werden normal vergeben, sie wird nie automatisch gesperrt (ADR 0007).
2. Die App zeigt an solchen Stationen den deutlichen Hinweis „Als unsicher gemeldet – im Zweifel auslassen" und dass das Auslassen keinen Nachteil hat.
3. Öffentlich wird nur ein abgeleitetes **Boolean** je Station: `stationStates[id].unsafeReported` im Bundle (§6.3) und in der Sync-Antwort (§7.1). Es wird bei jeder Abfrage aus `reports` berechnet (`EXISTS kind='unsafe' AND status='open'`), **keine Tabellenänderung**. Kein Freitext, keine Anzahl, kein Spielerbezug. Fehlt das Feld (alter Client-Cache), gilt `false`.
4. Abschlussregel = eine reine Funktion in `packages/shared`, genutzt von Server (`evaluateRoute`) und Client (vorläufiges Abzeichen). „Zählende Stationen" = nicht `blocked` **und** nicht `unsafeReported`. Gibt es keine zählende Station, wird kein Abzeichen vergeben (wie heute bei „alle gesperrt").
5. Maßgeblich ist der Zustand **zum Zeitpunkt der Server-Auswertung** (jeder Sync). Ein vergebenes Abzeichen wird **nie** entzogen. Setzt der Operator `ok`, zählt die Station für alle, die das Abzeichen noch nicht haben, wieder.
6. Die eigene, noch nicht gesendete `unsafe`-Meldung wirkt auf dem Gerät sofort (vorläufig), damit jemand ohne Netz vor Ort umkehren kann, ohne das vorläufige Abzeichen zu verlieren.

## Alternativen

- **A – nur stärkerer Text, Station bleibt Pflicht:** Der Anreiz, den Ort zu betreten, bleibt. Verworfen.
- **C – Bestätigungsdialog vor Scan/Quest an gemeldeter Station:** Ein Tap mehr ändert den Anreiz nicht und gewöhnt an Wegklicken. Verworfen.
- Merkmal aus dem vorhandenen `reason` ableiten: `reason` enthält nur die Art der ersten auslösenden Meldung oder freien Operator-Text. Unzuverlässig. Verworfen.
- Neuer Status `unsafe` in `station_state`: Schema- und Übergangsänderung, vermischt Zustand (Operator) mit Meldungslage. Verworfen.
- Abzeichen bei späterem `ok` entziehen: kein Sicherheitsgewinn, erzeugt Druck zur Rückkehr. Verworfen.

## Folgen

- **Missbrauch:** Schon **eine** anonyme Identität kann die Abzeichen-Pflicht einer oder aller Stationen aufheben. Folge: das Abzeichen wird leichter (kosmetisch, A2) oder ist, wenn alle Stationen gemeldet sind, bis zur Prüfung durch den Operator nicht erreichbar. Sperren, XP oder Fortschritt anderer Spieler bleiben unberührt. Der Operator-Alarm (ADR 0007) bleibt **unverändert**. Lücke: eine einzelne `unsafe`-Meldung erreicht die Alarmschwelle nicht (offene Frage OE7 in `docs/V1-FUNDAMENT.md`).
- Wer selbst „unsicher" meldet, muss die Station nicht mehr abschließen. Wird akzeptiert (A2), denn genau dieses Verhalten ist erwünscht.
- Protokoll: `routeBundleSchema` und `syncResponseSchema` bekommen ein gemeinsames `stationStateSchema` mit optionalem `unsafeReported` (der Server sendet es immer; fehlt es, wertet die geteilte Funktion es als `false`, damit alte Dexie-Caches und vorhandene Test-Fixtures ohne Migration gültig bleiben). Alte Clients ignorieren das Feld. Ihre vorläufige Anzeige kann abweichen, der Server bleibt maßgeblich. Das ETag des Bundles enthält das Feld, weil es `stationStates` hasht.
- `reward.requires: "all_unblocked_stations"` behält den Namen (Routenformat, `schemaVersion` 1), bedeutet aber ab jetzt „alle zählenden Stationen". Eine Umbenennung bräuchte `schemaVersion` 2.
- Weitere Abfrage je Bundle- bzw. Sync-Auswertung (eine Gruppierung über offene `unsafe`-Meldungen der Route). Bei A6 unkritisch.
