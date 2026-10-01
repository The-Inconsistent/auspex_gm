# Design brief: Scene & Campaign Builder mock-ups (Auspex GM tablet)

You are drawing static UI mock-ups that developers will build from. They go on the GitHub roadmap issue #52 as PNGs and
onto the team's design canvas. One artboard per screen. The app is Auspex, a GM companion for in-person *Wrath & Glory*
games (no maps, no dice, no chat in play). Style: the "Imperial Manuscript": vellum page, crimson Cinzel heads, iron
bands, riveted plates for GM-only content.

## Where things are 
- `kit/BRIEF.md`: this file. The spec is the GitHub issue itself; read yours in full.
- `kit/style.html`: the shared CSS (read it for the class list). **Don't edit it**; one-offs go in inline `style`.
- `kit/shell.html`: copy-paste snippets: the header band, the rail, a drawn `<select>`, the ROLL ON A BOOK TABLE
  pattern, the ADD FROM BOOK picker pattern. Use the patterns when your screen needs them, so every issue looks alike.
- `src/I38-PrepScenes.body.html` and `src/I38-SceneEditor.body.html`: the finished exemplars (PREP scene list,
  and the inline scene editor). Match their structure, spacing, type sizes and tone. Look at `png/I38-*.png`.
- The repo (read-only for you): the `main` branch. Real screens to stay close to:
  `apps/web/components/gm/prep/prep.tsx`, `.../prep/components/beat-editor/beat-editor.tsx`,
  `.../codex/codex.tsx`, `.../codex/components/codex-editor/codex-editor.tsx`, `.../party/party.tsx`,
  `.../tracker/components/add-combatants/`. Data: `packages/data/threats/*.json`, `packages/data/creation/**`,
  `packages/data/rules/*.json`, `packages/data/wargear/*.json`, `packages/shared/src/*.ts`.

## How to make an artboard
1. Write `src/I<issue>-<Screen>.body.html` (e.g. `I41-ThreatPicker.body.html`). Line 1 is exactly:
   `<!-- w=1194 h=834 title="#41 · PREP · threat picker" -->` (title = `#<issue> · <AREA> · <what>`).
   The rest is ONE root `<div class="pg" style="width: 1194px; height: <h>px; display: flex; overflow: hidden">…</div>`
   with the header band (big title = the section: PREP / CODEX / PARTY / TRACK), the main area and the rail (move
   `aria-current` and its torn crimson svg to the active section, give the others their numeral). No doctype, head,
   helmet or script: the build wraps it.
2. Build and render only your files: `python3 build.py ../canvas 'I41-*' && ./render.sh 'I41-*'`.
3. Read `png/<Name>.png` (the Read tool shows images). Fix clipping, overflow, overlaps, cramped or empty areas,
   text that runs off. Re-render. Stop when it is clean; about 3 rounds per artboard at most.

## Sizes
- 1194 px wide (a landscape tablet). 834 high for one screen. A long editor may be taller (up to 1600) to show its
  whole scroll. Nothing may be clipped by the artboard edge unless it is a list that obviously continues.
- A picker or dialog: draw the screen under it, then the dimmed backdrop and the panel (see ADD FROM BOOK in shell.html).

## Markup rules (each one breaks the canvas silently)
- Close every non-void element; quote every attribute. No `<script>`, no `{{ }}`, no `<sc-*>` tags, no `<iframe>`.
- Real controls: `<button type="button">`, `<input>`, `<textarea>`, `<label for>`, `<details>/<summary>`. Never put
  `role` or click behaviour on a div or span. `aria-label` on icon-only buttons. Selects are drawn with the
  `button.input.select` snippet.
- Icons: inline stroke `<svg>` only. No emoji. No new fonts. No gradients beyond the page's own. No left-border accent
  stripes on cards. Touch targets: `.btn.sm` (32 px) at least, `.btn` (44 px) for main actions.

## The app's conventions (stay inside them)
- The GM shell: header band, main area, the right rail (TRACK, PREP, CODEX, PARTY, RULES).
- PREP: adventure buttons, then scene cards (`.item`), and the scene editor opens inline in place of the list.
- CODEX: a `.tabs` strip of kinds (FACTIONS, NPCS, LOCATIONS, HANDOUTS) over a list of rows that expand; an editor form
  opens inline. GM-only fields (GM notes, secrets, hazards) sit in `.riv` plates.
- PARTY: the Agents, sessions, invites.
- The UI says SCENE, never BEAT (code keeps `beat`). Labels are Cinzel caps (`.lbl`); body text is the serif.
- Crimson means "now", "harm" or the primary action, never decoration. Brass is Glory only. Ruin is red.
- Errors show as a red line starting with `! ` (e.g. `! Exit scene not found`).

## Scope: each issue stands alone
Draw only what your issue adds. Show the existing screen around it as context, with the new part the obvious focus.
Don't show another issue's feature (no Tests section on the #41 board, no Items on the #47 board). If your issue has
several steps, draw the end state of all its steps.

## Content
- One sample campaign everywhere: **Volkus Dig Site**, Tier 4, 5 Agents (a Deathwatch Kill Team): Ulfgar Kaldsson,
  Veyl Corsa, Tancred Varn, Zadkiel Morn, Castiel Varro. Pools: Glory 0, Ruin 5.
  - Adventure "The Volkus Dig": scenes 01 Briefing at the Lift Head, 02 The Magos’s Offer, 03 Down the Old Shaft,
    04 The Deal, 05 Ambush at the Spoil Heaps. Second adventure: "Gutshiva’s Raid".
  - NPCs: Inquisitor Maren Solace (patron, Ordo Xenos), Magos Explorator Tessaly-7 (Adeptus Mechanicus), Archdomina
    Aexekra Vakuul, Boss Gutshiva (Ork), Dudd the Bomb Squig, Muntz ’nerz.
  - Places: Gilead Primus › Volkus Dig Site › Excavation Chamber 9, The Spoil Heaps, The Old Shaft.
  - Handouts: Ordo Xenos Mandate, The Mechanicus Writ. Factions: Ordo Xenos, Adeptus Mechanicus, Gutshiva’s Kommandos.
- Real-sounding text in your own words. No lorem ipsum.
- **Never invent game rules or numbers.** Every DN, stat, Tier value, table row, threat name, keyword and page number
  comes from your issue spec or from `packages/data`. If neither has it, use a bracketed placeholder (`[DN]`, `[row]`,
  `p.[N]`). Don't paste book prose: names and numbers only; anything longer is your own short paraphrase.
- Cite books in UI text the way the spec does: "Core Rulebook p.317", "Threat Assessment p.8".
- Show real states: something picked, something empty, a disabled button, one refusal message if the spec names one.

## Don'ts
Don't publish anything, don't touch the repo or git, don't edit `style.html`, `shell.html`, `build.py`, `render.sh`
or another agent's `src` files.

## Report back (short)
For each artboard: file name, size, one line on what it shows. Then any spec question you had to settle, and how.
