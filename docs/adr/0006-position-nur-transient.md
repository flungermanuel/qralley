# 0006 – Position nur transient

Status: Angenommen
Datum: 2026-11-23
Bezug: SPEC §10.2, AK-FALL-06, AK-PRIV-01

## Kontext

Der Ersatzweg braucht eine Standortprüfung. Standortdaten sind personenbezogen. ⚖ Hinweis, keine Rechtsberatung.

## Entscheidung

Die Position wird einmal abgefragt, nur im Outbox-Ereignis gehalten und nach dem Sync gelöscht. Der Server liest sie nur zur Prüfung und verwirft sie. Weder Datenbank noch Logs enthalten Koordinaten.

## Alternativen

Clientseitige Prüfung allein: leicht zu fälschen. Position speichern: unnötig und riskant.

## Folgen

Der Radius lässt sich nicht nachträglich prüfen oder auswerten. Das Fälschen der GPS-Position bleibt möglich (akzeptiert, XP kosmetisch). Prüfung per Test: keine Koordinaten in Tabellen und Logs.
