# Wrath & Glory — game flow, as the rulebook defines it

Source: *Warhammer 40,000 Wrath & Glory* core rulebook (Cubicle 7). Every rule cites the **printed** page
(PDF page = printed + 1). This is the spec the app implements; where the book is ambiguous, the house
decision is marked **[HOUSE]** and listed in §11. The app does not roll dice (in-person play) — it tracks
state, enforces limits, and shows the right rule at the right moment.

---

## 1. Session lifecycle

| When | What happens | Page |
|---|---|---|
| Campaign start | Starting XP = 100 × Tier; starting Wealth = Tier | p.148, p.38 |
| **Session start** (unless continuing mid-action from last session) | Every character: **Wrath = 2**. Party **Glory = 0**. GM **Ruin = number of players**. Each player rolls d6 for their **Objective** | p.162, p.164, p.320, p.43 |
| During play | Scenes → Tests when outcome matters; GM sets DN | pp.159, 317–318 |
| Between encounters | **Regroup** (~1 h): one Medicae user heals one character for Wounds = their Medicae (Int) pool | p.196 |
| Rest | **Respite** (≥ 6 h, uninterrupted): Wounds → 0, Shock → 0, Wrath → 2. Not while Dying | pp.196–197 |
| Session end | ~10 XP each (8 if little achieved, 12 for great play); ~1 Wealth per player every 3–4 sessions. Wrath/Glory/Ruin never carry over | p.321, p.164, p.320 |

Rank from total XP earned: 0–39 = 1, 40–79 = 2, 80–99 = 3 (max 3); 100+ in the current Tier = eligible to Ascend
(all characters, group decision) (pp.146–148).

## 2. Pools

| Pool | Start | Max | Gains | Page |
|---|---|---|---|---|
| **Wrath** (per character) | 2 | none | GM award; completing the session Objective | p.164, p.43 |
| **Glory** (party) | 0 | **max(6, players + 2)**; overflow lost | +1 per Wrath Critical (Wrath Die 6); +1 by Shifting an Exalted Icon (once per Test) | p.164, p.166 |
| **Ruin** (GM) | players | **2 × players**; overflow lost | +1 when a player fails a Corruption Test, fails a Fear Test, or the GM rolls a 6 on the Wrath Die; optional: +1 instead of narrating a Complication | p.320, p.163 |
| **Personal Ruin** (Champion threat) | per stat block | — | — | p.323, p.325 |

Ruin is **visible to the players** (p.320).

**Spends**

| Spend | Cost | Effect / limit | Page |
|---|---|---|---|
| Wrath: Reroll Failures | 1 Wrath | reroll every 1–3; once per Test; can't reroll a Wrath-Die Complication | p.164 |
| Wrath: Narrative Declaration | 1 Wrath | not spent if GM declines | p.164 |
| Wrath: Restore Shock | 1 Wrath + Combat Action | recover Rank + Tier Shock; conscious only | p.164, p.196 |
| Glory: Increase Dice Pool | n Glory | +n dice, after the roll and any Wrath reroll; can't be rerolled; once per Test | p.165 |
| Glory: Increase Damage | n Glory | +n damage on a successful attack, any amount | p.165 |
| Glory: Critical severity | per table | Glorious Criticals column of the Critical Hit table | p.197–198 |
| Glory: Seize the Initiative | 1 Glory | see §3 | p.177 |
| Glory: Ambush awareness | 1 Glory / character | that Agent acts normally in round 1 | p.177 |
| Ruin: Reroll Failures | 1 Ruin | on any NPC Test (not Complications) | p.320 |
| Ruin: Seize the Initiative | 1 Ruin | "can't Seize the Initiative more than once per turn"; also lets a Threat act first in a Round | p.320, p.176 |
| Ruin: Restore Shock | 1 Ruin | NPC recovers 1d3+3 Shock; counts as that NPC's Action | p.320 |
| Ruin: Roll Determination | 1 Ruin | any Threat (Adversaries roll it free) | p.320, p.323 |
| Ruin: Ruin Actions | per ability | Champions only; outside initiative, any point in the Round; same Ruin Action max once per Round. Defaults: extra Move, extra Attack | p.320, p.325–326 |
| Ruin: Withstand | 1 Ruin | Champion at Max Wounds recovers 1 Wound and survives the attack | p.326 |
| Ruin: Mob-leader redirect | 1 Ruin | an attack that damaged the leader hits a Troop in the Mob instead | p.325 |
| Ruin: Ambush awareness | 1 Ruin / threat | that Threat acts normally in round 1 | p.177 |

