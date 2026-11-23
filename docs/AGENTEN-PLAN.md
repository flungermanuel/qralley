# Plan: Agenten, Skills und Hooks (Vorschlag, noch nichts angelegt)

Ziel: Dein Review bleibt der Engpass. Das Team soll **kleine, prüfbare Diffs** liefern, Tests zuerst erzwingen und gefährliche Dinge technisch (nicht nur per Bitte) verhindern.

Hinweis Windows: Hook-Skripte als **Node-Skripte** (`.mjs`) schreiben, nicht als Bash, damit sie unter PowerShell und in CI gleich laufen.

Hinweis Tool-Rechte: Die `tools`-Liste eines Agenten kann nicht auf Pfade einschränken (z. B. „test-writer darf nur `*.test.ts` bearbeiten"). Pfadgrenzen setzen wir deshalb zusätzlich per Hook (PreToolUse) durch.

---

## 1. Agenten (`.claude/agents/`)

Modelle als Alias (`opus`, `sonnet`, `haiku`); wird nach Kosten/Qualität im Betrieb nachgestellt.

### Jetzt (Mini-Version)

| Agent | Aufgabe | Erlaubte Tools | Modell |
|---|---|---|---|
| **architect** | Liest SPEC/ADRs, zerlegt einen Auftrag in kleine Schritte mit AK-IDs, schreibt/ändert `docs/SPEC.md`, `docs/adr/*`, `docs/UMSETZUNGSPLAN.md`. Schreibt **keinen** Produktcode. Meldet Widersprüche und offene Fragen. | Read, Grep, Glob, Write/Edit (Hook beschränkt auf `docs/**`, `CLAUDE.md`) | opus |
| **test-writer** | Übersetzt Abnahmekriterien in Tests (Vitest/Playwright), AK-ID im Testnamen. Führt die Tests aus und liefert den **roten** Lauf als Beleg. Fasst Produktcode nicht an. | Read, Grep, Glob, Write/Edit (Hook: nur `**/*.test.ts`, `**/e2e/**`, `**/fixtures/**`), Bash (nur Testbefehle) | sonnet |
| **implementer** | Schreibt minimalen Code, damit die vorhandenen roten Tests grün werden. Ändert keine Tests (außer Absprache), keine SPEC, keine neuen Abhängigkeiten ohne Rückfrage. Liefert Prüfhilfe (Dateien, Besonderheiten). | Read, Grep, Glob, Edit, Write, Bash (pnpm, git status/diff) | sonnet |
| **reviewer** | Read-only. Prüft den Diff gegen SPEC, AK-Abdeckung, Sicherheitsprinzipien (Position/IP/Secrets/Token/XSS), Scope-Disziplin, Testqualität (prüft echte Fälle statt Mocks bis zur Bedeutungslosigkeit). Gibt priorisierte Befunde, ändert nichts. | Read, Grep, Glob, Bash (nur `git diff`, `git log`, Testbefehle) | opus |

Typischer Ablauf pro Schritt: **architect** (Schritt klären, falls nötig) → **test-writer** (rot) → **implementer** (grün) → **reviewer** (Befunde) → du prüfst den Diff → Commit.

### Später

| Agent | Aufgabe | Tools | Modell |
|---|---|---|---|
| **privacy-reviewer** | Prüft Datenflüsse (Position, IDs, Logs, Meldungen, Drittanbieter), gleicht mit SPEC §10 und Datenschutzerklärung ab, markiert ⚖-Punkte. Read-only. | Read, Grep, Glob | opus |
| **eval-runner** | Führt Evaluationen für KI-Bausteine aus (Datensätze, Metriken, Regression gegen Baseline), berichtet Zahlen, ändert keinen Modellcode. | Read, Grep, Glob, Bash (nur `uv run pytest`/Eval-Skripte), Write nur `services/ai/evals/results/` | haiku (Läufe) / sonnet (Auswertung) |
| **python-implementer** | Wie implementer, aber für `services/ai` (FastAPI, uv, pytest, ruff, pyright). | Read, Grep, Glob, Edit, Write, Bash (`uv`, `ruff`, `pyright`, `pytest`) | sonnet |

---

## 2. Skills (`.claude/skills/`)

| Skill | Wann | Inhalt (Gerüst) |
|---|---|---|
| **new-feature** | Start jeder neuen Funktion/jedes Schritts | Checkliste: AK-IDs aus SPEC nennen → Plan in ≤ 5 Teilschritten → Test zuerst (rot zeigen) → minimale Implementierung → Lint/Typecheck/Test → Prüfhilfe → Commit vorschlagen. Verweist auf Agenten-Ablauf. |
| **route-format** | Beim Anlegen/Ändern von Routen oder des Schemas | Regeln aus SPEC §6, Beispielroute, Befehle `route:validate`/`route:publish`/`qr:generate`, Hinweis auf Versionierung (`version` erhöhen, `schemaVersion` nur per ADR), Stations-Auswahl-Checkliste (Sicherheit). |
| **adr** | Bei Architekturentscheidung | Vorlage (Kontext / Entscheidung / Alternativen / Folgen), Nummerierung, Statusfeld, max. 1 Seite, Verknüpfung zur SPEC-Stelle. |
| **commit-conventions** | Vor jedem Commit | Conventional-Commits-Format, Scopes (`web`, `api`, `shared`, `docs`, `infra`), AK-IDs im Text, ein Commit pro Schritt, Vorbedingung grüne Tests, Attribution-Zeile. |

---

## 3. Hooks (`.claude/settings.json` + `.claude/hooks/*.mjs`)

| Hook | Ereignis | Wirkung |
|---|---|---|
| **Formatter** | `PostToolUse`, Matcher `Edit\|Write` | Führt Biome auf die geänderte Datei aus (`biome check --write <datei>`). Meldet verbleibende Lintfehler zurück. |
| **Bash-Schutz** | `PreToolUse`, Matcher `Bash` | `guard-bash.mjs` blockiert (Exit 2 + Begründung): `rm -rf` außerhalb von `node_modules/dist`, `git push --force`, `git reset --hard`, `git clean -fd`, `curl\|sh`, `DROP`/`TRUNCATE`, Lesen/Ausgeben von `.env`, Pushen ohne Aufforderung. |
| **Secret-Schutz** | `PreToolUse`, Matcher `Read\|Edit\|Write` | `guard-files.mjs` blockiert `.env*` (außer `.env.example`), `*.pem`, `*.key`, `id_*`; blockiert Schreiben von Mustern wie `-----BEGIN`, langen Hex/Base64-Strings in Quelltext; Pfadgrenzen je Agent (architect nur `docs/**`). |
| **Tests beim Stop** | `Stop` | Führt `pnpm test` (schnelle Unit-Tests) aus; bei Fehlern Exit 2 mit Ausgabe, damit Claude weiterarbeitet. Prüft `stop_hook_active`, um Endlosschleifen zu vermeiden. Läuft nur, wenn Dateien geändert wurden. |
| **Commit nur bei grün** | `PreToolUse`, Matcher `Bash` mit Befehl `git commit` | `guard-commit.mjs` führt `pnpm lint && pnpm typecheck && pnpm test` aus, blockiert den Commit bei Fehlern. |

Zusätzlich `permissions` in `settings.json`: `allow` für `pnpm *`, `git status/diff/log/add`, `docker compose` (nur Dev-Datei); `deny` für `.env*`, `git push`, `rm`, Netzwerkbefehle außer `cloudflared`.

Skizze:
```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "node .claude/hooks/format.mjs" }] }
    ],
    "PreToolUse": [
      { "matcher": "Bash",             "hooks": [{ "type": "command", "command": "node .claude/hooks/guard-bash.mjs" }] },
      { "matcher": "Bash",             "hooks": [{ "type": "command", "command": "node .claude/hooks/guard-commit.mjs" }] },
      { "matcher": "Read|Edit|Write",  "hooks": [{ "type": "command", "command": "node .claude/hooks/guard-files.mjs" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node .claude/hooks/run-tests.mjs" }] }
    ]
  }
}
```

Reihenfolge der Einführung: erst **Bash-/Secret-Schutz** (vor dem ersten Code), dann Formatter (mit Biome in Schritt 1), dann Test-/Commit-Hooks (sobald es Tests gibt).

---

## 4. Offene Entscheidungen
- Soll der **architect** auch Routen-Inhalte (Fragen/Texte) entwerfen oder nur Struktur? (Vorschlag: nur Struktur; Inhalte schreibst du vor Ort.)
- Soll der Stop-Hook bei langsamen Tests nur Unit-Tests laufen lassen (Vorschlag: ja; E2E nur in CI/auf Zuruf)?
- Modellwahl: opus für architect/reviewer ist teurer, aber dort liegt die Qualität; bei Kostendruck reviewer auf sonnet.
