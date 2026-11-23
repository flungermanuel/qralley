---
name: adr
description: Write an architecture decision record in docs/adr/. Use for new dependencies, schema or protocol changes, deviations from docs/SPEC.md, changed security assumptions and layering decisions.
---

# ADR

File: `docs/adr/NNNN-short-title.md`, next free number, max one page, German or English consistently (this repo: German text, English identifiers).

```markdown
# NNNN – Titel

Status: Vorgeschlagen | Angenommen | Abgelöst durch NNNN
Datum: YYYY-MM-DD
Bezug: SPEC §…, AK-…

## Kontext

Welches Problem, welche Randbedingungen (Sicherheit vor Spielreiz, Offline, Datensparsamkeit, Ein-Personen-Review)?

## Entscheidung

Was wird getan. Ein Absatz.

## Alternativen

Mindestens eine, mit Grund für die Ablehnung.

## Folgen

Vorteile, Nachteile, Risiken, was sich im Code, in der SPEC oder in Tests ändert. Wann ist die Entscheidung neu zu bewerten?
```

Rules: one decision per ADR; never rewrite an accepted ADR, supersede it; link it from the SPEC section it affects.
