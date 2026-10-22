---
name: gm-app-map
description: Where GM-app surfaces and player-redaction code actually live, plus gotchas that contradict a first guess (verified 2026-10-22)
metadata:
  type: reference
---

- `toPlayerCodex` is in `packages/shared/src/codex.ts` (~L354) and `toPlayerView` in `packages/shared/src/state.ts` (~L650). `apps/api/src/table/table.state.ts` only holds the loaders (`loadState`, `loadCodex`), no redaction.
- Players never get beats, items, factions or custom threats; adventures only when `shown` (title, brief, status). The table-screen TV (`components/screen/table-screen`) reads `state` only, no codex.
- Beat `status` ("active" etc.) is read by nothing except PREP's amber chip (`prep.tsx` ~L317); written by PREP SET ACTIVE/DONE/SKIP and by `beat.startEncounter` (`encounter.actions.ts` ~L434). The beat editor has no status field.
- Every GM tab sits under the same band: `SpendRequests` + `TestCall` (rendered in `gm-app.tsx`, not per tab).
- Reveal flags are flipped by whole-entry `codex.save` from CODEX (row chip REVEALED/HIDDEN in `codex.tsx`, or CodexEditor bools); only exceptions: adventure `shown` (PREP) and per-Agent objectives (`character.objectives`, PARTY).
- Shell tip: zsh errors on unquoted `--include=*.ts` in grep ("no matches found"); quote it.

**Why:** these were the non-obvious answers in a scene-centred GM redesign investigation; the rest is derivable from the code.
**How to apply:** start here for GM-flow, reveal-path or player-redaction questions, then re-verify line numbers.
