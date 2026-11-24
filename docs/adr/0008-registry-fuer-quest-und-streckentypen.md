# 0008 – Registry für Quest- und Streckentypen (Erweiterungspunkt)

Status: Angenommen (2026-11-24, Entwickler)
Datum: 2026-11-24
Bezug: SPEC §5.2, §6, §10.1 Nr. 12, A3; ARCHITEKTUR §2; Fahrplan `docs/V1-FUNDAMENT.md` Schritt D6

## Kontext

Nach v1 sollen neue Quest-Arten und für Sportler/Familien neue Streckentypen dazukommen. Heute ist jeder Quest-Typ an mehreren Stellen fest verdrahtet: `route-schema.ts` (`discriminatedUnion`, `checkChoiceAnswer`), `answer.ts` (`if (quest.type === "choice")`), die Quest-Ansicht in `App.tsx` und indirekt die Sync-Prüfung. Ein neuer Typ würde all diese Stellen ändern (verletzt Open/Closed, schwer prüfbar). Streckentypen sind heute die geschlossene Liste `terrain: urban|park|plaza`, bewusst als Sicherheitsgrenze (SPEC §10.1).

## Entscheidung

1. **Quest-Typen: Registry in v1 als Struktur**, nur mit den vorhandenen Typen `choice` und `text`, Verhalten identisch (Refactoring-Commit). Ort: `packages/shared/src/quest-types/` mit je einem Modul pro Typ (`choice.ts`, `text.ts`). Jedes Modul liefert: Zod-Schema, `isCorrect(quest, answer)`, semantische Prüfungen für den Validator (`issues(quest, path)`). `index.ts` ist eine **statisch deklarierte**, geschlossene Liste; daraus entstehen Schema-Union und Dispatch. Server und Client nutzen dieselbe Prüfung. Die Web-Seite bekommt im Web-Refactoring das Gegenstück (`features/quest/`: Typ → Ansicht).
2. **Geschlossen zur Laufzeit:** keine Registrierung zur Laufzeit, keine Plugins, nichts aus Routendateien. Ein neuer Typ = neues Modul + Eintrag + Tests + AK-IDs in der SPEC + eigener ADR (er ändert das Routenformat; alte Clients lehnen neue Bundles ab, daher ist die Versions-/Update-Frage je Typ zu klären). Jeder neue Typ wird gegen §10.1 geprüft (keine Zeit- oder Tempokomponente, keine Eingabe in Bewegung).
3. **Streckentypen: in v1 keine Registry.** `terrain` bleibt das geschlossene Enum. Der Erweiterungspunkt wird nur beschrieben: Der erste neue Streckentyp bringt per ADR ein Modul `packages/shared/src/terrain-policies/` mit, in dem jeder Typ seine Pflichtfelder (z. B. Wegbeschaffenheit, Höhenmeter, Wetterhinweis) und Validator-Regeln trägt. Grund: Diese Sicherheitsregeln sind heute unbekannt; eine leere Registry wäre spekulativ und würde nahelegen, neue Werte seien bloße Konfiguration.
4. Typisierung: `z.infer` muss weiter die genaue Union liefern, ohne `any` und ohne Casts. Gelingt das nicht sauber, bleibt die Union explizit in `route-schema.ts` und die Registry deckt nur `isCorrect`/`issues` ab (der `implementer` meldet das, statt zu casten).

## Alternativen

- Beides erst nach v1: Die Aufteilung von `domain/sync.ts` und der Quest-Ansicht in v1 würde dann später ein zweites Mal umgebaut. Kleiner Mehraufwand jetzt ist günstiger.
- Registry auch für Streckentypen jetzt: spekulativ, siehe Punkt 3.
- Plugin-System mit Laufzeitregistrierung: umgeht den Validator als Sicherheitstor, zu viel Mechanik. Abgelehnt.

## Folgen

- Ein neuer Quest-Typ wird ein Modul in `shared` plus eine Ansicht in `web` plus Tests; Validator, Sync und Schema-Union ändern sich nicht von Hand.
- Etwas mehr Indirektion; Prüfung über die vorhandenen Tests (AK-ROUTE-*, AK-QUEST-*), die unverändert grün bleiben müssen.
- Streckentypen bleiben bis zum ersten ADR hart begrenzt; das ist gewollt.
