# 0002 – HMAC-Token statt Ed25519

Status: Angenommen
Datum: 2026-11-23
Bezug: SPEC §9, AK-TOKEN, AK-SCAN

## Kontext

QR-Codes dürfen nicht erratbar oder fälschbar sein. Der Client ist oft offline.

## Entscheidung

Token `q1.<payload>.<mac>` mit HMAC-SHA256 (Domain-Präfix, auf 16 Byte gekürzt, `timingSafeEqual`). Der Schlüssel liegt nur auf dem Server. Der Client prüft nur das Format; Scans sind offline „vorläufig", der Server entscheidet beim Sync.

## Alternativen

Ed25519-Signatur: Client könnte offline die Echtheit prüfen (öffentlicher Schlüssel im Bundle). Mehr Aufwand, für kosmetische XP nicht nötig. Wechsel wäre ein Formatwechsel `q1` → `q2`.

## Folgen

Ein Foto des Codes beweist keine Anwesenheit (akzeptiert, XP kosmetisch). Bei Events oder Partnerbelohnungen neu bewerten (dynamische Codes, Plausibilitätsprüfung).
