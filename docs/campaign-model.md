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
 │   └─ Beat     order, type, title, status (planned | active | done | skipped),
 │               readAloud (player-facing), gmNotes (secret), locationId, npcIds[],
 │               clueIds[], encounter (prepared roster), outcome
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

- **Beat types**: briefing, travel, investigation, social, combat, revelation, rest. The type only picks an icon and
  a checklist. There is no workflow engine: beats are an ordered list the GM can reorder, skip or add to mid-session.
- **NPC statSource**: one of `bestiary:<threatId>` (any loaded book), `quick:<tier>` (Quick NPC table, core p.326), or
  a `custom` stat block using the threat schema. The Mechanicus has no bestiary entries in the core book, so they
  are Quick NPCs or custom blocks built from the Skitarius (p.101) and Tech-Priest (p.109) archetypes.
- **Prepared encounter**: a list of `{statSource, count, asMob, marker, label}`. "Start encounter" on the beat
  loads it into the tracker. The builder shows the Threat Assessment p.8 guideline: *two Troops per Agent, half in a
  Mob, plus one Elite or Adversary; more than 10 enemies is hard to track, so use Mobs*.
- **Reveal**: NPCs, locations and handouts have a `revealed` flag. Only revealed ones reach player phones, trimmed
  by the same server-side view as hidden threat stats.

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

Bestiary data stays per book (`packages/data/<book>/threats/*.json`). An adventure can be exported and imported as
JSON (factions, NPCs, locations, beats, handouts) so a new campaign can start from a prepared pack.

## First campaign (seed pack, editable)

*"Ordo Xenos dispatch a five-member Deathwatch Kill Team to eliminate Ork Kommandos near the Volkus dig site, where
they uncover a hidden tomb world. What lies beneath, and why are the Mechanicus set on recapturing the site?"*

- **Tier 4**, five Primaris Space Marines (Vow of Absolution archetypes). With 5 players, Glory max 7; Ruin starts
  at 5, max 10.
- **Kommandos**: Gutshiva's Kommandos (NPCs and hooks), Threat Assessment p.89, core p.355. At Tier 4 a Kommando is
  a **Troop** (Tier row E E T T), so they come in Mobs led by an Elite or Adversary.
- **Tomb**: Necrons, Threat Assessment pp.131–156.
- **Mechanicus**: Quick NPCs or custom blocks (see above).
- The session 1 beat outline is in the chat plan and gets written into the seed pack once the characters are settled.
