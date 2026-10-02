# Campaign model

Everything outside the combat tracker, so a GM can prep and run a whole campaign from the tablet. Rules
references point at [rules-flow.md](rules-flow.md). Nothing here is tied to one story: factions are data (with
the Keywords the rules actually use), so a new campaign with new factions is a new record, not new code.

Decisions (2026-09-24): in-person play with real models and terrain, so **no maps in the app**. Locations are
text, notes and handouts. Build order: combat tracker plus this campaign core first; the items tracker right after.

## Entities

```
Campaign ── name, tier, framework + framework bonus (core p.18, party sheet p.374),
 │           patron, party keywords
 ├─ Faction      name, keywords[], stance (ally | neutral | rival | enemy), notes, secrets
 ├─ Adventure    title, premise, status (planned | running | done)
 │   └─ Beat     order, type, title, goal, status (planned | active | done | skipped),
 │               readAloud (player-facing), gmNotes (secret), locationId, npcIds[],
 │               clueIds[], encounter (prepared roster), exits[], outcome
 ├─ Location     name, parentId (planet → site → chamber), description, gmNotes,
 │               hazards (Battlezone tables, Threat Assessment p.9–21), revealed
 ├─ NPC          name, factionId, role, portrait?, statSource, attitude (core p.168),
 │               gmNotes, secrets, revealed
 ├─ Item         name, kind (weapon | armour | wargear | relic | ammo | clue-object),
 │               holder (party | characterId | npcId | locationId), profile?, notes
 ├─ Handout      title, body (text), image?, revealedAt, audience (all | characterIds)
 └─ Session      number, date, recap ("Previously in…", core p.317), beatIds played,
                 objectives rolled (core p.43), xpAwarded (8/10/12, core p.321), notes
```

- **The UI says SCENE.** The GM reads SCENE everywhere; code, actions (`beat.reorder`, `beat.startEncounter`), the
  `beat` table, packs and export files keep `beat`.
- **Beat types**: briefing, travel, investigation, social, combat, revelation, rest. The type only picks an icon and
  a checklist. There is no workflow engine: beats are an ordered list the GM can reorder, skip or add to mid-session.
- **Goal and exits** (issue #38): `goal` is what the Agents are after. Each exit is `{label, beatId}`: "if they side with
  the Magos" and, once the GM has written it, the scene of the same adventure it leads to (`beatId` null for a note).
  Exits are planning notes: DONE never follows one, because Core p.318 (step 5) warns against forcing one path.
  `codex.save` refuses a target outside the beat's adventure, deleting a beat clears it from exits (the label stays),
  import remaps it, and a pack's exits are labels only, since pack beats have no key to point at.
- **NPC statSource**: one of `bestiary` (a `threatId` from any loaded book), `quick` (a Tier, from the Quick NPC table,
  core p.326), or `none`. Custom stat blocks aren't built yet. The Mechanicus has no bestiary entries in the core
  book; its stat blocks come from the homebrew High Altar of Technology (`hat-*` threats), Redacted Records and
  Redacted Records 2 (`rr1-*`, `rr2-*`), Darktide and Litanies of the Lost (docs/data.md §4).
- **Prepared encounter**: a list of `{threatId, count, asMob, marker, label, visibility}` (`EncounterEntry`, see [data.md](data.md)). "Start encounter" on the beat
  loads it into the tracker. The builder shows the Threat Assessment p.8 guideline: *two Troops per Agent, half in a
  Mob, plus one Elite or Adversary; more than 10 enemies is hard to track, so use Mobs*.
- **Reveal**: NPCs, locations and handouts have a `revealed` flag. Only revealed ones reach player phones, trimmed
  by the same server-side view as hidden threat stats.
- **Private notes**: a handout's `audience` (character ids, empty = every player) limits a revealed handout to those
  Agents' players; deleting its only reader hides it again. Each character also carries GM-written `objectives`
  (`{ text, done }`, set by the GM-only `character.objectives`) that only its own player receives.

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

## First campaign (seed pack, editable)

*"Ordo Xenos dispatch a five-member Deathwatch Kill Team to eliminate Ork Kommandos near the Volkus dig site, where
they uncover a hidden tomb world. What lies beneath, and why are the Mechanicus set on recapturing the site?"*

- **Tier 4**, five Primaris Space Marines (Vow of Absolution archetypes). With 5 players, Glory max 7; Ruin starts
  at 5, max 10.
- **Kommandos**: Gutshiva's Kommandos (NPCs and hooks), Threat Assessment p.89, core p.355. At Tier 4 a Kommando is
  a **Troop** (Tier row E E T T), so they come in Mobs led by an Elite or Adversary.
- **Tomb**: Necrons, Threat Assessment pp.131–156.
- **Mechanicus**: the High Altar of Technology stat blocks (`hat-*`, see above).
- **Patron**: Inquisitor Marie Von Xardt, Ordo Xenos (FSPG p.26). She directs the Watch station under Enoch's northern tundra.
- **Session 1** (the six scenes of the 2026-09-27 campaign bible: briefing, drop, camp, Magos, ambush, below the seal) is
  in the seed pack, `packages/data/packs/volkus/pack.json`. Session 2 ("The Tomb Beneath") is an outline of beat titles.
  A handout meant for one Agent (Von Xardt's private order) ships with an empty audience; the GM sets it at the table.