## 3. Combat encounter — state machine (pp.176–178)

```
Step 1  Determine ambushes (GM)            ambushed = no Turn in Round 1
Step 2  Set the scene (GM narrates)
Step 3  Take Turns ─┐
        │  Round start: "start of Round" effects fire; players pick an Agent.
        │  GM may Seize (1 Ruin) so a Threat takes the first Turn.
        │  After each Turn: the other side picks one of theirs.
        │    - Seize: the side that just acted spends 1 Glory/Ruin to act again.
        │      Once only before the other side acts ("once per turn", p.320).
        │    - If the other side has no one left, the rest act back to back.
        │  End of Turn: "until end of Turn" effects expire.
Step 4  Round ends when everyone able to act has had a Turn.
        "until end of Round" effects expire; unused held actions are lost;
        Reflexive Action refreshes. New Round → Step 3.
Encounter ends when the GM says so.
```

- **Ambush** (p.177): ambushed characters skip Round 1; once all non-ambushed characters have acted, normal
  order resumes. Spend 1 Glory (Agent) / 1 Ruin (Threat) per character to act normally.
- **Hold action** (p.177, p.187): skip the Combat Action and hold it; use it later in the Round, or interrupt
  someone's Movement/Action with an opposed Initiative Test. Lost at end of Round.
- **Multiple Turns per Round** happen before the Round ends (p.176).
- **Optional "I Wanna Roll!"** (p.177): fixed order by Initiative Icons; ties Agents first. Off by default.
- **Battlecry** abilities fire once, at the start of combat or the Threat's first Turn (p.323).

### What a Turn allows (p.178–180)
One each of: Movement, Combat Action, Simple Action, Reflexive Action (per Round); any number of Free Actions.
Multi-Action: +2 DN per extra action to all Tests, never two attacks. Full-Round Actions (Sprint, Charge,
Full Defence…) take the whole Turn. Movement: Speed; Run 2×; Sprint 3× (Full-Round); Crawl ½.

## 4. Damage pipeline (pp.182–183, 192–197)

1. Pool: Ballistic Skill + A (ranged) or Weapon Skill + I (melee), one die is the Wrath Die.
2. Hit if Icons ≥ target **Defence** (after cover, range, size, Prone, Vulnerable…; Defence min 1).
   Surplus Exalted Icons may Shift for +1 ED each (not in Multi-Attack, not Blast).
3. Damage = weapon Damage (+ Strength in melee) + ED (4–5 = +1, 6 = +2; Brutal/Melta differ).
4. Effective Resilience = Resilience − AP (Invulnerable armour ignores AP, p.232).
   - Damage > Resilience → Wounds = the difference.
   - Damage = Resilience → 1 Shock.
   - Damage < Resilience → nothing (Critical still hits).
5. **Critical Hit**: hit + Wrath Die 6 → d66 Critical table (p.198), +1 Glory to the party. Misses never crit.
6. **Determination** (Free Action, p.196): on taking ≥1 Wound, roll Toughness dice; each Icon turns 1 Wound
   into 1 Shock. Not vs Mortal Wounds, not while Exhausted.
7. **Mortal Wounds** ignore Resilience (p.193).

### Damage states — Agents (and Adversaries)
| State | Trigger | Effect | Page |
|---|---|---|---|
| Wounded | Wounds > 0 | +1 DN on all Tests | p.193 |
| **Dying** | Wounds **>** Max Wounds | Memorable Injury, fall Prone, can't stand; one action per Turn (Crawl, basic Combat Action, Fall Back); every further Wound → a **Traumatic Injury** instead | p.193–194 |
| Dead | Traumatic Injuries > **Tier + 1**, or one attack > 2 × Max Wounds (Annihilation) | — | p.193–194 |
| Leaves Dying | recovers any Wounds | — | p.194 |
| **Exhausted** | Shock **>** Max Shock | Walk/Crawl, basic Combat Action or Fall Back only; no Determination; further Shock → Mortal Wounds. Ends when Shock is reduced | p.196, p.199 |

