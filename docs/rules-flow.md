# Wrath & Glory — game flow, as the rulebook defines it

Source: *Warhammer 40,000 Wrath & Glory* core rulebook (Cubicle 7). Every rule cites the **printed** page
(PDF page = printed + 1). This is the spec the app implements; where the book is ambiguous, the house
decision is marked **[HOUSE]** and listed in §11. The app does not roll a Test (in-person play; in prep it may roll on a book table, §11.91) — it tracks
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
| **Glory** (party) | 0 | **max(6, players + 2)**; overflow lost | +1 per Wrath Critical (Wrath Die 6); +1 by Shifting an Exalted Icon (once per Test); a GM award for an impressive feat, no amount printed (§11.77) | p.164, p.166, p.316 |
| **Ruin** (GM) | players | **2 × players**; overflow lost | +1 when a player fails a Corruption Test, fails a Fear Test, or the GM rolls a 6 on the Wrath Die; optional: +1 instead of narrating a Complication | p.320, p.163 |
| **Personal Ruin** (Champion threat) | per stat block | — | — | p.323, p.325 |

Ruin is **visible to the players** (p.320), but [HOUSE] the app keeps it GM-only (§11.58).

A scene can carry its own Ruin triggers, Glory awards and planned spends of either pool (GitHub issue #40). The GM taps
one on the PREP card and it moves the pool through `pool.adjust`, capped as above.

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

A scene can list the Tests it expects (`BeatTest`, GitHub issue #39): the kind (Skill, Attribute, Opposed, Influence,
Resolve, Corruption, pp.169–170), its Skill or Attribute, the DN (`DN_TABLE`, p.161; `CORRUPTION_DNS`, p.285), who
rolls (§11.73), the Shifts the GM has ready (pp.165–166) and both outcomes (Fail Forward, p.319). It is the GM's plan
for the scene: the app never rolls a Test.

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
vs Tier + 1; personal Ruin; Respite reset; Corruption per Agent (`stats.corruption`, GM-only `character.corruption`; a
failed Test also adds 1 Ruin, and a new level notices the Mutation Test owed, DN 3 + level modifier).

**Shows (UI):** derived traits; auto states (Wounded, Dying, Exhausted, Slain); turn-boundary reminders
(Bleeding, On Fire, Poisoned, Frenzied); per-class rule chips (Troop: no crits/Determination costs Ruin);
Corruption total and level (the owner's phone only; the Mutation tables, p.287, stay in the book); rules reference (RULES tab, GM and players: `packages/data/rules/*.json`, transcribed with page cites).

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
    Its 8 archetypes take their printed Prerequisite minimums as the ratings they grant, and cost those ratings (Core
    pp.24–25) plus (Tier − 1) × 10, the pattern about 85% of the printed Core, VoA, FSPG, IoE and Apocrypha
    archetypes follow (`validate.ts` checks it).
18. **Primaris Astartes counts as Adeptus Astartes Species** for every requirement (Angel of Death, Core p.129;
    Rubicon Primaris, VoA p.43), because the Primaris are a sub-faction of the Adeptus Astartes: `countsAs` on the
    species record.
19. **T'au castes** (Apocrypha pp.15–17) have the T'AU Species Keyword, though the book prints none.
20. **Pariah and Perpetual** (Apocrypha pp.12–13): a Human takes at most one of the two templates.
21. **Asuryani Ghost Warriors count as Aeldari Species** for requirements (their "Aeldari" ability, Apocrypha p.6).
    **Drukhari never walk Asuryani Paths**, even with the ASURYANI keyword (IoE p.10).
22. **One Background bonus** (Core p.43): of the three Background rows a character takes, only one +1 bonus applies.
    The builder enforces it. A GM may grant more by ruling (`gm.mods` in the build): the volkus pregens keep all three
    (docs/pregens.md, GM choice 23).
23. **Absolvers are a Blood Angels Successor** (VoA pp.30, 78), not of unknown succession (Core p.71): they take the
    Blood Angels Chapter Traits, and the Red Thirst (Gene-seed) flaw applies, to Primaris Absolvers too: this
    overrides Core p.71's "Primaris ignore (Gene-seed) traits" for the Absolvers. `successorOf` on the sub-faction.
24. **[ORDER] is a named Order** (Order of Our Martyred Lady, Order of the Sanctified Shield…). The Order categories
    (Orders Militant, Dialogus, Famulous, Hospitaller, Sabine, Pronatus, Core p.51) are groupings, not choices.
25. **Write-in sub-factions:** players may name their own Forge World, Craftworld or Coterie (`writeIn` on the
    placeholder keyword). Ordos are only the printed three, so Core p.64's "Other Ordos" isn't a choice. A write-in on
    any other placeholder needs the GM's tick (a `gm` problem), as for the Red Scorpions (kill-team.md ruling 13).
26. **Navis Nobilite Origins** (Apocrypha p.54) match the character's House: a Magisterial, Nomadic or Shrouded House
    Origin needs that House type. A Renegade House has no Origin row.
27. **Species gaps:** Ogryn and Ratling have the ABHUMAN Species Keyword, Kroot has KROOT (FSPG prints none), and
    Navigators use the Human maximums (Apocrypha p.18 has no Navigator column).
28. **Exarch Powers** (Apocrypha p.247): an Exarch's Aspect is their Aspect Warrior archetype, and Tier 3 is the hard
    minimum to buy one (Master of War, p.216, prints Tier 4 for the first power).
29. **Talents with a bracketed choice** (Hatred [Any], Loremaster [Keyword], Jargon [Skill], Supreme Presence, Transhuman,
    Uncanny, Unnatural; also Signature Saedath, IoE p.62) may be taken once per choice: `repeatable: "perChoice"`.
30. **The Emperor Protects** (Core p.144) needs "at least 1 Faith": another Faith Talent owned first.
31. **Unbroken** (VoA p.55) is Absolvers only, and **VoA's Litanies of Battle** (pp.57–58) are Chaplain only.
32. **IoE disciplines without an access rule take Apocrypha's where it prints one:** Runes of Fortune (PSYKER with
    ASURYANI, ANHRATHE, HARLEQUIN or YNNARI), Runes of Fate (AELDARI, and the Farseer archetype), Phantasmancy
    (HARLEQUIN). FARSEER in Apocrypha's prerequisites is the Farseer archetype, not a keyword.
33. **Grey Knights** know Rites of Banishment instead of Smite (Apocrypha p.267): the sub-faction grants it, like the
    Navigator species grants The Lidless Stare.
34. **The Primaris Intercessor is Core p.117's** (300 XP), not VoA p.34's (user ruling, 2026-09-27). VoA's block is
    misprinted: its 357 XP, ratings, wargear and Influence copy the Techmarine's (VoA p.39), and its suggested block the
    Eliminator's (VoA p.32). So the catalogue takes the whole Core block, not only its price, and the record sits in
    `creation/archetypes/core.json`, an exception to "the first source in `SOURCES` order wins" (docs/data.md §9).
    This replaces the earlier ruling that kept VoA's printing.
35. **"N+M" archetype XP** (VoA pp.38–42 "335+30", "295+20"; IoE pp.54–56 "+20"/"+30" under the XP) is the total N+M:
    the second figure is the Archetype Ability's cost, printed separately. This settles the XP half of issue #2.
36. **VoA's Primaris Eliminator, Incursor and Reiver** (pp.32–37) require the Primaris Astartes species,
    matching their PRIMARIS keyword, though their SPECIES line prints Adeptus Astartes.
37. **Pariah archetypes include the Pariah template's 30 XP** (Apocrypha p.12): Null-Maiden, Oblivion Knight and
    Novice-Sister, which print a cost without it, gain the 30.
38. **Lost on the Warrior Path** (IoE p.59) grants the EXARCH keyword, which it makes you in prose: the Exarch Powers
    (Apocrypha pp.247–253) need it, and Apocrypha's own printing of the package lost the merge to IoE's.
39. **Stay the Course** (Core p.154): an Agent who already has a Memorable Injury may still take the 3 Corruption.
40. **Every PRIEST may buy Prayers** (the Prayers' own PRIEST requirement admits them), whether or not the archetype
    prints "may purchase Prayers": the PRIEST keyword grants the access.
41. **Joining the Asuryani by Change of Kinship** (IoE p.58): the first Path is free, as the Paths group prints it
    (IoE p.10), not 10 XP as the package prints.
42. **A named variant of a catalogue item** is the item plus what makes the variant, unless a book prints the variant
    as its own item (Core's Master-Crafted Laspistol, p.217; IoE's Master Crafted Void Sabre, p.89). "Master-crafted
    X" (VoA pp.40–41) is X with the Mastercrafted upgrade (Core p.228). The Ork Nob's "Kustom Slugga" and "Kustom
    Choppa" (Core p.115) are the Slugga and Choppa with the Kustom Trait (Core p.209), so each takes a Trait of the
    player's choice when acquired.
43. **Mundane possessions** (a Bedroll, a Canteen, a Grooming kit, "Maps of the Heartworlds") that no armoury prints
    and no rule reads stay name-only `mundane` items: a line on the sheet, never a catalogue entry, no Value or Rarity.
    Clothes, robes, vestments, rags and gang colours are Clothing (Core p.236: "religious vestments, uniforms, or
    protective worker's overalls"). The Rogue Trader's Imperial Frigate (Core p.104) is a `story` grant, a ship the GM
    runs.
44. **FSPG's numeric Rarity** (pp.120–128) is the Rarity's DN penalty (Core p.206): 0 Common, 1 Uncommon, 2 Rare,
    3 Very Rare, 4 Unique. The Laud-Hailer prints "Rarity: 0", and the Irregular Acquisition endeavour sets a DN "equal
    to the Rarity modifier".
45. **The Ratling Sniper's "Sniper Rifle"** (FSPG p.114) is the Ratling Rifle (FSPG p.123), which its text calls one of
    "these sniper rifles". The Interrogator's "Excruciator" is the armoury's "Excrutiator" (p.126).
46. **IoE's Armoury supersedes Core's Aeldari printings** (the newest official printing wins). Aeldari-only items
    (shuriken weapons, Lasblaster, Ranger Long Rifle, Fusion Gun, Void Sabre, Witchblade, Singing Spear, the Aeldari
    armours, Shimmershield, Spirit Stone, Bonesinger Shard) link to IoE's entry in every book; Core's entry stays in the
    catalogue, noting it. Generic items IoE reprints as Aeldari gear (Knife, Flamer, Chainsword, Power Sword, Plasma
    Grenade, Cameleoline Cloak) link to IoE's only in Aeldari records (from IoE, or an archetype of an Aeldari faction).
    A starting Spirit Stone is IoE's empty one (p.98), and a Rangefinder the standalone one.
47. **An official book's starting wargear that no official armoury prints** takes Apocrypha's homebrew profile when it
    has one: VoA's Bolt Carbine, Occulus Bolt Carbine, Grav-pistol, Plasma Incinerators, Smoke Grenades and Reductor
    (VoA pp.30–37), the Techmarine's "Mark VII Artificer Power Armour" (Apocrypha's Artificer Armour, p.397), and
    FSPG's Servo-skull, Cherubim and Combat servitor (Apocrypha's followers). An official profile wins where one
    exists: VoA's Shock Grenade is FSPG's (p.124). The Eversor Assassin's "Executor pistol"
    is the Executioner Pistol its section describes as the Eversor sidearm (Apocrypha p.356).
48. **One free language** (Core p.31): "a free additional language" is one, even when several of your keywords
    qualify. An ADEPTUS MECHANICUS character picks High Gothic or Cant Mechanicus, not both.
49. **The Languages table's "Keyword Required"** only decides the free pick. Anyone may buy any language for 1 XP with
    the GM's agreement (Core p.31 asks only for someone to teach it).
50. **Languages the table doesn't list** (T'au, Thoughtmark, a Navigator House's tongue; Core p.31 "discuss with your
    GM") are write-ins at 1 XP, approved by the GM.
51. **Buying Wealth** (Core p.38): "you can buy up to 4 Wealth" is up to 4 bought on top of the starting Tier, at 1 XP
    each.
52. **The Tree of Learning** (Core p.26) applies only when raising a Skill with XP: raising it to R needs R Skills with
    points, that one included. Ratings an archetype or species grants are exempt (36 of 205 printed archetypes would
    fail otherwise, the Imperial Guardsman's lone Ballistic Skill 2 among them).
53. **A granted Talent whose requirements the character doesn't meet** (Rubicon Primaris gives Built Tough, which needs
    Survival 2, VoA pp.43, 46; pregens.md ambiguity 7): the books don't say whether a grant ignores them. The builder
    keeps the Talent and asks the GM to tick it, rather than refusing the build. *Proposed; awaiting the GM.*
54. **Creation Ascension** (Core p.148): one Ascension Package, whose requirements are met at the archetype's Tier
    (before Ascending). "Per Tier Ascended" counts from the archetype's Tier to the campaign's, and "× the new Tier" XP
    uses the campaign's Tier. *Proposed; awaiting the GM.*
55. **Advancement in play** (Core pp.146–151): the XP a character has earned (session XP, p.321) buys the same ratings,
    Talents, powers and languages as at creation, priced from where creation left them, and Advancement Packages
    (`notAtCreation` ones too). Each time the group Ascends (the GM raises the campaign's Tier), each character takes
    **one** Ascension Package for that Ascension, "regardless of the amount of Tiers you are ascending" (Core p.148) —
    this corrects an earlier reading of one package per Tier Ascended. Its requirements are met at the Tier the
    character leaves, "× the new Tier" is priced at the Tier that Ascension reached, and "per Tier Ascended" on the
    package itself (Dauntless Reputation's Influence, Core p.151) counts that Ascension. The campaign records no history
    of its Ascensions, only the Tier it is at now; `campaign.ascend` raises it one Tier at a time, so the builder reads
    each Tier since the character's creation Tier as one Ascension, and the packages bought in play fill them in the
    order bought, so a later Ascension never reprices an earlier package. An Archetype Ascension (§11.67) takes the
    Ascension to its own Tier instead. A Tier raised by more than one at once (`campaign.update`) reads as one Ascension
    per Tier until each Ascension is recorded. A power's "at creation" price (Smite) gives way to its later one. Rank
    is from the XP earned. The creation budget stays as it was.
    *Proposed; awaiting the GM.*
56. **What players know of the enemy** is not a rule: Set the Scene (Core p.176) describes the ground, not the foes, and
    an enemy is found through the fiction (Stealth Score vs Awareness, Core pp.181–182; Ambush, p.177). The phones show
    what the table shows: a threat whose mini isn't placed yet is `hidden` and never sent to players; once placed it's
    `bars` (label, bars, Conditions); `stats` adds the stat block. New threats default to `bars`; the GM adds held-back
    ones (ambushers, snipers, reinforcements) as `hidden`, from the tracker or in the beat's prepared encounter, so
    they never flash on the phones. A hidden threat still takes its Turns; players see "Unseen threat acting" and the
    side that's due, never which one (its id is replaced by `UNSEEN_ID`).
57. **Who changes Conditions, Wealth and Ammo in play.** "The GM may award you Wealth" (Core p.206); the books don't
    say who adds Ammo or Conditions. House decision: the GM grants all three and a player only spends their own Wealth
    and Ammo (a Reload, p.185; an Icon on an Influence Test, p.206). Sharing Ammo (Core p.229) is the giver's −1 on
    their sheet and the GM's +1 in PARTY. Conditions are set and cleared by the GM, from the tracker in a fight or
    PARTY outside one.
58. **The GM's Ruin is GM-only.** Core p.320 says the Ruin pool "should be visible to the players". House decision:
    it isn't. `toPlayerView` sends players Ruin 0 and their sheet doesn't show it; the GM announces a spend at the table.
59. **A character built outside a campaign** (the personal library, issue #14). The books know nothing of characters
    without a game, so the app decides: the library holds the creation choices only, and the campaign is the authority
    the moment one comes in.
    - **Tier.** A character comes in only at the campaign's Tier, because the Tier sets the XP budget (Core p.20) and
      the Traits (Core pp.36–37). A mismatch is refused in the builder, and by `character.build` if it's sent anyway.
      A character already made keeps the Tier it was made at, so a library character at another Tier can never replace
      it; rebuild it in the library for that Tier instead.
    - **Homebrew.** The campaign's setting wins: a character built with the homebrew books can't come into a table that
      doesn't allow them.
    - **The GM's part stays at the table.** Rulings and ticks (species by ruling, granted keywords, gear swaps, GM
      questions) are judgements about *that table's* character, so a library character never carries one: a build saved
      to the library is stored with `gm` cleared. On the way in, what happens depends on who saves, and the two differ:
      a **player's** draft keeps the GM's stored part (`character.draft` re-attaches `buildDraft.gm ?? build.gm`), so
      rulings made for the old build survive an import and the GM clears them (CLEAR TICKS) if they no longer fit; a
      **GM** saving a build sends their own part as the builder has it, so an import they save replaces it. *Proposed;
      awaiting the GM — the alternative is for an import to clear the part on both paths.*
    - **What only a GM judges waits for the campaign's GM.** A story grant (the Rogue Trader's Imperial Frigate, Core
      p.104), a Talent whose XP the GM adds, a conditional Wargear pick: the library has no GM to tick them, so a
      library build is finished once nothing else is left, and those items stay open. On import they are open again on the campaign's REVIEW, where the player
      sends the draft and the GM ticks and saves, as for any build.
    - **The copy is a snapshot**, like a threat's stat block joining an encounter: later library edits don't change the
      campaign character, and XP earned in play belongs to the campaign character alone.
60. **Corsair Backgrounds** (Aeldari: Inheritance of Embers p.14). Corsairs "count former Asuryani, Drukhari, and
    Harlequins among their number" and "pick Keywords, Backgrounds, and Goals that match", as the Ynnari use "the
    Background and Objectives of your Agent's original sub-faction" (p.20). So a Corsair archetype takes an Asuryani,
    Drukhari or Harlequins Background table (the faction's `backgroundsFrom`); the Anhrathe table prints only Objectives
    and isn't offered. Asuryani Paths stay off, as p.14 says. Whether the Corsair's species fits the former faction is the GM's
    call. *Open (GitHub issue #2):* the "Anhrathe Goal table" p.14 names isn't printed, and only ANHRATHE OBJECTIVES is.
    Our PDF is from 11 Jan 2024; check the updated PDF (around May 2024) before ruling.
61. **Change of Kinship at creation joins only the Ynnari** (Aeldari: Inheritance of Embers pp.20, 58; GitHub issue #7).
    p.58 says the package "cannot be chosen as Creation Ascension", but p.20 lets AELDARI Agents join the Ynnari by
    it, "If you purchase this Ascension Package in character creation", and no archetype is native to the Ynnari. The
    specific rule wins for its case: at Creation Ascension (Core p.148, so only when the campaign's Tier is above the
    archetype's) the package may be taken to join the Ynnari, and to join any other kindred it waits for an Ascension in
    play. The package carries `atCreationWith: "YNNARI"`, and the build checks the kindred chosen. As p.20 says, such an
    Agent keeps the Background of the original sub-faction (faction Background tables follow the archetype's faction)
    and takes no Asuryani Paths (every Path option is `notKeyword: YNNARI`).
62. **An archetype's own discipline is the species' one choice** (GitHub issue #8; user ruling, 2026-10-01). The
    Weirdboy (WAAAGH!, Apocrypha p.165), Grey Knight (Sanctic, p.170) and Grimnyr (Skeinwrought, p.171) get no second
    discipline from Disciplines Known (Core p.257), as with the Astropath. Each carries `onlyDisciplines`: its discipline
    plus Minor powers and Smite, which "All Psykers can learn" (p.257). The build enforces every `onlyDisciplines`
    (these three, Navigator, Navis Scion, Wyrd, Astropath): the species' `chooseDisciplines` offers only what's left of
    the list (none for these three, Divination or Theosophamy for the Astropath), and a power bought from outside it is
    an error. Archetypes that print "one other discipline of your choice" (Chaos Sorcerer, Rogue Psyker, the
    Librarians, Bonesinger) take that one as the species' choice, unchanged.
63. **Fitting an upgrade is instant** — Core p.227 says an upgrade applies "usually instantly", and prints no Test, no
    time and no tools. House decision: fitting or removing an upgrade costs no Tech Test and no downtime, so the app
    treats it as part of the item from the moment it is attached, never as an action in a fight. The "usually" is the
    GM's: they may call for a Tech (Int) Test when the fiction gives them one (fitting it under fire, in the field,
    with no workshop), the way §11.14 leaves the ammo carry limit to the table. *(GitHub issue #32; user ruling,
    2026-10-01.)*
64. **What counts as an upgrade "type"** — Core p.227 caps a weapon at three upgrades, "and only one of each type — you
    can't attach two grips or two scopes to the same weapon"; Distinction is exempt from the maximum (p.228). Grips and
    scopes are the only types the book names, and the catalogue holds 64 upgrades across Core, VoA, IoE, D&H and
    Apocrypha.
    House decision: every upgrade carries a `slot` (the book's "type", named `slot` in the data because `type` is
    taken) from a short closed vocabulary, transcribed with the entry. The transcriber proposes the slot from the
    printed text and the GM confirms it before the entry is merged; `validate.ts` enforces the vocabulary, so a new
    upgrade can't invent a slot in passing. The vocabulary:
    - **On a weapon:** `sight` (Magnocular Scope, Red-Dot Sight, Preysense Sight, and the M40 Targeting System, which
      VoA p.68 fits "instead of a normal scope"); `grip` (Duelling Grip, Foregrip, Folding Stock, Gene-Grip
      Bio-Verator); `muzzle` (Silencer, Percussive Muzzle Brake); `magazine` (Ammo Drum, Autoloader); `bayonet`
      (Bayonet Lug, Chain Bayonet); `attachment`, a second weapon carried on the first (Combi Weapon, Exterminator
      Cartridge); `mount`, bracing that carries the weapon (Independent Weapon Mount, Suspensor Rig, Anti-Grav
      Platform); `core`, the works (Megathoule Accelerator, Overcharge Capacitor, Mass Accelerator, Aethyric
      Capacitor, Warp Focus, Powered Blade, Digital Weapon); `craft`, a quality of the whole weapon (Mastercrafted,
      Sanctified, Darkstar, and Distinction, which keeps a slot although it doesn't count toward the three); and
      `coating` (Envenomed Blade and the Drukhari toxins, Apocrypha pp.393–395, one substance on one blade).
    - **On armour:** `crest` (Teleport Crest, Apocrypha p.444, which prints the rule itself: no second crest); `plate`,
      something worn over or in place of a piece of the suit (Adamantine Cuirass, VoA p.73, which replaces the chest
      piece; Chains, Blades and Hooks, IoE p.96); and `system` (the T'au support systems, Apocrypha pp.445–447).
    - **The awkward ones,** where the printed text doesn't settle the slot and the GM's word decides: **Matched Pair**
      (Apocrypha p.388) is a property of two weapons, not one, so it takes `craft` on both, and its rule that the
      other upgrades must be matched stays the GM's to police — `fits` can't say "a pair", so the entry carries
      `gmOnly`, which keeps it off a player's fit picker and leaves it to the GM, who fits it on both. The
      **Independent Weapon Mount** is one upgrade priced
      three ways (Pistol, non-Heavy, Heavy), not three slots. The **Anti-Gravitic Suspensor Crystal** (IoE p.95) fits
      either a weapon or armour, and is a different type on each, so the one entry carries a slot per host (`slotOn`):
      `mount` on a weapon, the bracing that carries it, and `system` in armour. Its printed "no more than 1" holds
      whichever it is. **Chains, Blades and Hooks** (IoE p.96) is bought up to three times, once per option, so its
      own limit wins over one-per-`plate`. The **Rangefinder (detachable)** (IoE p.97) is a `sight` the wearer moves
      between weapons between scenes. The strain is the **T'au support systems**: ten entries share `system`, so
      one-per-slot would leave a battlesuit a single one, which their own text contradicts. Ruled: SUPPORT SYSTEM
      entries are exempt from one-per-slot the way Distinction is exempt from the maximum, and still spend the three.
    - **What a fitted upgrade does to the profile,** where the printed text stops short: an upgrade fits a weapon
      unless its `fits` names another kind, so a weapon upgrade ("any ranged weapon", Core p.227) doesn't go on a
      grenade or a launcher's missile, which are ammunition; an upgrade granting a Trait the weapon already has keeps
      the better rating rather than carrying the Trait twice; and a rating lowered to 0 ("reduces any Salvo and
      Rapid Fire ratings it has by -1", VoA p.68) takes the Trait off, since Rapid Fire (0) adds nothing. On armour the
      same reading gives the suit's AR and Traits, and a mod that only reads on a weapon's profile (damage, ED, AP,
      Salvo, range) is printed as a note rather than dropped, so a mis-transcribed entry shows at the table.
      *(GitHub issue #32; user ruling, 2026-10-01.)*
65. **Armour takes the weapon limit** — Core p.227 caps upgrades at three, one of each type, and prints it of weapons
    alone; no book gives armour a limit. House decision: armour takes the same cap — at most three upgrades, one per
    `slot` — because the reason for the rule (a finite number of places to bolt something on) reads the same on a suit
    as on a rifle, and one rule is easier at the table than two. It binds 14 entries today: the Adamantine Cuirass
    (VoA p.73), the Teleport Crest (Apocrypha p.444), the ten T'au support systems (Apocrypha pp.445–447), Chains,
    Blades and Hooks (IoE p.96) and the Anti-Gravitic Suspensor Crystal (IoE p.95), which fits either host — 13 of them
    armour's alone — and, with §11.64's exemption for SUPPORT SYSTEM, it is a battlesuit that feels it first.
    *(GitHub issue #32; user ruling, 2026-10-01.)*
66. **Ascension is the group's decision, not one character's** (Core pp.147–148): Experience Ascension asks that "every
    character in your group has earned 100 or more total XP in the current Tier" and that the group "collectively
    decide" to raise the Tier; Milestone Ascension is the GM's call and gives every character 100 XP (Core p.148). So
    a character who passes 100 XP in the current Tier first does not Ascend alone. The campaign holds one Tier, and a
    character Ascends only when the GM raises it, all of them together. What does follow one character's XP is Rank
    (Core p.146, +1 per 40, at most 3), which is why a character can meet Rank 3 — and so Archetype Ascension
    (§11.67) — long before the group is near Ascending. A solo Ascension, for a party at mixed Tiers, would be a house
    rule of our own and is not modelled; the table can revisit it.
    A **Dead** character is not one of "every character in your group": it neither has to reach the 100 XP nor holds the
    party at its Tier, since nothing removes its record and it would otherwise block the group for ever. Raising the
    Tier by hand (`campaign.update`) restarts the window the same way `campaign.ascend` does, so the XP that paid for
    one Ascension can't pay for the next. *Proposed; awaiting the GM.*
67. **"An Archetype of their Faction"** in Archetype Ascension (Core p.155) is read as the same `factionId`: the
    Archetype the player picks must name the Faction record the old Archetype names, not merely share a keyword. The
    book's own example, a Space Marine Scout becoming a Tactical Space Marine, is one Faction on that reading (both
    `adeptus-astartes`). The sub-faction is not part of the match: a Chapter, Craftworld, Forge World or Coterie
    keyword rides along unchanged, with everything else the character keeps. The new Archetype must be at the Tier
    Ascended to, the character needs Rank 3 (80 XP earned, Core p.146) and the GM's agreement, and XP is spent until
    their Attributes and Skills equal or exceed the new Archetype's; they then gain its abilities, Wargear and
    Influence, and none of its Attribute or Skill bonuses.
    Two more conditions the book leaves unsaid, both from implementing it: the new Archetype's **Species** must admit
    the character (every Archetype prints its Species, and the creation path checks the same thing; a GM species
    ruling overrides it), and an Ascension takes **either** an Ascension Package or an Archetype Ascension, never both
    — Core p.148 offers the two as alternatives for the one slot. The Archetype's own creation XP is not paid: p.155's
    cost is the ratings needed to match it. *Proposed; awaiting the GM.*
68. **Weapon effects on the profile** (GitHub issue #27; user rulings, 2026-10-01). A Talent, ability, package or trait
    changes a weapon's **printed profile** only when its condition is a property of the weapon: a keyword, a Trait,
    melee or ranged, the weapon its Talent names, or the weapon its record grants. Bolter Discipline is the model: "When
    you use a weapon with the BOLT Keyword, it gains the Rapid Fire (2) Trait. If the weapon already has the Rapid Fire
    Trait, add +Rank to the weapon's Rapid Fire rating" (VoA p.45). What depends on the moment stays in the Talent's
    text: charging, aiming, a target type, a spend of Glory, Wrath or Ruin, an attack option.
    - **Rank** is the character's Rank now (Core pp.146–147), from the XP earned. It rises at session end without a
      rebuild, so the effects are applied when the sheet is read, after the weapon's upgrades, never stored.
    - **Explosive Fury's "+Rank bonus extra damage"** (VoA p.33) is +Rank ED on grenades (docs/pregens.md, GM choice 9).
    - **Not numbers, notes:** a re-roll or bonus dice with a kind of weapon ("re-roll up to Double Rank dice", Hellblaster
      Focus, VoA p.35), an effect the player "may" use, and one the GM judges ("or similar", "weapons made for smaller
      users") show as a cited note on the weapon's line.
    - **"When you're engaged with an enemy"** on a melee rule (Accept Any Challenge, No Matter the Odds, Apocrypha
      p.230) is standing for its AP: a melee attack is made while engaged. Its bonus dice keep the condition, as a note.
    - **A Salvo printed "–"** has no Salvo track (Core p.207), so +Rank Salvo (More Dakka, Core p.137) leaves it "–" with
      a note.
    - Only a weapon that came from the Wargear catalogue (`wargearId`) is matched: a hand-written line may already
      count the Talent, and it would count twice. A hand-written line a rebuild matched to its catalogue entry (so an
      upgrade can be fitted to it) is marked `asPrinted` and isn't matched either, as on a sheet written by hand before
      #27. The live volkus agents' printed lines were swapped for their builds' lines by a one-off script (issue #27).
    - **A weapon that deals no damage** (a Smoke Grenade: Damage 0, ED 0) takes no Talent +Damage or +ED: Explosive
      Fury adds to "successful attacks", and smoke makes none. A melee weapon printed Damage 0 deals Strength (S + 0)
      and a grenade with ED on Damage 0 still deals damage, so those take them.
69. **When a purchase was bought** (Core p.146, p.148 step 4; GitHub issue #32). The book spends XP between sessions and
    keeps no record of when; ADVANCE is more useful if it does, so the app records one. Each advancement purchase carries
    the number of the session it first appeared in, in `Advancement.boughtIn`, keyed by `purchaseKey`. House decisions
    about that key and that date:
    - A **rating is one purchase per rating point** (`advance/attribute/S/6`), not one per raise, because the XP tables
      are cumulative and a point bought this session shouldn't re-date the one bought two sessions ago. The ledger shows
      one row per point to match.
    - A Talent's bracket pick is part of its key (`advance/talent/hatred:Orks`), since Hatred (Orks) is not Hatred
      (Tyranids); `~2` separates a second identical purchase.
    - **The server stamps it, never the client.** `character.build` diffs the stored build against the one sent, dates
      what is new and drops the date of anything taken back. A `boughtIn` the client sends is thrown away, and a draft
      is never stamped: a draft is not authoritative.
    - The date is **the open session, else the last session played**, because XP is awarded at a session's end (p.321),
      so a purchase made between sessions belongs to the session that paid for it. A campaign with no session yet, and a
      character in the library (which has no sessions at all), leave purchases undated; so do purchases made before this
      was built, until the character is saved again. ADVANCE lists those under "NOT RECORDED YET" rather than guessing.
    - Nothing is **priced** from it: `resolveBuild` reads the history only to label a ledger row, so a build resolves to
      the same XP with it and without it, and it is no part of `creationKey`, so gaining a date is not a creation change
      a player may not make.
    *(User ruling, 2026-10-01.)*
70. **A stat block with no Tier row** (GitHub issue #44). Bloody Gates' seven blocks (BG pp.22–25) and Redacted
    Records' three Slaughter Servitors print no Threat class, but a threat needs one per Tier (Core p.323). The
    transcriber proposes one class from the block's role (a Champion with Personal Ruin, a 1-Wound grunt) and repeats it
    for every Tier, and the block's `note` says "No Tier row printed; class proposed (…)". The GM can change it per
    fight. Bloody Gates: Commissar Shrake A, Cravax the Claw E (a Champion, but 6 Wounds and a paid Determination), the
    rest T. A Champion is A only from 7 Wounds up; under that it is E, as Cravax. Redacted Records, Darktide and Litanies
    of the Lost (31 blocks) are confirmed as listed in `docs/data.md` §4. *(User rulings, 2026-10-02.)*
71. **Reprints** (GitHub issue #44). A block whose name the bestiary already holds is transcribed again, under its own
    book's id prefix as `ta-ork-boy` is, **only if it differs** from the printing already in; its `note` names the
    other printing and what differs. An identical reprint is skipped and only listed in the book's notes (docs/data.md
    §4): Bloody Gates' Poxwalker is Core's `poxwalker`. A different Tier row counts as a difference (§11.72). A
    homebrew printing never stands in for an official one (Redacted Records 2's Kastelan beside `hat-kastelan-robot`).
    *(User ruling, 2026-10-02.)*
72. **Class letters where two books disagree** (GitHub issue #44). Each printing keeps its own book's Tier row, since
    a class is set per book; none is corrected to match another. A reprint whose only difference is its Tier row still
    counts as different (§11.71) and gets its own file, so the GM can field either. *(User ruling, 2026-10-02.)*
73. **A scene Test every Agent rolls** (GitHub issue #39). A scene Test can say `who: "each"`: every Agent rolls their
    own. The Core Rulebook has no group Test rule; the nearest is Help (p.169), where one Agent gives an ally bonus dice
    equal to the Attribute or Skill they help with. The app only records who rolls. Whether one success carries the
    group, or each Agent stands alone, is the GM's call for that scene, written in the Test's outcomes.
    *(User ruling, 2026-10-02.)*
74. **Fail Forward is the GM's to read** (Core p.319; GitHub issue #39). It is in the Gamemaster chapter, and one of its
    options is "The GM gains 1 Ruin", while the Ruin pool is GM-only (§11.58). Its rules entry carries `gm: true`, so
    `/api/campaigns/:id/rules` serves it to the GM's seat only, and the seatless `/api/rules` never does. Difficulty
    Numbers and Shifting are in the player chapters (pp.160–161, 165–166) and stay open to every seat.
    *(User ruling, 2026-10-02.)*
75. **A scene Test may have no DN yet** (Core p.160; GitHub issue #39). "The Gamemaster is responsible for setting the
    Difficulty Number for each Test", and many book events print a Skill with no DN. So a prepared Test other than an
    Opposed one may leave `dn` null: PREP shows "DN · GM SETS" and the GM sets it in the editor or at the table. An
    Opposed Test still has none, because most Icons wins (p.170). A scene made from a book event takes the printed DN,
    else the table's printed default, else none.
    *(User ruling, 2026-10-02.)*
76. **The Ruin rules entry is the GM's to read** (Core p.320; GitHub issue #40). Core p.320 says the pool "should be
    visible to the players", and Threat Assessment p.7 says to explain Ruin to them before the game. But the entry is in
    the Gamemaster chapter and the pool is GM-only (§11.58), so it carries `gm: true`, as Fail Forward does (§11.74):
    the GM explains it at the table. Wrath Complications (p.163, with its optional "award the GM a point of Ruin") and
    Combat Complications (p.191) are in the player chapters and stay open to every seat.
    *(User ruling, 2026-10-02.)*
77. **How much Glory an award is worth** (Core p.316; GitHub issue #40). "You might want to award players Glory for
    particularly impressive feats", and the book prints no amount. A scene's Glory line carries its own amount, which
    the GM sets; a new line starts at 1. The pool maximum (p.164) still bounds it, and an award at the maximum is lost.
    *(User ruling, 2026-10-02.)*
78. **A Ruin or Glory spend the book doesn't price** (GitHub issue #40). Core p.320 says Ruin Actions "cost a certain
    number of Ruin", and some printed lists name a spend without a cost (Threat Assessment p.7 prices two of its five
    Additional Ruin Actions). The preset keeps the cost null, a scene's copy has none, and SAVE waits until the GM sets
    it for that scene. There is no default: the app never invents a cost.
    *(User ruling, 2026-10-02.)*
79. **The kind of game and the content limits are stored** (Core p.316). The table agrees the kind of game and "identify any
    inappropriate content to avoid", and nobody should have to explain what they want left out. The campaign keeps
    both as short lines (`kind`, `limits`, at most 12 of 60 characters each): NEW CAMPAIGN's TABLE step and the GM's
    SETUP tab offer the book's examples and take typed ones, and every phone shows both under MISSION so the
    table remembers. SETUP's first step ticks once a kind of game is set; the limits may rightly stay empty. They travel
    in an export and a pack, and FRESH START clears both, since a new group agrees its own. *(User rulings, 2026-10-03;
    replaces the 2026-10-02 ruling that kept them a reminder.)*
80. **The Framework Bonus is its own field** (Core p.19, party sheet p.374; GitHub issue #45). The party sheet has a
    FRAMEWORK and a FRAMEWORK BONUS box, so the campaign has `framework` and `frameworkBonus`, and players see both under
    MISSION. The Framework picker shows the printed Bonus to the GM only and fills in names only (the patron's and the
    Framework's): the GM types the Bonus wording the players should see, so the MISSION never carries printed prose.
    *(User ruling, 2026-10-02.)*
81. **A Framework's Limitations are shown, never checked** (Core p.19; GitHub issue #45). "Your Framework is a tool to
    help you have fun, not get in the way." The picker shows the printed Limitations (such as "at least half the
    Agents must have the ADEPTA SORORITAS Keyword"), and neither the picker nor the builder tests the party against
    them. A group quota is stored as a `gm` Requirement with the printed sentence. *(User ruling, 2026-10-02.)*
82. **Sizing a prepared encounter** (TA pp.6, 8; Core pp.323–324; GitHub issue #41). Building Encounters gives two
    Troops per Agent, half of those forming a Mob, plus one Elite or Adversary, and warns that more than 10 enemies is
    hard to keep track of. `encounterBudget` and `rosterTally` (`packages/shared/src/threat.ts`) turn that into
    targets; `BudgetLines` prints them and `BudgetPanel` sits under the beat editor. Where the guideline leaves a gap:
    - **A Mob counts as one tracked combatant and as its models.** p.8's warning is about keeping track, and p.6 says
      a Mob cuts the number of Turns per Round, so the ENEMIES line prints both numbers — "N tracked · M models" — and
      goes over only when tracked combatants pass 10.
    - **Monstrous Creatures tally on their own line, with no target.** p.8 names only Elites and Adversaries, so the
      app sets them no number rather than inventing one. Core p.323 calling them similar to Adversaries is not a count.
    - **The active Agents set the budget,** not every character in PARTY, because they are who `beat.startEncounter`
      adds (`claimedCharacterIds` server-side, `activeCharacterIds` in the web).
    - **Fortified ground doubles every target, and is a toggle, not a stored flag.** p.8 frames it as a judgement about
      the ground — cover, clear lines of sight, distance or surprise — not a property of the scene.
    - **A Mob target of one still needs two Troops.** With 1 Agent the guideline gives 2 Troops, and half of them is
      one model, which cannot be a Mob (Core p.324: two or more Troops sharing a profile), so the line reads "needs 2".
    *(User ruling, 2026-10-02.)*
83. **The mixing hint covers any non-Imperial ally** (Core pp.19, 317; GitHub issue #46). p.317 says "there are very
    few circumstances in which any Imperial would consider working alongside an Aeldari, and almost none with an Ork",
    and "you might need a reason why Archetypes of different Factions are working together". The faction card shows
    that as a hint, never a block, and only when the faction's stance is `ally`: ORK gets the Ork line, an Aeldari
    Keyword (AELDARI, ASURYANI, ANHRATHE, DRUKHARI, HARLEQUIN, YNNARI) the Aeldari line, and any other non-Imperial
    Keyword (NECRON, T'AU, KROOT, TYRANID, GENESTEALER CULT, CHAOS, HERETIC, HERETIC ASTARTES, DAEMON, DARK MECHANICUM,
    XENOS) the "need a reason" line. The book names only the Aeldari and the Ork; the wider list is the GM's call
    (`mixingHint`, `apps/web/lib/keywords/keywords.ts`). *(User ruling, 2026-10-02.)*
84. **Forsaken System Player's Guide factions take the Core Faction their page names** (FSPG pp.39–63; GitHub issue
    #46). No faction page prints a Keyword. Each preset (`faction-presets/forsaken-system.json`) takes the glossary
    Keyword of the organisation its own page names:

    | Faction | Keywords | Where the page names it |
    |---|---|---|
    | Order of the Sanctified Shield (p.40) | ADEPTA SORORITAS | p.39: "a single Order Minoris of the Adepta Sororitas" |
    | Machine Cults of Avachrus (p.42) | ADEPTUS MECHANICUS | p.42: "The Adeptus Mechanicus oversees all aspects of technology" |
    | Ecclesiarchy of Enoch (p.44) | ADEPTUS MINISTORUM | p.44: "The Adeptus Ministorum is the one true church" |
    | Guard Regiments of Gilead (p.46) | ASTRA MILITARUM | p.46: "The Astra Militarum, commonly known as the Imperial Guard" |
    | Remnants of the Inquisition (p.48) | INQUISITION | p.48: "The unending mission of the Inquisition" |
    | The Varonius Dynasty (p.50) | ROGUE TRADER | p.50: "Rogue Traders, empowered by Imperial Warrants" |
    | The Absolvers (p.52) | ADEPTUS ASTARTES, ABSOLVERS | p.52: "The Space Marines are the Emperor's Angels of Death", the Absolvers a Chapter (ABSOLVERS: VoA's sub-faction) |
    | The Administratum (p.54) | ADEPTUS ADMINISTRATUM | p.54: "The Adeptus Administratum is, in many ways, the Imperium" |
    | Craftworlders of Ul Khari (p.56) | ASURYANI | p.56: "The isolationist Asuryani of Ul-Khari" |
    | Greensteel Corsairs (p.58) | ANHRATHE | p.58: "Emerald Princess of the Anhrathe" |
    | Da Blood Axes! (p.60) | ORK | p.60: "The brutal Ork species" |
    | Traitors of the Rift (p.62) | CHAOS | p.62: "rife with the taint of Chaos" |

    Only the Faction is mapped, not a sub-faction the page could also suggest (UL-KHARI): the GM adds that in the
    picker. *(User ruling, 2026-10-02.)*
85. **A Threat Assessment faction takes the Keywords its own stat blocks share** (TA pp.22–186; GitHub issue #46).
    The faction sections print no faction Keyword of their own, so each preset (`faction-presets/threat-assessment.json`)
    takes the Keywords printed on every stat block of that section's faction, read from the transcribed threats:
    Aeldari (p.22) AELDARI; Harlequins (p.52) AELDARI, HARLEQUIN, [MASQUE]; Drukhari (p.58) DRUKHARI; Ork Kultur (p.79)
    ORK; Genestealer Cults (p.104) GENESTEALER CULT; Necrons (p.131) NECRON; The T'au Empire (p.158) T'AU. The other
    species a section fields beside its faction don't count: the Purestrain Genestealer (p.117, GENESTEALER, TYRANID),
    and the Kroot and Vespid of the T'au section (pp.179–186). Notes stay empty: the sections are lore and stat blocks,
    and the stat blocks are already in the bestiary. *(User ruling, 2026-10-02.)*
86. **A Quick NPC at Tier 5 reads the Tier 4 row** (Core p.326; GitHub issue #47). Quick NPC Stats prints Tiers 1–4
    only. The stat-source chips are 1–4, a new Quick NPC defaults to `min(campaign Tier, 4)`, and the card says when it
    reads the Tier 4 row for a Tier 5 game (`quickRow`, the way `threatClassAt` falls back to the last printed Tier).
    *(User ruling, 2026-10-02.)*
87. **A Quick NPC may name one specialty Skill** (Core p.326; GitHub issue #47). The table has a single Default Skills
    pool, and the text says to "tweak the numbers up or down… a known gun for hire might have a Ballistic Skill of 6 at
    Tier 1, instead of 4". `StatSource` quick takes an optional `specialty: { skill, dice }` the GM sets. It's a house
    field: the book prints no Focus Skill column. *(User ruling, 2026-10-02.)*
88. **Quick NPCs aren't fielded** (Core p.326; GitHub issue #47). The row gives Defence, Resilience, Wounds and Shock,
    but no Attributes or weapons, and a combatant snapshots a full Threat. The card shows Scaling Threats instead
    (`quickScaling`): Troops usually have 1 Wound and 3 Shock, an Elite may add the Tier to Wounds and Shock, and an
    Adversary or Monstrous Creature may add the number of players plus the Tier. ADD TO SCENE takes bestiary NPCs only;
    a Quick NPC fights once custom threats exist (issue #43). *(User ruling, 2026-10-02.)*
89. **An NPC's Attitude reaches the players** (Core p.168; GitHub issue #47). `toPlayerCodex` blanks a revealed NPC's
    stat source, GM notes, secrets and faction, but keeps its Attitude, and KNOWN PERSONS shows it with its DN modifier
    (`ATTITUDE_DN`). *(User ruling, 2026-10-02.)*
90. **Aeldari Eye Colour is capped at 12** (Core p.32; GitHub issue #48). An Aeldari adds 3 to the 2d6 Eye Colour
    roll, which can reach 15, but the table ends at 12, "Mismatched – roll twice". A total over 12 reads row 12, so
    9 or more on the dice gives mismatched eyes. Each of the two re-rolls is an Eye Colour roll and adds 3 too, and a
    re-roll that lands on row 12 rolls again (`rollOn`). "Mismatched" means two colours, so a second re-roll on the
    first's colour rolls again too. *(User ruling, 2026-10-03.)*
91. **ROLL LOOK writes to DESCRIPTION** (Core pp.32–33; GitHub issue #48). DESCRIPTION is what players read once the
    NPC is revealed, and a look is what they see. The words are short table cells, the GM edits them before SAVE, and
    nothing is saved until then. The roll buttons take no I ROLLED: name lists have no dice, and NAME and DESCRIPTION
    stay editable for a physical roll. *(User ruling, 2026-10-03.)*
92. **A spotted hazard lowers its DN by the GM's call** (TA p.9; GitHub issue #49). An Agent who identifies a hazard in
    advance earns a lower DN on the Tests to avoid it, but the book prints no amount. The app applies none: a spotted
    hazard shows the reminder "lower the DN", and the GM decides by how much. *(User ruling, 2026-10-03.)*
93. **A Space Hulk hazard roll of 66 rolls again** (TA p.11; GitHub issue #49). The Space Hulk table prints rows to 65
    and none for 66. ROLL and ×TIER roll again on a 66; a typed 66 (I ROLLED) shows that the book prints no row, and
    the GM rolls again or taps one. *(User ruling, 2026-10-03.)*
94. **One hazard per Tier, and the GM's pick of intensity** (TA p.9, Core pp.201–202; GitHub issue #49). Rolling a d66
    per Tier is "probably enough" (TA p.9), so ×TIER rolls once per Tier of the campaign; the GM adds or drops any.
    Electricity and Rad Poison print Light, Moderate and Intense, each with its own damage and Toughness DN, and the
    GM chooses ("select an intensity", p.202): a place's entry stores the one picked. *(User ruling, 2026-10-03.)*
95. **A place holds its hazards; each scene picks which apply** (TA p.9; GitHub issue #49). A Battlezone is where combat
    is likely to happen, and a place can host several scenes, so the list sits on the place (`location.hazardList`) and
    each scene picks from it (`beat.hazards`). SPOTTED is per scene: the Agents may spot a danger before one fight and
    not another. A fresh start clears it. *(User ruling, 2026-10-03, over the issue's one list per place.)*
96. **Deleting a place makes the places inside it top-level** (GitHub issue #50). The books nest places (system,
    world, site, room) but say nothing of an app deleting one. The places directly inside go to the top level, and
    what's inside them stays where it is. Because that reshapes the tree, DELETE asks a second tap when anything is
    inside ("DELETE · 2 INSIDE GO TOP-LEVEL"). *(User ruling, 2026-10-03.)*
97. **Revealing a place doesn't reveal the places inside it** (GitHub issue #50). Players learn the Hive without the
    Spire. A revealed place whose parent is hidden shows at the top level on the phones. *(User ruling, 2026-10-03.)*
98. **A book's place may be added twice** (GitHub issue #50). ADD FROM BOOK copies again and makes a second copy; the GM
    deletes the spare. *(User ruling, 2026-10-03.)*
99. **ADD FROM BOOK lists every book's places** (Core p.320; GitHub issue #50). The Core Rulebook advises setting
    adventures in a limited area; that is the GM's choice of which worlds to copy, so the picker doesn't narrow it.
    *(User ruling, 2026-10-03.)*
100. **A place's printed text stops at GM NOTES' 5,000 characters** (GitHub issue #50). A copied place's notes are the
     cite, the stat line, the hook sidebars and the description. Where they run longer, the description stops at a
     whole paragraph with "… continues, <cite> p.N", and hooks that still don't fit are named in a last line, so the GM
     opens the page from the cite. *(User ruling, 2026-10-03.)*
101. **The Space Hulk Generator rolls in prep, and any stage may be rolled again or picked** (RR1 p.6; GitHub issue
     #50). The book: "if the result you roll doesn't take the adventure where you want to go, re-roll". Each stage
     takes ROLL, I ROLLED or a tapped row, as the other book tables do (§11.91). A roll on a print gap (Objective 14–16
     and 46) names the gap and the GM rolls again. Mixed Origin (63–66) says to roll Origin more than once, so the hulk
     keeps every origin the GM rolls, up to five. *(User ruling, 2026-10-03.)*
102. **A generated hulk's rooms can come later, and its hazard is structured** (RR1 pp.9, 11; GitHub issue #50). Rooms
     may be rolled "as the group enters", so the generator also adds rooms under an existing place. Stage 4's feature
     goes on the hulk's hazard list as its book row (§11.95), not into GM NOTES: every row reads "while aboard this
     vessel", so it sits on the hulk, not on a room. *(User ruling, 2026-10-03.)*
103. **Which classes may take a Threat Profile** (VoA p.126; GitHub issue #42). The three Tier 5 profiles "can be applied
     to any enemy Threat", while p.127's advice is about Champions and signature Adversaries. So the app offers them on
     any class, at any count, and leaves the judgement to the GM. A Mob is the one place to think twice: every member
     takes the same raised profile, so the beat editor says so rather than refusing it. *(User ruling, 2026-10-03.)*
104. **Profiles stack, additively** (VoA p.126; GitHub issue #42). The book prints three and is silent on combining them.
     Each is a separate toggle on the entry, so Heretical Strength and Xenos Cunning together give Strength +2,
     Intellect +2, Willpower +2, Weapon Skill +2, Resilience +2 and Resolve +1. "The increase does not affect related
     statistics or abilities", so nothing is re-derived from a raised Attribute: a +2 to Strength does not move melee
     damage, and a +2 to Resilience is the printed number plus 2, armour note unchanged. *(User ruling, 2026-10-03.)*
105. **A profile's Skill the Threat doesn't list** (VoA p.126, Core p.323; GitHub issue #42). Weapon Skill and Ballistic
     Skill are Skills, and a stat block prints only some of them; an unlisted Skill rolls the Default pool (p.323). So a
     profile adds the Skill at Default + its bonus, which is what that Threat would have rolled anyway, raised. A Threat
     with no Default either (a printed "–") keeps its Skills untouched and the applied bonus says the raise had nowhere
     to land, rather than inventing a pool from nothing. *(User ruling, 2026-10-03.)*
106. **"The number of players" in scaling** (Core p.326; GitHub issue #42). Scaling Threats adds "the number of players
     plus the game's Tier" to an Adversary's or Monstrous Creature's Wounds and Shock. The app counts the Agents in the
     fight — the active ones `beat.startEncounter` adds (`claimedCharacterIds` server-side), as the encounter budget does
     (§11.82) — not every character in PARTY, since a reserve Agent is not at the table for that fight. While nobody
     holds a seat yet, it counts the whole roster instead, as the budget does (`agentsInFight`). The count is
     taken when the Threat is added and fixed in its snapshot: an Agent who joins mid-fight does not re-scale a Threat
     already in play, as nothing else about a snapshot changes once it is taken. *(User ruling, 2026-10-03.)*
107. **Scaling does nothing to a Mob** (Core pp.325–326; GitHub issue #42). Every member of a Mob has 1 Wound (p.325), so
     added Wounds have nowhere to go: SCALE adds nothing on a Mob entry, nor on a Troop, which p.326 says to keep as
     simple as possible. The toggle still shows a tick the GM has set there, and says it adds nothing, because the tick
     would take effect again with the Mob off. Profiles still apply to both. *(User ruling, 2026-10-03.)*
108. **Profiles are not Tier 5 only** (VoA p.126; GitHub issue #42). They are printed in a Tier 5 chapter and nothing in
     them is bounded by Tier, so the app offers them in any game. Scaling already carries the Tier in its own arithmetic
     (p.326). *(User ruling, 2026-10-03.)*
109. **A custom threat's class row is the GM's** (Core p.323, p.326; TA p.6; GitHub issue #43). Threat Assessment p.6
     ties a Threat's class to the Tier it is met at, with no formula, and Core p.326's Quick Threats gives numbers per
     Tier "to be tweaked". So the editor accepts any class in any Tier slot — with "–" allowed before the last, as the
     printed blocks have it — and only hints: a Troop over 1 Wound or 3 Shock (p.326), and a Mob option on a Threat that
     is a Troop at no Tier (p.324, where Mobs are Troops only). The server accepts whatever `Threat` accepts: a hint that
     refused a save would be the app inventing a rule. *(User ruling, 2026-10-03.)*
110. **QUICK fills what the book's table holds, and no more** (Core p.326; GitHub issue #43). The Quick NPC Stats table
     gives Default Skills, Defence, Resilience, Wounds, Shock, Conviction, Resolve and Speed per Tier, and no Attributes.
     So QUICK (Tier N) prefills those eight and leaves the seven Attributes to the GM, rather than inventing a spread the
     book doesn't print. Troops start at 1 Wound and 3 Shock, as p.326 says they usually are. *(User ruling, 2026-10-03.)*
111. **A custom threat belongs to one campaign** (GitHub issue #43). Nothing in the books is at stake; this is about where
     the GM's own work lives. A custom threat is campaign content, like an NPC or a scene: it rides that campaign's codex,
     its export and its import, and there is no shared library across tables. A GM who wants one in a second game exports
     and imports, or writes it again. *(User ruling, 2026-10-03.)*
112. **Giving a found item uses the Agent's Wargear Test for the session** (Core pp.205–206; GitHub issue #51). The
     books put Wargear in an Agent's hands by requisition; a found item is the GM's other way in. GIVE takes no
     Influence Test and needs no Keyword in common, but it counts as that Agent's Wargear Test: it needs an open
     session, and it is refused once the Agent has made this session's Wargear Test, by requisition or an earlier GIVE.
     *(User ruling, 2026-10-03, over the issue's "skip all three".)*
113. **One item is one piece** (GitHub issue #51). "4 Respirators" is four items, each a gear line once given. A loot
     row with a count makes that many items, up to 20 at once. Ammo and grenades are counted by type on the sheet, so
     GIVE refuses them: the GM awards them with PARTY's supply or a requisition. *(User ruling, 2026-10-03.)*
114. **TAKE BACK undoes a GIVE** (GitHub issue #51). The given weapon comes off the sheet and any upgrades fitted to it
     return as gear lines, as REMOVE does. A given upgrade that has since been fitted comes off its weapon. A
     gear line the GM already deleted just ends the record. The item is loose again (no place, no NPC) and can be
     given again; the session's Wargear Test is not refunded. *(User ruling, 2026-10-03, over the issue's "not built".)*
115. **Trinkets & Charms are keepsakes and loot** (Core p.247; Darktide p.15). The Core Rulebook rolls them for a past
     life; Darktide hands them out as finds. FROM LOOT TABLE lists the three Trinket tables beside the books' loot
     tables. *(User ruling, 2026-10-03.)*
116. **A relic's Powers apply where a weapon profile can hold them** (RR2 pp.12–19; GitHub issue #51). A rolled Power
     is recorded as the same changes an upgrade makes (a Trait, +Damage, +ED, AP, Salvo, range, bonus dice), with the
     rest as a note for the GM (`gm`, as §11.68). Given as a weapon, the relic carries them on the sheet beside the
     printed profile, and the shown profile is derived, so nothing applies twice. On a relic that is not a weapon, the
     Powers stay in GM NOTES. *(User ruling, 2026-10-03, over the issue's "notes only".)*
117. **The Holy Relic creator follows its grid** (RR2 pp.12–13; GitHub issue #51). The worked example on p.12 reads
     a 3 then a 1 as a Force Weapon; the Form grid on p.13 prints the Force Weapon at row 6, column 1. The data copies
     the grid as printed, and the example is noted, not followed. *Proposed; awaiting the GM.*
118. **GIVE refuses a weapon the Agent already carries** (GitHub issue #51). Requisition joins a catalogue weapon once
     by name and skips a second copy silently. A silent GIVE would leave the item recorded as given with
     nothing on the sheet, and TAKE BACK would then remove the Agent's own weapon. *Proposed; awaiting the GM.*
119. **Bloody Gates prints Rarity as a number** (BG pp.6, 13, 21, 24; GitHub issue #51). Its mission equipment reads
     "Rarity: 2" where the Core Rulebook names a Rarity. The number is read as the DN it adds to a requisition (Core
     p.206): 0 Common, 1 Uncommon, 2 Rare, 3 Very Rare, 4 Unique. *Proposed; awaiting the GM.*

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
| Session start | done | `session.start` (Wrath 2, Glory 0, Ruin = characters), plus a one-line notice naming whoever still has XP to spend, three at a time and then "N more" (Core p.146, p.148; §11.69); `session.end` awards XP |
| Respite | done | `character.respite` (refused while Dying or Dead) |
| Personal Ruin | done | `combatant.personalRuin`, seeded from the stat block; tracker SPEND / +1 |
| Turn reminders | done (client) | `TURN_START_REMINDERS` / `TURN_END_REMINDERS`, fired by the tracker into the GM's vox log only |
| Slain / Dead in turn order | done | `isOut` in `canAct` / `sideUpNext`; `turn.start` refuses them and the `turn.end` rollover skips them. An Adversary over max Wounds stays until the GM removes it (§11.10) |
| Annihilation | done | `pcHit`: one hit over 2 × Max Wounds sets `character.annihilated` → Dead (p.194, §11.7); GM RESTORE / undo clears it. Agents only: an Adversary over max Wounds is already the GM's call (§11.10) |
| Exhausted → Mortal Wounds | done | `exhaustedShock` in `pcHit` and `combatant.adjust` (p.199, §11.12); single Threats too, Mobs keep no Shock track |
| Timed Conditions | done | Hindered, Staggered, Vulnerable (`isTimed`): `turn.start` / `turn.seize` arm the ones held (`combatant.expiring`), `turn.end` removes them (§11.8). Pinned doesn't expire (the attacker isn't tracked) |
| Advancement in play | done | ADVANCE spends XP on ratings, Talents, powers, languages and Advancement Packages (`resolveBuild`); the sheet shows XP earned, XP to spend (`xp − xpSpent`) and Rank with a LEVEL UP badge onto ADVANCE, and PARTY shows both per character. Each purchase carries the session it was bought in (`boughtIn`, stamped server-side), and ADVANCE groups the in-play ledger by session (§11.69) |
| Ascension Package count | done | One Ascension Package per Ascension (Core p.148, §11.55), one Ascension per Tier since creation: `build.ts` fills them in the order bought, prices "× the new Tier" at each one's own Tier, and refuses a package past the last |
| Ascension in play | done | `campaign.ascend` raises the Tier for everyone (Experience needs every character at 100+ XP in the Tier; Milestone is the GM's and awards 100 each, optionally waiving the package), tracked by `character.xpAtAscension`; the builder's ASCENSION step offers the package or Archetype Ascension (Core pp.147–148, 155; §11.66, §11.67) |
| Archetype Ascension | done | `advancement.archetypeAscension` in `resolveBuild`: Rank 3, the same `factionId`, a Tier the group Ascended to, and the ratings matched, granting the new Archetype's abilities, Keywords, Wargear and Influence but none of its ratings, tested against Core p.155's Scout → Tactical Marine (§11.67) |
| Wargear upgrades on a weapon | done | All 64 catalogue upgrades carry `slot`, `fits` and `mods`. `character.fitUpgrade` / `removeUpgrade` check the fit, three at most and one per slot; a requisition can hand one straight to a weapon (`fitTo`). The sheet stores the printed profile plus the ids and `withUpgrades` derives what is shown, so nothing double-applies (Core pp.227–228; §11.63–§11.65) |
| Standing weapon effects | done | 47 Talents, abilities, packages and traits carry `weapons` (28 change numbers, 19 are notes only) (Bolter Discipline's Rapid Fire, a Doctrine's AP, Trademark Weapon's ED…); re-roll and dice effects are cited notes. `resolveBuild` stores them on the sheet and `withWeaponEffects` applies them on read at the Rank the XP earned gives, so a session's XP shows with no rebuild (§11.68, issue #27). Gaps: unarmed strikes, faction rules, weapons outside the catalogue (docs/data.md) |
| Wargear upgrades on armour | done | The sheet's `armour` carries `wargearId`, `upgrades` and `fitted` like a weapon; `withUpgrades` applies `ar` and Trait mods and prints the rest as notes, under the same cap of three and one per slot (`host: "armour"` on `character.fitUpgrade` / `removeUpgrade`, and the fit control on the sheet's armour line). 13 entries are armour's alone and the Suspensor Crystal fits either host through `slotOn` (§11.64–§11.65) |
| Per-class rule chips | done | `THREAT_CLASS_RULES` in the tracker side panel (pp.323-324); `combatant.update` refuses Fear, Pinned, Staggered on Monstrous Creatures (`MONSTROUS_IMMUNE`) |
| Custom threats | done | `custom_threat` + `threat.save` / `threat.delete`, `loadThreats` (bestiary + this campaign's own), `Codex.customThreats` (GM sockets only), export, import and packs; CODEX › THREATS clones a book entry, starts blank or starts from the Quick row, and hints never block (§11.109, §11.111). QUICK (Tier N) starts one from Core p.326's row through `quickRow` and leaves the Attributes to the GM (§11.110); the five Additional Ruin Actions (TA p.7) are offered as RUIN abilities from the Ruin pool table `/scene-presets` already serves (`ruinAbility`) |
| Threat profiles and scaling | done | `THREAT_PROFILES`, `applyProfile`, `scaleBy`, `scaleThreat`, `prepareThreat` (`threat-scale.ts`, VoA p.126, Core p.326); `EncounterEntry.profiles` / `.scale` and the same two fields on `combatant.addThreat`, applied in `addThreat()` before the snapshot with the seated Agents as the count; `ThreatScale` chips and the SCALE toggle in the beat editor and TRACK, and the profiles named on the scene card (§11.103–§11.108) |
| Encounter budget | done | `encounterBudget`, `tallyByClass`, `rosterTally` (`threat.ts`) against Building Encounters (TA p.8); `BudgetLines` prints Troops, Mob, Elite/Adversary, Monstrous and enemies ("N tracked · M models"), with a FORTIFIED toggle that doubles every target; `BudgetPanel` under the beat editor, sized by the active Agents (§11.82) |
| Quick NPCs and Attitude | done | `QUICK_NPC`, `quickRow` (Tier 5 → Tier 4, §11.86), `quickScaling` (p.326, §11.88) and `ATTITUDE_DN` (p.168) in `codex.ts`; `StatSource` quick takes a `specialty` (§11.87); Attitude reaches phones (§11.89); CODEX's `StatSourceField` and `NpcCard`, `AttitudeChip` on both sides; ADD TO SCENE (`addNpcToBeat`) for bestiary NPCs only; ADD FROM BOOK (`NpcPreset`, `/npc-presets`) |
| Location hazards | done | `HazardTable` and `HazardRow` in `scene-presets.ts` (Tests with a printed or Tier DN, Conditions, Threats, intensities); `scene-presets/hazards/<source>.json` for Threat Assessment pp.9–21, Core pp.201–202, Darktide pp.14–27 and RR1 p.11, served on `/scene-presets`; `location.hazardList` with `checkHazards`, a scene's `beat.hazards` picks with SPOTTED (§11.92–95); the CODEX editor's HAZARDS list and the PREP card's HAZARDS fold |
| Location tree and places from the books | done | `wouldCycle`, `placeTree`, `flatTree` in `codex.ts`; the `codex.save` and import guards; CODEX LOCATIONS as a tree, tree-ordered selects, the phone's nested KNOWN LOCATIONS; `Place` and `placeNotes` in `places.ts`, `places/<source>.json`, GM-only `/places`, `codex.addPlaces`, the `PlacePicker` (§11.96–100); the Space Hulk Generator (RR1 pp.6–11): `SpaceHulkGenerator`, `hulkNotes`, `roomNotes`, `scene-presets/space-hulk.json` on `/scene-presets`, `codex.addHulk`, the `HulkGenerator` (§11.101–102) |
| NPC name and look | done | `rollOn` reads a flavour table's shape (a name list, Element columns, a Features grid, 2d6 and d66 rows; "roll twice") with `roll`/`rowsFor`; `rollLook` and `LOOK` (Core p.32: Aeldari +3, capped, §11.90; Orks blood-red, no hair) in `flavour.ts`; ROLL NAME and ROLL LOOK in CODEX › NPCS, fed by GM-only `/flavour`, write NAME and DESCRIPTION without saving (§11.91) |
| Items | done | `CodexInput.item` (a catalogue `wargearId` or a custom name, a place or an NPC, a relic's `mods`), server-owned `givenTo`, `beat.itemIds`; `character.giveItem` on the session's Wargear Test and `character.takeItem` through `grantWargear` (§11.112–105, 109); `Weapon.mods` applied by `withUpgrades` (§11.116); CODEX ITEMS with GIVE TO / TAKE BACK, the scene's ITEMS TO FIND |
