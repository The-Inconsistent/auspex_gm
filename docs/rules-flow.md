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

Ruin is **visible to the players** (p.320), but [HOUSE] the app keeps it GM-only (§11.58).

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
    (`notAtCreation` ones too). When the group Ascends (the GM raises the campaign's Tier), each character may take one
    Ascension Package per Tier Ascended, in order: its requirements met at the Tier it leaves, "× the new Tier" priced at
    the Tier it reaches. A power's "at creation" price (Smite) gives way to its later one. Rank is from the XP earned.
    The creation budget stays as it was. *Proposed; awaiting the GM.*
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