### Threat classes (class depends on campaign Tier, p.323)
| | Troop (T) | Elite (E) | Adversary (A) | Monstrous (M) |
|---|---|---|---|---|
| Wounds > max | killed | killed | Dying **or** dead (GM) | killed (p.324) |
| Shock > max | **killed** | Exhausted | Exhausted | Exhausted |
| Critical Hits / Complications | no / no (unless an ability says so) | yes | yes | yes |
| Determination | 1 Ruin | 1 Ruin | free | [HOUSE] free (like Adversary) |
| Ammo / Salvo | none | 3 Ammo, Salvo | unlimited | unlimited |
| Other | forms Mobs | — | usually personal Ruin | immune Fear, Pinned, Staggered; causes Terror |

Shock "–" = never suffers Shock (p.324).

### Mobs (pp.202–203, 324–325)
- Troops of one profile; one Turn per Round. Form as a Free Action (acts immediately, members lose their places);
  split as a Free Action (not in the Round it formed).
- Attack: one Test, +1 die per Troop, max half the Mob.
- **Each member has 1 Wound.** A hit with damage > Resilience kills one; each Icon over Defence hits one more.
- Shock: all share Max Shock; Shock over max removes one member (+1 per Icon over Defence).
- **Half or more slain → DN 3 Resolve Test at end of Round**; fail = the whole Mob flees (as Terror).
  A Complication on that Test kills 1d3 more.
- Leaders are separate Threats that operate with the Mob.

## 5. Conditions (pp.197–200)

Same Condition stacks as a value (`Hindered (2)` = +2 DN); different Conditions with similar penalties don't
stack — use the worst. Any may end at scene end (GM).

| Condition | Effect | Ends | Tracker automation |
|---|---|---|---|
| Bleeding (n) | n Mortal Wounds at **end** of each of your Turns | DN 4 Toughness, or ally Medicae | reminder at end of Turn |
| Blinded | +4 DN on sight tasks (incl. combat) | GM / appropriate action | — |
| Exhausted | see §4 | Shock reduced | auto from Shock > max; further Shock → Mortal Wounds (auto) |
| Fear | +2 DN all Tests | scene end, or ally Leadership DN 2 + Fear | player fail → +1 Ruin (p.320); refused on Monstrous |
| Frenzied | charge nearest enemy, All-Out Attack, +1 S, immune Fear/Pinned | DN 3 Willpower at start of Turn | reminder at start of Turn |
| Hindered (n) | +n DN all Tests | end of next Turn | auto-expires (§11.8) |
| On Fire | 1d3 Mortal Wounds at **start** of each of your Turns | Action: go Prone + DN 3 Athletics | reminder at start of Turn |
| Pinned | must move to/stay in cover; +2 DN BS vs the pinner | start of the attacker's next Turn | refused on Monstrous (the attacker isn't tracked, so it doesn't expire) |
| Poisoned | +2 DN all Tests | Medicae, or Toughness Test at start of Turn | reminder at start of Turn |
| Prone | −2 Defence vs attacks within 5 m, +1 beyond | stand (Free Action) | — |
| Restrained | no Movement, −2 Defence | by source | — |
| Staggered | ½ Speed, no Run/Sprint | end of next Turn | auto-expires (§11.8); refused on Monstrous |
| Terror | Fear + must flee | scene end, or ally Leadership DN 2 + Terror | — |
| Vulnerable (n) | −n Defence | end of next Turn | auto-expires (§11.8) |

## 6. Derived traits (pp.36–37, sheet p.372)

All Traits have a **minimum of 1**, except Corruption (p.36).

| Trait | Formula |
|---|---|
| Defence | Initiative − 1 |
| Resilience | Toughness + 1 + armour AR (highest layer; Shields add on top, p.231) |
| Max Wounds | Tier × 2 + Toughness |
| Max Shock | Willpower + Tier |
| Determination | Toughness (dice) |
| Conviction | Willpower |
| Resolve | Willpower − 1 |
| Influence | Fellowship − 1 |
| Passive Awareness | ½ Awareness total, rounded up |
| Max Traumatic Injuries | Tier + 1 |
| Speed | by Species (Human 6, Astartes/Primaris 7, Aeldari 8, Ork 6; p.29) |

## 7. Tests (reference only — dice stay physical)

Pool = Attribute + Skill; the **Wrath Die** replaces one die. 4–5 = Icon, 6 = Exalted (2 Icons). Success: Icons ≥ DN
(Standard DN 3; table p.161: 1/3/5/7/9/12). Order: roll → Wrath reroll → Glory dice → count → Wrath Die effects
(6 = Glory +1 / crit on a hit; 1 = Complication) → Shift surplus Exalted Icons (p.159–166). Opposed: most Icons wins,
ties to the initiator (p.170). Round up always (p.159).

