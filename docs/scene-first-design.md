# Scene-first GM flow: design record

The GM tablet is organised around **the scene being played**. Prep is a storyboard you flip scene by scene (STORY),
play is one screen that holds everything the current scene needs (SCENE), the combat tracker is a layer of that scene
(FIGHT), and PARTY is a roster of one-button cards that open one dossier. Designed and built 2026-10-22, merged as PRs
#257 → #263. This file records **why** it looks the way it does, so later work keeps the intent. How each screen works
in detail is in [frontend.md](frontend.md) §3; the data and actions are in [backend.md](backend.md) and
[campaign-model.md](campaign-model.md); the GM's rulings are [rules-flow.md](rules-flow.md) §11.157–159.

## 1. The ask

The GM asked, in their words, for:

- PREP that **flips by scene, not scrolling**, so writing an adventure feels like designing a story on a storyboard.
- **Scenes as the main focus**; the combat tracker secondary.
- **Everything a scene holds reachable from the scene**: a handout, an NPC, a place revealed to the phones from the
  scene itself, never by switching to CODEX.
- **Few buttons** on PARTY and the tracker; "a click-through" at the table, because every prep step is done beforehand.

What the code had before (counted 2026-10-22): an Agent card carried about 29 controls, a fully prepped scene card about
30 at rest (45 with its folds open), the tracker's key bar 10–12 with a row selected, and the header 4 pool buttons.
`status: "active"` on a beat only painted a chip, several scenes could be active, and nothing could be revealed from PREP.

## 2. Principles

Each comes from the research done before designing (sources in §9). New work on these screens should keep them.

1. **The scene is the home screen.** One current scene for the table, previewed privately before it goes live (Foundry
   VTT's active scene; PowerPoint's Presenter View).
2. **Write on a board, run as a presenter.** Two views of the same scenes: a board to arrange (STORY), a runner to play
   (SCENE). Edit tools stay out of the runner (Keynote's Light Table vs a slide; Boords; Strong Start's Run mode).
3. **Draw the adventure as the books do.** Scene cards on an iron pipe spine (Traitor's Hymn p.26, *What Happens
   Next?*); page-edge tabs with the current part in crimson and a tick on played ones (Bloody Gates pp.6–9, p.25); the
   scene page in the books' order: read-aloud, Tests, Ruin and Glory, what happens next.
