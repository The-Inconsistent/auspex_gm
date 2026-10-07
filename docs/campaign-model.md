# Campaign model

Everything outside the combat tracker, so a GM can prep and run a whole campaign from the tablet. Rules
references point at [rules-flow.md](rules-flow.md). Nothing here is tied to one story: factions are data (with
the Keywords the rules actually use), so a new campaign with new factions is a new record, not new code.

Decisions (2026-09-24): in-person play with real models and terrain, so **no maps in the app**. Locations are
text, notes and handouts. Build order: combat tracker plus this campaign core first; the items tracker right after.

## Entities

```
Campaign ── name, tier, framework, frameworkBonus (core pp.18–19, party sheet p.374),
 │           patron, kind[] and limits[] (core p.316, rules-flow §11.79), party keywords
 ├─ Faction      name, keywords[], stance (ally | neutral | rival | enemy), notes, secrets
 ├─ Adventure    title, premise, status (planned | running | done)
 │   └─ Beat     order, type, title, goal, status (planned | active | done | skipped),
 │               readAloud (player-facing), gmNotes (secret), locationId, npcIds[],
 │               clueIds[], encounter (prepared roster), exits[], tests[], ruin[], glory[], spends[],
 │               hazards[] (picks from its location's list, each spotted or not), outcome
 ├─ Location     name, parentId (planet → site → chamber; never a loop, `wouldCycle`), description, gmNotes,
 │               hazards (free-text notes), hazardList[] (book rows from Threat Assessment, the Core
 │               Rulebook, Darktide and Redacted Records, or the GM's own), revealed, picture
 ├─ NPC          name, factionId, role, statSource, attitude (core p.168),
 │               gmNotes, secrets, revealed, picture
 ├─ Item         name, wargearId? (a catalogue entry, else a custom item), description, gmNotes,
 │               locationId | npcId (where it lies or who carries it, one or neither), mods[] (a relic's
 │               Powers, rules-flow §11.116), givenTo (server-owned: the Agent GIVE handed it to; issue #51)
 ├─ Handout      title, body (text), style (plain | slate | form | vox | decree), header, revealedAt,
 │               audience (all | characterIds), picture
 └─ Session      number, date, recap ("Previously in…", core p.317), beatIds played,
                 objectives rolled (core p.43), xpAwarded (8/10/12, core p.321), notes
```

- **The UI says SCENE.** The GM reads SCENE everywhere; code, actions (`beat.reorder`, `beat.startEncounter`), the
  `beat` table, packs and export files keep `beat`.
