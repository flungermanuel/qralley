# 0004 – Gesperrte Station lehnt auch frühere Offline-Scans ab

Status: Angenommen
Datum: 2026-11-23
Bezug: SPEC §5.3, AK-SCAN-06
Geändert durch: 0007 (Sperren nur noch durch den Operator; die Entscheidung unten gilt unverändert)

## Kontext

Eine Station kann gesperrt werden (zwei „unsicher"-Meldungen oder manuell), während ein Spieler offline schon gescannt hat.

## Entscheidung

Der Server lehnt Ereignisse für gesperrte Stationen ab (`station_blocked`), auch wenn der Scan vor der Sperre passierte. Der Spieler sieht den Grund.

## Alternativen

Ereignisse mit `clientTs` vor der Sperre noch akzeptieren: fairer, aber `clientTs` ist nicht vertrauenswürdig und die Logik wird komplexer.

## Folgen

Sicherheit vor Fairness. Selten ein verlorener Fortschritt. Das Abzeichen ignoriert gesperrte Stationen ohnehin.