4. **Exits are choices.** Taking an exit begins the next scene; the steps taken stay visible (articy:draft's
   presentation mode). A broken exit shouts (Twine's broken link): `NO SCENE YET` in crimson, a READY check.
5. **One tap reveals, to everyone by default; private says who.** (Foundry's Show Players, Roll20; Alchemy's six-step
   per-player share is the anti-pattern.)
6. **Beginning a scene does several things at once.** Its ON ENTRY picks reach the phones in the same tap (Foundry
   scene activation, Shard's encounters).
7. **Peek before you reveal.** A name opens the codex peek; the toggle beside it reveals.
8. **One primary action per area, and it follows the state.** The tracker's turn button reads START / END TURN /
   NEW ROUND (Foundry's Next Turn).
9. **Tap the number, enter the change.** No −/+ pairs: a tap on a value opens a pad with steps and a signed input
   (Foundry token bars, Shieldmaiden, NN/g on steppers).
10. **Cards show state; one sheet holds the actions; two levels at most** (D&D Beyond's character list, Foundry's actor
    directory, NN/g progressive disclosure).
11. **Nothing hidden behind a gesture only.** Every action has a visible button; MORE holds only three or more rare ones
    (NN/g on swipe and contextual menus, Apple HIG).

## 3. Information architecture

| Before | After |
| --- | --- |
| Rail: TRACK, SETUP, PREP, CODEX, PARTY, RULES, BOOKS; opens on TRACK | Rail: SCENE · STORY · CODEX · PARTY · RULES · BOOKS, SETUP at the foot; opens on SCENE while a session is open, else STORY |
| TRACK, its own tab | the FIGHT layer inside SCENE (THE SCENE \| FIGHT · ROUND n), mounted while a fight is live |
| PREP, one long scroll of scene cards | STORY: a board of the adventure, then one scene per page |
| REVEALED / HIDDEN on CODEX rows | IN THIS SCENE on SCENE: one toggle per place, person, handout |
| CALL A TEST bar under every tab | one header button; CALL on each prepared Test row; the tally under the header only while a call is open |
| Pool − / + in the header | tap the seal: a pad with ±1 and the current scene's planned spends |
| Spend requests bar | `n SPEND ASKED` header badge |
| 13 buttons on every Agent card | the card is one button; the dossier holds the rest |
| Invites and guest QRs on every card | the dossier's SEAT tab |

Old `?tab=track` / `?tab=prep` links open SCENE / STORY. A scene peek's GO TO and SCENE's EDIT open the scene's page in
STORY. Switching tabs starts the new tab at its top.

## 4. Screens

### SCENE (`components/gm/scene/`), the play home

- **No scene:** each adventure's next planned scene with BEGIN; START A FIGHT for an unplanned one.
- **Scene strip:** the adventure's scenes as tabs, the current one crimson, played ones ticked; a tap previews a scene
  read-only with BEGIN THIS SCENE.
- **Left column, as printed:** label (SCENE n · TYPE · PLACE), GOAL, READ ALOUD box, GM NOTES in a closed sealed plate,
  HAZARDS, TESTS (each row calls its Test in one tap: CALL ALL for an EACH Test, an Agent chip for a ONE Test; a fold
  under the row holds the Shifts, outcomes, the Ruin reminder and a Corruption Test's record), RUIN & GLORY lines.
- **IN THIS SCENE:** place, cast, handouts (a private one names its Agents), items. The name opens the peek; one toggle
  shows the state (SHOWN / SEALED) and its aria-label the action. Items keep GIVE. START FIGHT starts the prepared fight.
- **WHERE NEXT:** one button per exit; it begins the target scene (the scene left is played). OTHER SCENE… for the rest.
- **SCENE BEGUN** notice after a begin, here or from STORY (the GM shell holds it), with UNDO: the scene before is current again, the begun one gets its old status
  back, and what the begin revealed is sealed again (`lib/scene-reveal`).
- The page is keyed by scene, so moving on starts with GM NOTES closed and no stale FEAR ticks; a double tap sends once.

### FIGHT, the tracker as a layer (`components/gm/tracker/`)

- **Key bar, at most four controls** with a row selected: the turn button (START <NAME>'S TURN / END TURN / NEW ROUND),
  SEIZE · 1 GLORY/RUIN only when allowed, + CONDITION, MORE (ambush or aware, PLAYERS SEE, new round, remove, end fight).
- **Delta pad:** tap a row's Wounds or Shock number. WOUNDS | SHOCK, DEAL + | HEAL −, the 1–10 keys, a signed number
  (`-3` heals, `+2` deals). Applies through the existing counter actions, so the vox log, notes and UNDO still work.
- **PLAYERS SEE chip** per Threat: one tap toggles HIDDEN ↔ BARS only; FULL (the stat block, book content) is set only
  from MORE, so a stray tap never shows a stat block.
- Numbers show what is **left** (13/18), as the bars do; the same on PARTY.
- On a landscape tablet the side panel (the selected one's stat block, the vox log) stays beside the table; the rows drop
  CLASS, DEF and RES, which the stat block shows.

### STORY (`components/gm/story/`), prep as a storyboard

- **Adventure bar** as PREP had (switch, new, edit, mission status, SHOWN TO THE PARTY, premise).
- **BOARD:** scenes on an iron spine, each card one button that selects it (number, title, a tagline, `READY ✓` or
  `n TO FIX`: no goal, no read-aloud, an exit with no scene), exit tags beside each card, and beside the spine the
  selected scene at a glance: its goal, what it holds, what shows on entry, READY FOR THE TABLE, OPEN SCENE and RUN FROM
  HERE. + NEW SCENE, + SCENE FROM A TABLE.
- **PAGE:** one scene as a book spread, flipped with ‹ › and scene tabs; story on the left, toolkit on the right, an
  **ON ENTRY** tick on each place, person and handout (saved at once, disabled while saving). A pencil per section opens
  the scene editor on just that section (`BeatEditor`'s `section` prop). ▶ RUN THIS SCENE, EDIT, ↑ ↓, DONE, SKIP, PRINT
  pinned at the foot. STORY opens on the scene being played.

### PARTY (`components/gm/party/`)

- **Session band:** one primary (START SESSION n / END SESSION… with XP and the recap), NEXT SESSION as a quiet button.
- **Toolbar:** ROOM QR, RESPITE… (party-wide), MORE (add Agent, builder, print tents, screen QR, table access).
- **Agent card = one button:** name, archetype, PLAYED BY <name> / SEATED · GUEST QR / OPEN SEAT, DRAFT when a build
  waits, Wounds and Shock left, Wrath · Corruption · Wealth · XP, conditions, objectives count.
- **Dossier** (side sheet, four tabs with values in their labels): STATUS (tapped values with HEAL 1 / DEAL 1 steps,
  conditions, objectives, Corruption Test, respite), GEAR · WEALTH n, ADVANCE · n XP, SEAT (invite, guest QR, revoke,
  load stats). ASCENSION is its own fold on the page, so SETUP's Tier step can scroll to it.

### Header and phones

- `components/gm/header/`: SealButton (pool pad + the scene's planned spends), CallTestButton, SpendBadge, one Popover.
- Players: INTEL reads `INTEL · n NEW`; each new handout, person, place or picture has a NEW chip until INTEL is left
  (`hooks/use-seen`, `lib/seen`, per device in `localStorage`).

## 5. Data and actions

- **One scene is played at a time:** `status: "active"`, with a partial unique index `beat_one_active` (one active beat
  per campaign). A save can't make a beat active (`"Begin the scene to play it"`).
- **`beat.begin { id, leave = "done", reveal = true }`** (GM, `beginBeat`): the scene left goes to `leave`, this one
  becomes active, and with `reveal` its ON ENTRY picks that were hidden are revealed. The reply's `revealed` lists them
  for UNDO. `beat.startEncounter` begins its scene the same way.
- **`Beat.onEntry`:** the scene's place, NPC and handout ids shown when it begins; a save keeps only ids the scene still
  links (`onEntryIds`).
- **Migration 0029** keeps each campaign's first active scene in story order before adding the index.
- **Deliberately not stored** (considered and dropped as unneeded): a `currentBeatId` column, a separate reveal action
  (reveals reuse whole-entry `codex.save`), an encounter → scene link (the FIGHT layer shows whenever a fight is live),
  a session trail (the recap lists played scenes in story order), server-side NEW marks (per device).
- The scene editor saves the scene's **live** status, so an editor left open can't undo a begin.

## 6. Rulings

| § | Ruling (GM, 2026-10-22) |
| --- | --- |
| 11.157 | Taking an exit marks the scene left as played, with UNDO on SCENE. |
| 11.158 | A reveal puts a NEW mark on the phone (INTEL's tab and the entry) until seen; no buzz; per device; a device's first visit counts what is already revealed as seen. |
| 11.159 | Ready-made Ruin and Glory spends from the books are picked while building a scene (ADD FROM BOOK); at the table a seal's pad offers only the current scene's planned spends. |

## 7. Where the code is

| PR | Branch | What |
| --- | --- | --- |
| #257 | `feat/scene-first-data` | one active scene, `beat.begin`, `onEntry`, migration 0029, smoke assertions |
| #258 | `feat/scene-first-header` | header seals, CALL A TEST, SPEND ASKED; the phones' NEW badge |
| #259 | `feat/scene-first-fight` | four-button key bar, delta pad, PLAYERS SEE chip |
| #260 | `feat/scene-first-party` | one-button cards, dossier, ASCENSION fold |
| #261 | `feat/scene-first-scene` | SCENE; shared `ui/test-outcomes` |
| #262 | `feat/scene-first-story` | STORY; `BeatEditor` `section` |
| #263 | `feat/scene-first-shell` | rail, header wiring, PREP removed, docs |

Pure logic with tests: `lib/scene` (`currentScene`), `lib/scene-reveal` (reveal saves, UNDO steps), `lib/story-scenes`
(readiness, taglines), `lib/fight-delta` (signed input), `lib/party-view` (pad actions, seat words), `lib/seen` (NEW).
Per-screen CSS: `apps/web/app/css/{fight,header,party,player,scene,story}.css`, imported after `globals.css` in
`app/layout.tsx`. The design mock-ups (static boards, not the app's CSS) are on the "Scene-first flow (Oct 2026)" page
of the private Imperial Manuscript canvas: https://claude.ai/artifact/LRBEbp8GhgBAFeDk4pohVy.

## 8. Known gaps

None open. The three left after the merge (the board's glance panel, the stat block's place on a landscape tablet, a
begin from STORY without its notice) were fixed in the follow-up to #264.

## 9. Sources

Research done 2026-10-22, for the principles in §2.

- Storyboards and presenters: [Keynote Light Table](https://support.apple.com/en-kz/guide/keynote-ipad/tanf247343ec/ipados),
  [PowerPoint Presenter View](https://support.microsoft.com/en-US/PowerPoint/training/use-presenter-view-in-powerpoint),
  [Boords animatics](https://boords.com/docs/animatics), [Storyboarder](https://wonderunit.com/storyboarder/faq/),
  [Plottr timeline](https://docs.plottr.com/article/54-timeline-overview),
  [Twine](https://twinery.org/reference/en/editing-stories/navigating.html),
  [articy:draft presentation mode](https://www.articy.com/en/articydraft-first-steps-tutorial-series-l07-presentation-mode/).
- GM tools and methods: [Foundry Scenes](https://foundryvtt.com/article/scenes/),
  [Foundry Journal](https://foundryvtt.com/article/journal/), [Foundry Combat](https://foundryvtt.com/article/combat/),
  [Foundry tokens](https://foundryvtt.com/article/tokens/), [Foundry actors](https://foundryvtt.com/article/actors/),
  [Roll20 Show to Players](https://app.roll20.net/forum/permalink/6262216),
  [Alchemy handouts](https://help.alchemyrpg.com/en/articles/9821627-creating-handouts),
  [Shard campaign prep](https://www.shardtabletop.com/campaign_prep),
  [Strong Start for Obsidian](https://community.obsidian.md/plugins/strong-start),
  [Sly Flourish, the eight steps at the table](https://slyflourish.com/using_the_8_steps_at_the_table.html),
  [The Alexandrian, Three Clue Rule](https://thealexandrian.net/wordpress/1118/roleplaying-games/three-clue-rule).
- Trackers and touch UI: [Shieldmaiden](https://shieldmaiden.app/documentation),
  [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/),
  [NN/g steppers](https://www.nngroup.com/articles/input-steppers/),
  [NN/g contextual menus](https://www.nngroup.com/articles/contextual-menus-guidelines/),
  [NN/g swipe](https://www.nngroup.com/articles/contextual-swipe/),
  [NN/g bottom sheets](https://www.nngroup.com/articles/bottom-sheet/).
- The books (printed pages): Core Rulebook pp.317–318 (*What a GM Does*: set the scene, ask, listen, consequences, keep
  it moving), p.320 (Ruin); Traitor's Hymn p.26 (*What Happens Next?*, the scene spine); Bloody Gates pp.6–9 and p.25
  (scene spreads, page-edge tabs), p.26 (Battlefield Ruin).