## 8. Psychic powers (pp.257–267)

One activation per Round. Pool = Psychic Mastery (Wil). Bound +0 / Unbound +1 / Transcendent +max(Rank,Tier)+1
Wrath Dice (Transcendent: Shock = Wrath Dice count; power level locks upward for the scene). **Any Wrath Die 1 →
Perils of the Warp** (d66, +10 per extra 1). Sustaining: +2 DN to all Tests per sustained power; external damage →
Willpower Test (DN = Wounds + Shock taken + penalty) or all sustained powers end. Deny the Witch: DN 2 + power DN +
Potency Shifts; uses your Combat Action.

## 9. Corruption (pp.285–287)

Corruption Test: Conviction vs source DN + level modifier. Fail → GM +1 Ruin, gain DN − Icons (×2 on a
Complication). Levels: 0–5 Pure (+0), 6–10 Tarnished (+1) [HOUSE: 11 belongs to Contaminated], 11–15 Contaminated
(+2), 16–20 Tainted (+3), 21–25 Defiled (+4), 26+ Chaos Spawn (character lost). Each level increase → Mutation Test
(Conviction vs DN 3 + level modifier; may choose to fail).

## 10. What the app does with all this

**Tracks and enforces (server):** pools with caps; session start/reset; alternating turns with Seize
(cost + once-per-handoff limit + GM round-start seize); ambush; Round rollover; per-class damage outcomes
(slain/Dying/Exhausted); Mob members (1 Wound each) and the half-slain Resolve prompt; Traumatic Injury count
vs Tier + 1; personal Ruin; Respite reset.

**Shows (UI):** derived traits; auto states (Wounded, Dying, Exhausted, Slain); turn-boundary reminders
(Bleeding, On Fire, Poisoned, Frenzied); per-class rule chips (Troop: no crits/Determination costs Ruin);
rules reference (RULES tab, GM and players: `packages/data/rules/*.json`, transcribed with page cites).

**Leaves to the table:** all dice, DNs, whether a Test happens, cover/range/vision, crit and Complication
narration, Fear/Terror DNs, when the encounter ends, Adversary Dying-vs-dead, optional rules.

## 11. House decisions on ambiguities

1. **Seize limit** — p.177 "once before the Threats take their Turn" and p.320 "once per turn" read as the same
   rule: after a Seize, the other side must act next.
2. **Round-start GM Seize** (p.176) costs 1 Ruin (p.320) and follows the same once-per-turn limit as any Seize
   (p.320): the Threats can't Seize again until the Agents have acted, and can Seize again after that.
3. **Monstrous Creatures** roll Determination free (they are "similar to Adversaries") but are killed outright
   beyond Max Wounds (p.324).
4. **Withstand** triggers when a Champion's Wounds would exceed Max; repeatable while Ruin lasts.
5. **Corruption 11** is Contaminated (the book prints 6–11 and 11–15).
6. **Passive Awareness** uses Awareness (p.37), not Stealth (p.41 sheet text).
7. **Annihilation** compares Wounds after Resilience, not raw damage.
8. **Condition durations** "end of next Turn" = the affected character's next Turn.
9. **Mob Shock** below the members' Maximum Shock has no effect: p.325 covers only a hit that exceeds it.
10. **Adversary over Max Wounds** stays in the turn order until the GM removes it; whether it is Dying or dead is
    the GM's call (p.324).
11. **Wounds while Dying** add one Traumatic Injury per hit, however many Wounds it deals (p.193 counts each time
    damage is taken, not its size).
12. **Exhausted conversion** (p.199) applies to Shock suffered while already Exhausted. The hit that takes a character
    past Max Shock stays Shock ("any Shock suffered by an Exhausted character"); the Exhausted Condition from another
    source counts as Exhausted too.
13. **Mob Resolve** (p.325) is prompted at every Round end while half or more are slain; whether the Mob still has to
    test (it passed last Round, it fights to the death) is the GM's call. A tracker tap is one attack, for Annihilation
    and §11.11 alike.
14. **Ammo carry limit** (p.229: 3, or half Strength, whichever is higher, plus containers) is not enforced or shown:
    containers are free-text gear, and whether Powered adds to that Strength isn't stated. The GM checks it.