- **Pictures** (issue #199): an NPC, place or handout can carry one picture the GM uploads, as `imageId`, and
  `imageRevealed`, its own reveal. Revealing the entry doesn't show the picture: the GM can introduce a face by name
  first, then hold up the portrait (PICTURE SHOWN). A phone gets the id only when both are on, and the api serves the
  bytes only for an id that phone has (`docs/backend.md`, Codex pictures). The export carries the pictures as base64.
  These are pictures, not maps: nothing on them is interactive.
- **Beat types**: briefing, travel, investigation, social, combat, revelation, rest. The type only picks an icon and
  a checklist. There is no workflow engine: beats are an ordered list the GM can reorder, skip or add to mid-session.
- **Goal and exits** (issue #38): `goal` is what the Agents are after. Each exit is `{label, beatId}`: "if they side with
  the Magos" and, once the GM has written it, the scene of the same adventure it leads to (`beatId` null for a note).
  Exits are planning notes: DONE never follows one, because Core p.318 (step 5) warns against forcing one path.
  `codex.save` refuses a target outside the beat's adventure, deleting a beat clears it from exits (the label stays),
  import remaps it, and a pack's exits are labels only, since pack beats have no key to point at.
- **Tests** (issue #39): what the scene asks the Agents to roll. Each `BeatTest` has a kind (skill, attribute, opposed,
  influence, resolve, corruption), the Skill or Attribute its kind needs (a Skill's Attribute comes from `SKILLS`), a
  DN (none for an Opposed Test), who rolls (one Agent or each), its purpose, up to five planned Shifts and what success
  and failure bring. See [rules-flow.md](rules-flow.md) §7.
- **Ruin and Glory** (issue #40): what earns the GM Ruin in this scene and what earns the Agents Glory (`PoolEntry`: a
  line and an amount, 1 to 10), and the spends the GM plans from either pool (`PoolSpend`: the pool, a name, a cost and
  its effect). PREP turns each into a tap that moves the pool. Nothing records which lines were used. See
  [rules-flow.md](rules-flow.md) §2 and §11.77.
- **Framework, Framework Bonus and patron** (issue #45): three player-visible text fields, typed by the GM. The
  Framework is "a sentence or two" (core p.18); the Bonus is its own field because the party sheet has one (p.374,
  rules-flow.md §11.80). The printed Frameworks are a creation type (`creation/frameworks/*.json`, patron-less) and
  the options of `creation/patrons/*.json`; SETUP's picker reads them through the GM-only
  `/api/campaigns/:id/frameworks` and fills in only the patron's and Framework's names (§11.80).
- **Faction Keywords** (issue #46): `keywords` stays a plain list of names. The editor's picker suggests the books'
  Keywords (core pp.375–378: the keyword records, then the ones sub-factions fill in, each with its glossary text) from
  the GM-only `/api/campaigns/:id/faction-presets`, and Enter also takes a write-in, because the books don't list them
  all (KOMMANDO, GROT). Nothing in the rules reads a faction's Keywords; factions never reach a phone. An opened
  faction lists its Keywords, stance and NPCs (hidden ones marked), and an allied non-Imperial faction gets core p.317's
  reminder that mixed Factions need a reason to work together (rules-flow.md §11.83).
  ADD FROM BOOK copies a printed faction (`FactionPreset`, the same endpoint) through `presetFaction`: its name, the
  Keywords the page prints, a cite line opening the notes, and stance neutral. The first presets are the creation
  catalogue's 27 factions, with their `keywords` (docs/data.md §9).
- **NPC stats and ADD FROM BOOK** (issue #47): the NPC editor picks the stat source (a bestiary threat through the
  threat picker, a Quick NPC Tier with an optional specialty Skill, or none), and the opened NPC shows the stat block or
  the Quick row with core p.326's scaling lines. ADD TO SCENE appends a bestiary NPC to a scene's prepared encounter
  and lists them present; a Quick NPC isn't fielded (rules-flow.md §11.88). ADD FROM BOOK copies a printed NPC
  (`NpcPreset`, GM-only `/api/campaigns/:id/npc-presets`) through `presetNpc`: hidden, a name and a role label, the cite
  line and printed text in GM NOTES, the faction linked by name when the codex has it. The first presets are the
  creation catalogue's 16 patrons.
- **NPC statSource**: one of `bestiary` (a `threatId` from any loaded book), `quick` (a Tier, from the Quick NPC table,
  core p.326, with an optional specialty Skill, rules-flow §11.87), or `none`. A `bestiary` id may also be one of the campaign's own custom threats (`custom-<slug>`, issue #43). The Mechanicus has no bestiary entries in the core
  book; its stat blocks come from the homebrew High Altar of Technology (`hat-*` threats), Redacted Records and
  Redacted Records 2 (`rr1-*`, `rr2-*`), Darktide and Litanies of the Lost (docs/data.md §4).
- **Custom threats** (issue #43): a stat block the GM writes in CODEX › THREATS, from blank or cloned from a book
  entry, kept with the campaign (at most 100). It is usable wherever a bestiary threat is — a prepared encounter,
  `+ THREAT`, an NPC's stat source — because the GM's app merges `codex.customThreats` into the one bestiary list every
  picker reads. Players never receive them (`toPlayerCodex`), export and import carry them, and `freshStart` keeps them.
  Deleting one is refused while a scene or an NPC names it.
- **Prepared encounter**: a list of `{threatId, count, asMob, marker, label, visibility, profiles, scale}` (`EncounterEntry`, see [data.md](data.md)). "Start encounter" on the beat
  loads it into the tracker. Each entry's threat comes from the `ThreatPicker` (search, plus faction, class-at-Tier and
  book chips), and a scene card prints the threat's name, not its id. A budget panel checks the roster against Building
  Encounters line by line, each reading UNDER / ON TARGET / OVER: Troops (2 per Agent), of those in Mobs (half, but a
  Mob needs 2, Core p.324), Elite or Adversary (1), and enemies (at most 10), counted as the combatants the GM tracks —
  a Mob is one — beside the models on the table (TA pp.6, 8). Monstrous Creatures tally on their own line, with no
  target. FORTIFIED doubles every target; it is the GM's read of the ground, so it is a toggle and nothing is stored.
  The budget is for the *active* Agents, the ones `beat.startEncounter` adds, not every character in PARTY. The gaps the
  book leaves are [rules-flow.md](rules-flow.md) §11.82.
- **Reveal**: NPCs, locations and handouts have a `revealed` flag. Only revealed ones reach player phones, trimmed
  by the same server-side view as hidden threat stats.
- **Items** (issue #51): what the Agents can find, never sent to phones (`toPlayerCodex` → `items: []`). A scene
  lists them (`beat.itemIds`); GIVE TO (`character.giveItem`) builds the sheet line from the catalogue and spends the
  Agent's Wargear Test for the session (§11.112), TAKE BACK (`character.takeItem`) undoes it (§11.114).
- **Handout style** (issue #204): how the handout looks as a prop, on the phone and on paper. `plain` (the default,
  and what every older handout reads as) is the cogitator slate; `slate`, `form`, `vox` and `decree` are frames drawn in
  CSS and in the printed PDF. `header` is one short banner or reference line; empty shows the style's own. Both are
  player-facing text, so the player codex carries them. Not a rule.
- **Private notes**: a handout's `audience` (character ids, empty = every player) limits a revealed handout to those
  Agents' players; deleting its only reader hides it again. Each character also carries GM-written `objectives`
  (`{ text, done }`, set by the GM-only `character.objectives`) that only its own player receives.

## Mentions

A codex text can name another entry (GitHub issue #200). The GM's rulings of 2026-10-07 are below.

- **Token.** Typing `@` in a codex text opens a list of entries; picking one writes `@[npc:<id>]`. The kinds are
  `npc`, `location`, `handout`, `faction`, `item` and `scene`. The token holds only the id, so a rename never breaks it
  and the link always shows the entry's live name.
- **Where it works.** These fields take a mention:
  - a scene's GOAL, READ ALOUD, GM NOTES and OUTCOME;
  - every long text in CODEX's editor;
  - the END SESSION recap.

  Each shows as a link wherever it's read: PREP, CODEX, the player's INTEL, and inside a peek.
- **Auto-link.** Plain text that spells an entry's full name also becomes a link. The match is exact and
  case-sensitive, a whole word, and the longest name wins. Names under 3 characters are skipped, and an entry
  never links itself.
- **The peek.** Tapping a link opens a dialog with that entry's text, the same fields its CODEX row shows.
- **What a phone sees.** A phone resolves only entries in its own `toPlayerCodex` snapshot: revealed NPCs and
  locations, and the handouts it may read. A mention of anything else shows `(unknown)`, never a name.
  - Scenes, factions and items never reach a phone.
  - Being mentioned never reveals an entry.
  - On the GM's tablet, a deleted entry shows `(removed)`, and an unrevealed one is marked `(HIDDEN)`, so the GM knows
    the table can't follow it yet.
- **Printed item cards** (#203) have no link to tap and go on the table, so a mention prints as every phone would see
  it. A revealed NPC or place, or a revealed handout meant for every player, prints its name. Anything else prints
  `(unknown)`, including a private handout, whose title stays with its audience (`plainMentions`).
- **IMPORT GAME** gives every row a new id, so it remaps the ids inside tokens through the same map (`remapMentions`).
  A token pointing outside the file is kept, and shows as the placeholder.

## Building a campaign

The Core Rulebook has no adventure-writing procedure; it sends the GM to the GM's guide on Cubicle 7's website
(core pp.315, 317). This is what it does say, in the order a GM meets it. The GM app's SETUP tab (issue #45) walks
these steps and ticks each one from what the campaign already holds; nothing is stored.

| # | Step | Book | In the app | Ticks when |
|---|---|---|---|---|
| 1 | Kind of game and content limits | core p.316 | NEW CAMPAIGN › TABLE, SETUP › FRAMEWORK (§11.79) | a kind of game |
| 2 | Framework (who, what, the shared goal) and Framework Bonus | core pp.18–20, 316–317, 374 | NEW CAMPAIGN › PREMISE, SETUP › FRAMEWORK | `framework` not empty |
| 3 | Tier (100–400 XP; custom 50, 75 or 500) | core pp.19–20, 160 | NEW CAMPAIGN › TIER, PARTY › ASCEND | always |
| 4 | Setting, kept to a limited area | core pp.296–309, 320 | CODEX › LOCATIONS (ADD FROM BOOK copies a book's place and the places inside it; the SPACE HULK GENERATOR writes a hulk and its rooms, #50) | a location |
| 5 | Patron (two Frameworks each), optional | core pp.310–313; Forsaken System Player's Guide pp.64–89 | NEW CAMPAIGN › PREMISE, SETUP › PATRON | `patron` not empty |
| 6 | Factions and Keywords; who can work together | core pp.42–87, 167, 317, 375–378 | CODEX › FACTIONS | a faction |
| 7 | Characters | core p.17 | PARTY › the builder | an Agent |
| 8 | NPCs and locations, a few vivid features each | core pp.315, 317, 168, 326 | CODEX › NPCS, LOCATIONS | an NPC |
| 9 | Scenes: set the scene, ask, listen, describe consequences, keep the plot moving; fail forward | core pp.317–319, 160–161, 165–166 | PREP | an adventure with a scene |
| 10 | Combat. Budget: two Troops per Agent, half in a Mob, plus one Elite or Adversary | core p.176; Threat Assessment p.8 | PREP's prepared encounter, TRACK | a scene with a prepared encounter |
| 11 | Session: Wrath 2, Glory 0, Ruin = players; Objective d6; recap; cliffhanger; XP 8, 10 or 12; Wealth every three or four sessions | core pp.30, 43, 162, 317, 320–321 | PARTY › START / END SESSION | a session started |

## Screens

**GM tablet**
- **Prep**: adventures and their beats; link NPCs, locations, clues and an encounter to each beat.
- **Run**: the active beat card (read-aloud text, secrets, NPCs present, clues to hand out, "start encounter"), the
  combat tracker, and the pools strip.
- **Codex**: NPCs, locations, factions, items; search; reveal toggles.
- **Session**: start (resets per rules-flow §1; objective reminders) and end (XP per player, recap, wealth reminder).

**Player phone**
- Play sheet, a handout inbox with new-item badges, known NPCs and locations, party framework and Glory, and the
  latest session recap.

## Content packs

Bestiary data is one flat folder, `packages/data/threats/*.json`, with each file's book in its `source` field ([data.md](data.md)). An adventure can be exported and imported as
JSON (factions, NPCs, locations, beats, handouts) so a new campaign can start from a prepared pack.

The repo ships no pack now; the first campaign was moved out to an import file. A pack is `packages/data/packs/<name>/` (`pack.json` + `characters/*.json`), loaded with `bun run seed <name> --owner …`.
