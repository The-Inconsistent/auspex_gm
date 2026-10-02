# Game logic: where each rule lives in the code

[rules-flow.md](rules-flow.md) says what the books say. This doc says **how and where the code implements it**, so you
can find or change a rule with confidence. Page cites are Core rulebook printed pages unless marked. For the plumbing
(socket, transactions, broadcast) see [architecture.md](architecture.md) and [backend.md](backend.md); for the
screens see [frontend.md](frontend.md); for threat JSON and packs see [data.md](data.md).

The app never rolls dice. It tracks state, enforces limits, and shows reminders.

**Where rules live**

| Layer | File | Holds |
|---|---|---|
| Pure rules | `packages/shared/src/state.ts` | `deriveStats`, `skillTotal`, `effectiveStrength`, `poolMax`, `isOut`, `canAct`, `sideUpNext`, `canSeize`, `pcStatus`, `threatStatus`, `toPlayerView`, `CONDITIONS`, `TURN_START_REMINDERS`, `TURN_END_REMINDERS` |
| | `packages/shared/src/threat.ts` | `Threat` schema, `threatClassAt`, `THREAT_ONLY_SOURCES` and `threatCite` (a stat block's page cite) |
| | `packages/shared/src/codex.ts` | `toPlayerCodex`, `EncounterEntry`, `MAX_ENCOUNTER_ROWS` |
| | `packages/shared/src/actions.ts` | `Action` union, `PLAYER_ACTIONS` |
| | `packages/shared/src/build.ts` | `CharacterBuild` (a character as its creation choices), `resolveBuild` (sheet, XP ledger, pending choices, problems), `purchaseKey` (the key an advancement purchase is dated by, §11.69), `meets` (every `Requirement` kind), `wargearMatches` |
| Enforcement | `apps/api/src/table/table.dispatch.ts` | `authorize` (who may send what) |
| | `apps/api/src/campaign/campaign.actions.ts` | pools, `session.start`, `session.end` |
| | `apps/api/src/character/character.actions.ts` | `character.adjust` (runs `pcHit`: Exhausted, Dying, Annihilation), `character.respite` |
| | `apps/api/src/encounter/encounter.actions.ts` | turns, Seize, ambush, threat and Mob damage, `beat.startEncounter` |
| | `apps/api/src/codex/codex.actions.ts` | `codex.save` reference and threat checks |
| | `apps/api/src/core/sql.ts` | `bump`: every counter delta is `greatest(0, col + d)` |
| Display | `apps/web/components/gm/tracker/tracker.tsx` | status chips, turn buttons, Condition reminders |

Tests: `packages/shared/src/state.test.ts` (`bun run test`); end to end: `apps/api/test/smoke.test.ts`.

> The api calls the same `isOut` / `canAct` / `sideUpNext` / `canSeize` for `turn.start`, `turn.seize` and `turn.end`:
> `liveTable()` loads the `LiveState` inside the action's transaction (`loadState(campaignId, tx)`). Change the rule
> once, in `state.ts`.

---

## 1. Derived stats (`deriveStats`, pp.36–37, sheet p.372)

Input: `CharacterStats` (attributes, skills, armour, speed, `mods`), GM `Overrides`, campaign Tier. Called on both
sides: web for display (sheet, party, tracker), api for the Dying and Dead checks (`healthOf()` in `character.adjust`
and `character.respite`, `isOut` in the turn actions).

| Stat | Formula in code | Page |
|---|---|---|
| `maxWounds` | T + 2 × Tier + `mods.maxWounds` | p.36–37 |
| `maxShock` | Wil + Tier + `mods.maxShock` | p.36–37 |
| `defence` | I − 1 + `mods.defence` | p.36–37 |
| `resilience` | T + 1 + `armour.ar` + `mods.resilience` | p.36–37, p.231 |
| `resolve` | Wil − 1 + `mods.resolve` | p.36–37 |
| `conviction` | Wil + `mods.conviction` | p.36–37 |
| `influence` | Fel − 1 + `mods.influence` | p.36–37 |
| `speed` | `stats.speed` (entered per Species, default 6) + `mods.speed` | p.29 |
| `determination` | T + `mods.determination` (dice) | p.72 for bonuses |
| `passiveAwareness` | ceil(`skillTotal(Awareness)` / 2) + `mods.passiveAwareness` | p.37, house §11.6; Ever Vigilant p.133 |
| `maxTraumatic` | Tier + 1 + `mods.maxTraumatic` | p.193–194; Ded 'Ard! Apocrypha p.235 |

**Precedence.** For the nine Trait keys in `Mods`: `override ?? (base + mod)`, then `Math.max(1, …)` (all Traits min 1,
p.36). An override **replaces** base and mod; it does not add. `passiveAwareness` and `maxTraumatic` take mods (a
Talent, a Background row, the GM's `gm.mods`) but no overrides (`Overrides` omits them); `passiveAwareness` is still
clamped to 1.

| Mechanism | Who sets it | Use for |
|---|---|---|
| `stats.mods` | whoever edits the sheet (GM, or the player on their own character) | printed modifiers: Primaris +3 Wounds, Honour the Chapter +1 Resolve ([kill-team.md](kill-team.md), [pregens.md](pregens.md)) |
| `overrides` | GM only (`authorize` refuses `character.update` with `overrides` from a player) | anything the formula gets wrong |

**Not modelled:** only one armour layer (`armour.ar`); a shield's bonus goes in `mods.resilience`. `armour.invulnerable`
is stored but unused; AP is applied at the table.

**Other helpers**

- `skillTotal(stats, skill)` = skill rating + its linked Attribute from `SKILLS` (sheet p.372).
- `effectiveStrength(stats)` = S + `armour.powered` (Powered (X), p.232).
- Melee weapons with `addStrength: true` print damage as S + X. `apps/web/lib/weapon-line/weapon-line.ts` resolves
  it to `effectiveStrength + damage` when it knows the wielder.

**Example** (the `deriveStats` test): Tier 4, T 6, I 5, Wil 3, Int 3, Fel 1, Awareness 3, AR 5, mods
`{ maxWounds: 3, resolve: 1 }` → Max Wounds 17, Max Shock 7, Defence 4, Resilience 12, Resolve 3, Influence 1 (0
clamped), Passive Awareness 3, Max Traumatic 5. With `overrides.maxWounds = 20`, Max Wounds is 20.
Melee, with made-up numbers: S 5 in armour with Powered 2 and a weapon at S+5 → prints `12`.

## 2. Pools

| Pool | Stored on | Cap (`poolMax`) | Floor | Page |
|---|---|---|---|---|
| Glory | `campaign.glory` | max(6, players + 2) | 0 | p.164 |
| Ruin | `campaign.ruin` | max(1, 2 × players) | 0 | p.320 |
| Wrath | `character.wrath` | none | 0 | p.164 |
| Personal Ruin | `combatant.personalRuin` | none | 0 | p.323, p.325 |

- **players** = number of characters in the campaign (`playerCount` in the api, `state.characters.length` in the
  web), not the number of tokens issued. The `max(1, …)` on Ruin only matters with zero characters.
- `pool.adjust` writes `least(cap, greatest(0, pool + delta))`, so overflow is lost and simultaneous taps can't
  overwrite each other. A stored value above a new, lower cap (a character was deleted) drops to the cap on the next
  adjust.
- Spends through `spend()` in `encounter.actions.ts` (Seize, ambush awareness) take 1 and **fail** if the pool is 0.
  Every other spend is a manual `pool.adjust` of −n.

**Who can adjust what** (`authorize` in `table.dispatch.ts`, `PLAYER_ACTIONS` in `actions.ts`)

| Action | GM | Player |
|---|---|---|
| `pool.adjust` Glory, Ruin | yes | no ("GM only") |
| `character.adjust` Wounds / Shock / Wrath / Traumatic, `raw` | yes | no |
| `character.update` name, detail | any | own only |
| `character.update` stats, conditions | any | no |
| `character.update` overrides, `annihilated` | yes | no |
| `character.supply` Wealth / Ammo | any, ± | own only, spend (−) only |
| `character.respite` | any | no |
| everything else (turns, Seize, awareness, threats, sessions) | yes | no |

**Ruin is visible to players** (p.320): `toPlayerView` does not strip `campaign.ruin`; the player sheet shows it.

**Example** (the current campaign, 5 characters): Glory 0–7, Ruin starts at 5, max 10.

## 3. Session lifecycle (`campaign.actions.ts`, `character.actions.ts`)

| Action | Effect | Page |
|---|---|---|
| `session.start` | every character Wrath = 2; Glory = 0; Ruin = players; closes any open `session` row and opens session n + 1 | p.162, p.164, p.320 |
| `session.end` | stores `xp` (0–100) and `recap` on the open session; adds `xp` to **every** character's `xp`; fails if none is open. Pools are left alone (the next `session.start` resets them) | p.321 |
| `character.respite` | Wounds = 0, Shock = 0, Wrath = 2. Refused while Dead or Dying (`pcStatus` server-side, via `healthOf()`) | p.193, pp.196–197 |

- "Unless continuing mid-action" (p.162) is the GM's call: just don't press START SESSION.
- Respite does **not** touch Traumatic Injuries or Conditions.
- **Supply** (`character.supply`, p.206, p.229): Wealth and per-type Ammo live in `stats` (`wealth`, `ammo`) as counters.
  Players only spend their own from the sheet (`authorize()` refuses a positive delta); the GM awards Wealth and Ammo
  from PARTY (§11.57). Conditions are the GM's too (the tracker, or ±COND in PARTY outside a fight). Nothing is spent automatically: Reloads
  and Influence Tests happen at the table. `adjustAmmo` is the shared helper (tested).
- **Requisition** (`packages/shared/src/requisition.ts`, pp.205–206, p.229): `requisitionTest` (shared Keywords,
  [ANY] per §11.15, bonus dice, DN = Value + `RARITY_DN`), `requisitionOutcome` (Wealth tops up a failed roll,
  Complication −1 Wealth), `requisitionYield` (Ammo 3, Grenades/Missiles 5 − Rarity). `stats.requisitioned` holds
  the session id of the last Test per slot, so each character gets one Wargear and one Ammo Test per session.
- **Catalogue items on a sheet** (`packages/shared/src/wargear.ts`): `sheetWeapon` turns a catalogue weapon into a sheet
  weapon (thrown range = N × Strength, p.207; a knife keeps its reach and gets a `Thrown (X m)` trait), `gearLine`
  makes the gear string (armour's AR and Powered, and the page), `requisitionKindOf` maps `grenade`/`ammo` to the Ammo Test.
- Not tracked: Objectives, automatic Wealth awards, Regroup healing (p.196). Regroup is a manual HEAL. Rank from XP
  is the builder's (`rankOf` in `resolveBuild`), for Rank requirements and "+Rank" grants when XP is spent.

**Traumatic Injuries** (p.193–194): `character.traumatic`; only the GM adjusts it directly (+TRAUMATIC button in the
tracker side panel). `pcStatus` marks the character Dead when `traumatic > maxTraumatic` (Tier + 1, plus any mod).

**One hit in `character.adjust`** (`pcHit` in `state.ts`, pp.193–199). `healthOf()` reads the row, `pcHit` returns the
counters after the hit, and the api writes them (safe: one action per campaign at a time). In order:

1. **Exhausted** (p.199, house §11.12): if the character is already Exhausted (Shock > max, or the Exhausted
   Condition), positive Shock becomes Mortal Wounds (`exhaustedShock`), which ignore Resilience (p.193). The hit that
   takes Shock past max stays Shock.
2. **Annihilation** (p.194, house §11.7): Wounds > 2 × Max Wounds in the one hit → `annihilated = true`, counters
   untouched; `pcStatus` says Dead. The GM clears it with `character.update { annihilated: false }` (RESTORE).
3. **Dying** (p.193): a positive Wounds delta adds **1** Traumatic Injury instead of Wounds, whatever its size (house
   §11.11); a negative one sets Wounds to `min(maxWounds, wounds + delta)`, so any healing ends Dying.
4. Otherwise Wounds move by the delta (floor 0); crossing into Dying adds `Prone` if it's missing.

This applies to a player's own taps too. `raw: true` (GM only; the tracker's undo) skips all of it and bumps the deltas
as sent.

Example (Max Wounds 8, Max Shock 5): SHOCK 6 → Shock 6, Exhausted. SHOCK 2 → Wounds 2. DMG 7 → Wounds 9, Dying, Prone.
DMG 3 → Traumatic +1, Wounds stay 9. HEAL 1 → Wounds 8. DMG 17 → Annihilated.

## 4. Combat state machine (`encounter.actions.ts`, pp.176–178)

State on the `encounter` row: `round` (starts 1), `currentId` (who is acting), `lastSide` (side that acted last;
null at Round start), `seizedSide` (side that Seized and can't again yet). Per combatant: `acted`, `ambushed`.

| Action | Checks | Writes |
|---|---|---|
| `encounter.start` | — | deactivates any active encounter, inserts an empty one (add PCs and threats after) |
| `turn.start` (id) | no one is acting; combatant is in this encounter; not `isOut` ("Dead: no more Turns" / "Slain: no more Turns"); not `acted`; not ambushed in Round 1; its side is `sideUpNext` | `currentId`; combatant `expiring` = its timed Conditions (§7) |
| `turn.seize` (id) | same first five checks; `canSeize(state, side)`; 1 Glory (Agent) / 1 Ruin (Threat) via `spend()` | `currentId`, `seizedSide = side`, `expiring` |
| `turn.end` | someone is acting | removes the `expiring` Conditions (character or combatant), clears `expiring`; combatant `acted = true`; `lastSide = side`; `seizedSide` kept if it's this side, else cleared; **auto rollover** if no combatant `canAct` |
| `encounter.newRound` | — | manual rollover (same `newRound()`) |
| `encounter.end` | — | `active = false` |

**Pure helpers** (the tracker uses these to show buttons, and the api calls them to enforce the same rules). Each takes
the whole `LiveState`, since telling Dead needs the characters.

- `isOut(s, c)`: a threat whose `threatStatus` includes Slain, or a PC whose `pcStatus` includes Dead. An Adversary
  over max Wounds is **not** out; the GM removes it (house §11.10). p.176, p.193, p.324.
- `canAct(s, c)`: not `acted`, not the current combatant, not (`ambushed` and Round 1), not `isOut`. p.177.
- `sideUpNext(s)`: prefer the side opposite `lastSide` (Agents when `lastSide` is null, so players pick first each
  Round); if that side has no one able to act, the other side; `null` when the Round is done. p.176–177.
- `canSeize(s, side)`: false if `seizedSide === side`, or if `sideUpNext(s) === side` (it would go next anyway, so
  there's nothing to pay for: "No need to Seize"); at Round start (`lastSide` null) only `threats`; otherwise only
  the side that just acted. p.176–177, p.320.

**Seize, step by step**

1. The side that just acted (`lastSide`) pays 1 and goes again. `seizedSide` = that side.
2. When its Turn ends, `seizedSide` stays set, so it can't Seize a second time in a row (house §11.1).
3. When the other side's Turn ends, `seizedSide` clears; both sides can Seize again later in the Round.
4. Round start: only the GM (Threats) can Seize, for 1 Ruin, so a Threat goes first (p.176, house §11.2). It's an
   ordinary Seize under the same once-per-turn limit: it sets `seizedSide = threats`, so the Threats can't chain a
   second Seize before the Agents act, but they can Seize again after that.

**Round rollover** (`newRound()`, p.176): after `turn.end`, if no combatant `canAct` (everyone left has acted, is
ambushed in Round 1, or is out), then all `acted` and `ambushed` reset to false, `round + 1`, `currentId`, `lastSide`,
`seizedSide` → null.

**Ambush** (p.177)

- GM marks one with `combatant.update { ambushed: true }` (free; the tracker offers AMBUSH only in Round 1 before it
  acted).
- Ambushed combatants fail `canAct` and `turn.start` in Round 1, and don't hold up the rollover.
- `combatant.aware` pays 1 Glory (Agent) or 1 Ruin (Threat) and clears the flag, so it acts normally in Round 1.
- `newRound()` clears every `ambushed` flag, so it never carries past Round 1.

**Edge cases**

- Slain threats and Dead PCs are out: they get no Turn and don't hold up the Round, so it rolls over without REMOVE.
  An Adversary over max Wounds stays in the turn order until the GM removes it.
- `combatant.remove` on the current combatant clears `currentId` through the FK (`on delete set null`), but doesn't
  trigger a rollover; press NEW ROUND if it was the last one.
- A side can't Seize when it's up next anyway (the other side has no one left), so it never pays 1 for nothing.
- `combatant.addCharacter` refuses a character already in the encounter ("Already in this encounter").

**Worked example.** Agents A1, A2; Threats T1 (ambushed), T2, T3. Glory 3, Ruin 5.

| # | Action | Result | `lastSide` / `seizedSide` |
|---|---|---|---|
| 1 | Round 1 opens | `sideUpNext` = agents; T1 shows AMBUSHED | null / null |
| 2 | `turn.start` A1, `turn.end` | | agents / null |
| 3 | `turn.seize` A2 | Glory 3 → 2; allowed because Agents just acted | agents / agents |
| 4 | `turn.end` | Agents can't Seize again (and have no one left) | agents / agents |
| 5 | `turn.start` T2, `turn.end` | the other side acted, so the Seize lock clears | threats / null |
| 6 | `turn.start` T3 | expected side is Agents, but none can act, so Threats go back to back (`turn.seize` T3 would be refused: no need) | |
| 7 | `turn.end` | only T1 is left, ambushed in Round 1 → **auto rollover** | null / null |
| 8 | Round 2: `turn.seize` T1 | Ruin 5 → 4; GM Seize at Round start | null / threats → threats / threats after `turn.end` |
| 9 | `turn.start` T2 | refused: "It's the Agents' turn"; `turn.seize` T2 also refused ("Already Seized") | |

Alternative at step 6: `combatant.aware` T1 (Ruin −1) makes T1 able to act in Round 1.

## 5. Threats

**Class from Tier** (p.323): `threatClassAt(threat, tier)` = the letter at position Tier in `threat.threat`
(`T` Troop, `E` Elite, `A` Adversary, `M` Monstrous Creature). A Tier beyond the printed row uses the last letter
(an app fallback, not a rule).

**Snapshot at join** (`addThreat`): each combatant row copies `threatClass` (at the current Tier), the whole stat
block into `statSnapshot`, and `personalRuin` from the block (0 if none). `loadState` reads `maxWounds` / `maxShock`
from the snapshot. A later data fix or Tier change doesn't alter a fight in progress.

**`threatStatus`** (p.324), checked in this order:

| Case | Status |
|---|---|
| Mob, `mobCount` 0 | Slain |
| Mob, `mobCount × 2 ≤ mobStart` | Resolve DN 3 at Round end |
| Wounds > max, class A | Dying or dead (GM) |
| Wounds > max, class T / E / M | Slain (M per house §11.3) |
| Shock > max (and max not null), class T | Slain |
| Shock > max, class E / A / M | Exhausted |
| Wounds > 0 | Wounded |

Wounds win over Shock: a Threat over both shows only the Wounds outcome. Mobs never show Shock outcomes.

**Shock "–"** (p.324): `shock: null` in the JSON → `maxShock: null`. `combatant.adjust` refuses any non-zero `shock`
delta on it ("This Threat never suffers Shock").

**Exhausted Threats** (p.199): on a single Threat that is already Exhausted (Shock > max, or the Condition), positive
Shock becomes Wounds (`exhaustedShock`), as for Agents. `raw: true` (the tracker's undo) skips it.

**Class rules** (pp.323–324): `THREAT_CLASS_RULES` in `threat.ts` lists what each class changes (Troop: no Crits or
Complications, Determination costs 1 Ruin, no Ammo; Elite: Determination 1 Ruin, 3 Ammo; Adversary and Monstrous:
free Determination, unlimited Ammo; Monstrous: immune to Fear, Pinned, Staggered, causes Terror). The tracker shows
them as chips above the stat block. `combatant.update` refuses to add a `MONSTROUS_IMMUNE` Condition to class M.

**Mobs** (pp.202–203, p.325)

- Created by `combatant.addThreat { mobCount ≥ 2 }` or a prepared `asMob` entry. `mobStart = mobCount`; label
  defaults to `Name ×N`.
- Every member has 1 Wound, so in `combatant.adjust` a Wounds delta changes `mobCount`, not `wounds`:
  `least(mobStart ?? mobCount, greatest(0, mobCount − loss))`. DMG 3 removes 3 members; HEAL restores them, never
  above the starting size.
- Shock: one hit of more Shock than the members' max Shock adds 1 to `loss` (removes one member). A smaller hit has no
  effect (house §11.9), and a Mob keeps no Shock track: its `shock` counter isn't written.
- Half-slain prompt: the `threatStatus` chip above, visible to GM and players while it holds, and a vox-log line from
  `roundEndReminders` whenever a Round ends (the last END TURN, or NEW ROUND) (p.325, house §11.13). It's a prompt
  only; the test and the flight are the table's.
- Setting `mobCount` directly with `combatant.update` also sets `mobStart = greatest(coalesce(mobStart, 0), mobCount)`,
  so a Threat turned into a Mob this way gets the half-slain prompt and the healing cap. `mobCount: null` turns it back
  into a single Threat and nulls `mobStart`.

**Personal Ruin** (p.323, p.325): per combatant, from the stat block. The tracker side panel shows SPEND / +1 only
when the block has `personalRuin`. It's separate from the GM's Ruin pool.

## 6. PC states (`pcStatus`, pp.193–196)

| Status | Condition in code | Page |
|---|---|---|
| Dead | `annihilated`, or `traumatic > maxTraumatic` (Tier + 1) | p.193–194 |
| Dying | else `wounds > maxWounds` | p.193 |
| Wounded | else `wounds > 0` | p.193 |
| Exhausted | `shock > maxShock` (independent, can show with any of the above) | p.196, p.199 |

Wounds equal to max is Wounded, not Dying (tested). Counters have no upper cap, so the hit that makes a PC Dying can
take Wounds past max + 1; later hits become Traumatic Injuries (§3). `isExhausted` (used by `pcHit`) also counts the
manual Exhausted Condition.

## 7. Conditions (pp.197–200)

`CONDITIONS` in `state.ts` is the picker list: Bleeding, Blinded, Exhausted, Fear, Frenzied, Hindered, On Fire, Pinned,
Poisoned, Prone, Restrained, Staggered, Terror, Vulnerable. Stored as a plain string array (`character.conditions` or
`combatant.conditions`); the schema accepts any string, and stack values like `Hindered (2)` aren't modelled beyond
the name. The automatic Exhausted status comes from `pcStatus` / `threatStatus`, separately from the manual Condition.

**Timed Conditions** (pp.199–200, house §11.8): `TIMED_CONDITIONS` = Hindered, Staggered, Vulnerable, which last "until
the end of your next Turn". `isTimed` also matches `Hindered (2)` etc. `turn.start` / `turn.seize` copy the ones the
combatant holds into `combatant.expiring`; `turn.end` removes those from its Conditions. One gained during its own Turn
isn't armed, so it lasts to the end of the next one. The tracker logs "… ends at the end of this Turn" at START TURN.
`ponytail:` a timed Condition removed and gained again within the same Turn ends with it anyway.

**Turn reminders** (pp.198–200)

| Table | Conditions | Fires |
|---|---|---|
| `TURN_START_REMINDERS` | On Fire, Poisoned, Frenzied | tracker `startTurn`, after a successful `turn.start` or `turn.seize` |
| `TURN_END_REMINDERS` | Bleeding | tracker `endTurn`, after a successful `turn.end` |

They're amber lines in the GM tablet's VOX LOG only: client-side, not stored or broadcast, and they fire only for
turns started or ended from that tablet (buttons or the command line). Timed Conditions expire server-side (above).

## 8. Hidden information

The gateway sends the GM room the raw snapshots and the players room `toPlayerView(state)` / `toPlayerCodex(codex)`.

| Snapshot | Players get | Hidden |
|---|---|---|
| `LiveState.campaign` | everything, including Ruin | — |
| `LiveState.characters` | every character, in full | — |
| `LiveState.encounter.upNext` | `sideUpNext` of the full state (player view only) | — |
| `LiveState.encounter.currentId` | as is, unless a hidden threat is acting | → `UNSEEN_ID` |
| threat combatant, `visibility: "hidden"` | nothing: left out of `combatants` | all |
| threat combatant, `visibility: "bars"` | label, marker, class, mob count, Wounds / Shock and their maxima, Conditions, turn flags | `stats` → null, `threatId` → `""`, `personalRuin` → 0 |
| threat combatant, `visibility: "stats"` | all of the above plus `stats` | — |
| `Codex.factions`, `Codex.adventures` (with beats) | nothing (empty arrays) | all |
| `Codex.locations` | revealed ones only | `gmNotes`, `hazards` blanked; `parentId` → null unless the parent is revealed |
| `Codex.npcs` | revealed ones only | `gmNotes`, `secrets` blanked; `statSource` → `none`; `factionId` → null; `attitude` kept (rules-flow §11.89) |
| `Codex.handouts` | revealed ones only | — |
| `Codex.sessions` | all, with recaps | — |

- **Threat visibility** (rules-flow §11.56): the tracker's PLAYERS picker sends `combatant.update { visibility }`. New
  threats start at `bars` unless `combatant.addThreat` or the `EncounterEntry` says `hidden` (or `stats`). The `threatId` is withheld, but
  the label defaults to the stat-block name, so rename the label if the identity itself is the secret.

## 9. Prepared encounters (`beat.startEncounter`)

A beat's `encounter` is a list of `EncounterEntry { threatId, count, asMob, marker?, label?, visibility? }`.

1. Every `threatId` is checked against the loaded bestiary before anything is written.
2. A new encounter starts (any active one is deactivated).
3. Every character in the campaign is added as a PC combatant.
4. Each entry: `asMob && count > 1` → one Mob row with `mobCount = count`. Otherwise `count` separate rows, labelled
   `Name 1…N` when `count > 1`.
5. The beat is set to `active`.

**`MAX_ENCOUNTER_ROWS` = 60** (`codex.ts`) is an **app limit, not a rule**: it bounds the inserts one transaction runs.
`codex.save` refuses a beat whose rows exceed it; a Mob counts as one row whatever its size. Also capped: 30 entries
per beat, `count` ≤ 500. See [campaign-model.md](campaign-model.md).

## 10. House decisions (rules-flow §11)

| # | Decision | Implemented by |
|---|---|---|
| 1 | Seize once per handoff | `canSeize` + `encounter.seizedSide`, kept/cleared in `turn.end` |
| 2 | GM Round-start Seize costs 1 Ruin, same once-per-turn limit | `canSeize` (`lastSide` null → threats only), `spend()` in `turn.seize` |
| 3 | Monstrous: free Determination, killed past Max Wounds | `threatStatus` (M → Slain); `THREAT_CLASS_RULES` chip. Determination is left to the table |
| 4 | Withstand repeatable while Ruin lasts | not coded; a manual Ruin spend and HEAL |
| 5 | Corruption 11 = Contaminated | not coded (Corruption isn't tracked) |
| 6 | Passive Awareness uses Awareness | `deriveStats().passiveAwareness` |
| 7 | Annihilation after Resilience | `pcHit` (the entered Wounds are after Resilience) |
| 8 | "End of next Turn" = the affected character's | `combatant.expiring`, armed in `turn.start` / `turn.seize`, removed in `turn.end` |
| 9 | Mob Shock below max Shock has no effect | `combatant.adjust` (Mob `loss`) |
| 10 | Adversary over max Wounds stays in the turn order | `isOut` (only Slain / Dead are out); the GM REMOVEs it |
| 11 | A Wound while Dying = 1 Traumatic Injury per hit | `pcHit` |
| 12 | Exhausted conversion starts after the hit that Exhausts | `exhaustedShock` (in `pcHit` and `combatant.adjust`) |
| 13 | Mob Resolve prompted at every Round end while half slain | `roundEndReminders`, tracker `endTurn` / NEW ROUND |

Campaign-specific GM decisions are in [kill-team.md](kill-team.md); they live in the pack data, not in code.

## 11. What the app deliberately doesn't do

Per [rules-flow.md](rules-flow.md) §10: all dice and Tests (§7), DNs, cover / range / vision, the damage pipeline
(§4: the GM enters the resulting Wounds or Shock), Determination, Critical Hits and Complications, Psychic powers (§8),
Corruption and Mutation (§9), Fear / Terror, Hold actions, Multi-Action, Battlecry, the optional "I Wanna Roll!"
order, when an encounter ends, and an Adversary's Dying-vs-dead call.

Known gaps against the spec: Pinned doesn't expire because the attacker isn't tracked. The live list is
[rules-flow.md](rules-flow.md) §12.