15. **[ANY] Keyword** (p.205) stands for one of the character's own Keywords that the item doesn't already match: it
    makes the item open to everyone, and adds +1 bonus die only when the character has a Keyword left over.
    Keyword Deviation (Chaos, Traitor Astartes, Orks, p.207) and location Rarity (p.206) aren't modelled: the GM picks
    the Rarity and item Keywords to suit.
16. **Missiles** print range "– – –" (they use the launcher's). The catalogue gives Frag and Krak Missiles the Missile
    Launcher's 24/48/72; a Cyclone fires them at 18/36/54 (p.220). A thrown weapon's range uses effective Strength,
    Powered included, as the pregens do.
17. **Legacy of the Necrontyr** (homebrew) is written for 1st edition. Its Necron species is converted to the Core
    format: each 1st-edition attribute Modifier becomes a granted rating (1 + the Modifier), a Trait Modifier becomes
    `mods` (+1 Resolve, +1 Wound), and the XP is the cost of the granted ratings (Core pp.24–25), which is how every Core
    and FSPG species is priced (Core p.29). Its Build Point Cost and Base Tier stay in the record's note. No maximums
    are printed, so the builder applies none.

---

## 12. Gap analysis — current code vs this spec

Implementation details: [game-logic.md](game-logic.md).

| Area | Status | Where / what's left |
|---|---|---|
| Seize limit | done | `canSeize` + `encounter.seizedSide`; set in `turn.seize`, kept or cleared in `turn.end` |
| Round-start Seize | done | `canSeize` (`lastSide` null → threats only; never when that side is up next anyway); 1 Ruin via `spend()` in `turn.seize` |
| Ambush | done | `combatant.ambushed`; `canAct`, `turn.start` guard, `turn.end` rollover; `combatant.aware` (1 Glory/Ruin); cleared by `newRound()` |
| Mob damage | done | Wounds remove members, capped at `mobStart`; one hit of Shock over max removes one member, less does nothing (§11.9) (`combatant.adjust`); `combatant.update` sizing sets `mobStart`; half-slain chip (`threatStatus`); `roundEndReminders` in the vox log when a Round ends (§11.13) |
| Troop Shock | done | `threatStatus` (T over max Shock → Slain); `combatant.adjust` refuses Shock when `maxShock` is null |
| Threat outcomes | done | `threatStatus` per class (A → Dying or dead, T/E/M → Slain; Exhausted for E/A/M) |
| Traumatic Injuries | done | `character.traumatic` (GM-only adjust); `pcStatus` Dead at > Tier + 1; `pcHit` (via `character.adjust`) turns a Wound while Dying into 1 Traumatic Injury (§11.11), adds Prone on becoming Dying, and ends Dying on any healing |
| Traits minimum 1 | done | `deriveStats` clamps all Traits to ≥ 1; Influence added |
| Session start | done | `session.start` (Wrath 2, Glory 0, Ruin = characters); `session.end` awards XP |
| Respite | done | `character.respite` (refused while Dying or Dead) |
| Personal Ruin | done | `combatant.personalRuin`, seeded from the stat block; tracker SPEND / +1 |
| Turn reminders | done (client) | `TURN_START_REMINDERS` / `TURN_END_REMINDERS`, fired by the tracker into the GM's vox log only |
| Slain / Dead in turn order | done | `isOut` in `canAct` / `sideUpNext`; `turn.start` refuses them and the `turn.end` rollover skips them. An Adversary over max Wounds stays until the GM removes it (§11.10) |
| Annihilation | done | `pcHit`: one hit over 2 × Max Wounds sets `character.annihilated` → Dead (p.194, §11.7); GM RESTORE / undo clears it. Agents only: an Adversary over max Wounds is already the GM's call (§11.10) |
| Exhausted → Mortal Wounds | done | `exhaustedShock` in `pcHit` and `combatant.adjust` (p.199, §11.12); single Threats too, Mobs keep no Shock track |
| Timed Conditions | done | Hindered, Staggered, Vulnerable (`isTimed`): `turn.start` / `turn.seize` arm the ones held (`combatant.expiring`), `turn.end` removes them (§11.8). Pinned doesn't expire (the attacker isn't tracked) |
| Per-class rule chips | done | `THREAT_CLASS_RULES` in the tracker side panel (pp.323-324); `combatant.update` refuses Fear, Pinned, Staggered on Monstrous Creatures (`MONSTROUS_IMMUNE`) |
