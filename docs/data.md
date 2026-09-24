# Data: threats, content packs, transcription

For a developer or the GM who is adding threats, building a campaign pack, or fixing a transcription. Schemas live in
`packages/shared` (zod 4); the data lives in `packages/data`. Architecture context: [architecture.md](architecture.md).
How the app uses a threat once it is in a fight: [game-logic.md](game-logic.md) and [rules-flow.md](rules-flow.md).
Commands and setup: [development.md](development.md).

---

## 1. The package

| Path | What |
|---|---|
| `packages/data/threats/*.json` | One stat block per file, flat (no per-book folders). Schema `Threat` in `packages/shared/src/threat.ts` |
| `packages/data/packs/<name>/pack.json` | A campaign start: campaign, factions, locations, NPCs, handouts, adventures and beats. Schema `Pack` in `packages/shared/src/pack.ts` |
| `packages/data/packs/<name>/characters/*.json` | One character per file, `{ name, stats }`. `stats` is `CharacterStats` in `packages/shared/src/state.ts` |
| `packages/data/index.ts` | Server-side loaders (below) |
| `packages/data/validate.ts` | `bun run validate` (§6) |

**Loaders** (`index.ts`, exported as `@wg/data`):

| Symbol | Does |
|---|---|
| `threats` | `ReadonlyMap<id, Threat>`. Parses every `threats/*.json` with `Threat.parse` **at import time**, sorted by filename |
| `packNames()` | Folder names under `packs/` |
| `loadPackRaw(name)` | `pack.json` plus `characters: [...]` from `characters/*.json` (sorted by filename, so `01-`, `02-` prefixes set the order). A missing `characters/` folder is fine. Unparsed |
| `loadPack(name)` | `Pack.parse(loadPackRaw(name))`; throws on a bad pack |

**Who loads it.** The api imports `threats` in `apps/api/src/encounter/encounter.actions.ts` and
`apps/api/src/campaign/campaign.service.ts`, so a malformed threat file throws a zod error and **the api refuses to
start**. Packs are only loaded by `apps/api/scripts/seed.ts` (`loadPack`) and `validate.ts` (`loadPackRaw` +
`safeParse`, to report every error). The web app never imports `@wg/data`; the GM gets threats from `GET /api/campaigns/:id/threats`.

**Snapshot.** When a threat joins an encounter (`combatant.addThreat`, `beat.startEncounter`), the whole `Threat`
object is copied into the combatant row (`statSnapshot`) and its class for the campaign Tier is fixed then
(`threatClassAt`). Fixing a JSON file changes future fights, not the one in progress.

---

## 2. Threat JSON

### Field reference (`Threat`, `packages/shared/src/threat.ts`)

Format follows the bestiary layout, Core p.323. Stats don't vary by Tier; only the class does.

| Field | Type | Meaning |
|---|---|---|
| `id` | string, `^[a-z0-9-]+$` | Must equal the filename without `.json` (validate checks) |
| `name` | string | As printed |
| `source` | `core` \| `threat-assessment` \| `gutshivas-kommandos` \| `vow-of-absolution`; default `core` | Book id. Omit for core |
| `page` | positive int | **Printed** page in `source`, not the PDF page |
| `faction` | `imperial` \| `heretic` \| `daemon` \| `ork` \| `aeldari` \| `drukhari` \| `genestealer` \| `necron` \| `tau` \| `mechanicus` | Grouping for the GM picker |
| `threat` | array of `T`/`E`/`A`/`M`, 4–5 entries | Class at Tier 1..4 (supplements print a Tier 5 column) |
| `keywords` | string[], ≥ 1 | As printed, including `<PLACEHOLDER>` keywords |
| `attributes` | `{ S, T, A, I, Wil, Int, Fel }`, ints | |
| `resilience` | `{ value: int, note?: string }` | `note` holds the bracketed part, e.g. the AR |
| `defence` | int | |
| `wounds` | positive int | Max Wounds |
| `shock` | positive int \| `null` | Max Shock. `null` = printed "–": never suffers Shock (Core p.324) |
| `skills.default` | int \| `null` | The "Default" pool; `null` if none printed |
| `skills.list[]` | `{ name, dice: int, passive?: int }` | Each named skill; `passive` for a printed "(Passive N)" |
| `personalRuin` | positive int, optional | Champions only; the number the Champion bonus prints |
| `bonuses[]` | `{ name, text }`, default `[]` | The BONUSES box |
| `abilities[]` | `Ability`, default `[]` | The ABILITIES box (below) |
| `determination` | string, optional | The DETERMINATION line as printed |
| `conviction`, `resolve`, `speed` | int | |
| `size` | `Tiny` \| `Small` \| `Avg` \| `Large` \| `Huge` \| `Gargantuan` | |
| `options[]` | `ThreatOption`, default `[]` | Mob and variant options (below) |
| `mobAbilities[]` | `Ability`, default `[]` | Abilities that apply only while in a Mob |

**`Ability`**

| Field | Type | Meaning |
|---|---|---|
| `type` | `BATTLECRY` \| `ACTION` \| `RUIN` \| `WRATH` \| `COMPLICATION` \| `REACTION` \| `ANNIHILATION`, optional | The printed prefix. Untyped = plain rule |
| `name` | string, optional | |
| `text` | string, optional | |
| `weapons` | `Weapon[]`, default `[]` | Attack profiles |

**`Weapon`** (also reused, plus `addStrength`, by `CharacterStats.weapons`)

| Field | Type | Meaning |
|---|---|---|
| `name` | string | |
| `count` | positive int, optional | Printed quantity, e.g. grenades `(2)` |
| `damage` | int | Base damage |
| `ed` | int \| string | Extra Damage dice; a string for dice notation such as `"1d3"` |
| `ap` | int ≤ 0, optional | Negative, as printed. Omit when none |
| `range` | 1–3 positive ints | `[1]` melee, `[N]` thrown, `[S, M, L]` ranged |
| `salvo` | int ≥ 0 \| `null`, optional | `null` = printed "–" |
| `traits` | string[], default `[]` | As printed, including the value, e.g. `"Rapid Fire (3)"` |

**`ThreatOption`**

| Field | Type | Meaning |
|---|---|---|
| `kind` | `mob` \| `variant` | `mob` = a Mob's extra kit or rule; `variant` = an alternative loadout or profile |
| `name`, `text` | string | |
| `weapons` | `Weapon[]`, default `[]` | |
| `abilities` | `Ability[]`, default `[]` | |

### Conventions

| Convention | Detail |
|---|---|
| `id` = filename | `ork-boy.json` → `"id": "ork-boy"`. A supplement reprint of a core entry takes a book prefix (`ta-ork-boy`, `ta-kommando`) so both can coexist |
| `source` | Book id from the enum above; omitted means `core`. A new book needs a new enum value first |
| `page` | Printed page, never the PDF page (see §3 for the offsets) |
| `threat` | 4 letters for core (Tiers 1–4), 5 when the book prints Tier 5. `threatClassAt(t, tier)` picks `threat[min(tier, length) - 1]`, so a 4-letter entry at a Tier 5 campaign uses its Tier 4 class. Class rules: [rules-flow.md](rules-flow.md) §4, Threat classes |
| Weapons | Inside an `ACTION` ability (`{ "type": "ACTION", "weapons": [...] }`, usually no name or text), never loose on the threat |
| `shock: null` | Printed "–" |
| Mobs | Mob-only kit and rules go in `options` with `kind: "mob"`; Mob-only abilities in `mobAbilities`. Some books print `mobAbilities` without a Mob option; keep what is printed |
| Print errors | Copy as printed; note them in the commit or PR. Don't correct silently |

### Skeleton (placeholder values only)

```json
{
  "id": "example-threat",
  "name": "Example Threat",
  "source": "threat-assessment",
  "page": 100,
  "faction": "ork",
  "threat": ["E", "E", "T", "T", "T"],
  "keywords": ["KEYWORD"],
  "attributes": { "S": 1, "T": 1, "A": 1, "I": 1, "Wil": 1, "Int": 1, "Fel": 1 },
  "resilience": { "value": 1, "note": "AR 0" },
  "defence": 1,
  "wounds": 1,
  "shock": null,
  "skills": { "default": 1, "list": [{ "name": "Awareness", "dice": 1, "passive": 1 }] },
  "bonuses": [{ "name": "Bonus name", "text": "…" }],
  "abilities": [
    { "type": "ACTION", "weapons": [
      { "name": "Melee weapon", "damage": 1, "ed": 1, "range": [1], "traits": [] },
      { "name": "Ranged weapon", "damage": 1, "ed": "1d3", "ap": -1, "range": [1, 2, 3], "salvo": 1, "traits": ["Trait (1)"] }
    ] },
    { "type": "RUIN", "name": "Ability name", "text": "…" }
  ],
  "determination": "…",
  "conviction": 1,
  "resolve": 1,
  "speed": 1,
  "size": "Avg",
  "options": [{ "kind": "mob", "name": "Option name", "text": "…", "weapons": [] }],
  "mobAbilities": [{ "name": "Ability name", "text": "…" }]
}
```

---

## 3. Sources and page offsets

The PDFs are in `books/` (gitignored by `*.pdf`).

| Book | `source` id | File in `books/` | PDF page = |
|---|---|---|---|
| Core rulebook | `core` | `Warhammer 40000 Roleplay Wrath and Glory - Rulebook.pdf` | printed + 1 |
| Threat Assessment | `threat-assessment` | `Wrath & Glory_ Threat Assessment.pdf` | printed |
| Gutshiva's Kommandos | `gutshivas-kommandos` | `Wrath & Glory_ Gutshiva’s Kommandos.pdf` (curly apostrophe) | printed |
| Vow of Absolution | `vow-of-absolution` | `Wrath & Glory_ Vow of Absolution.pdf` | printed |
| Threat Assessment: Daemons | *none yet* | `Warhammer 40,000_Wrath & Glory_Threat Assessment_ Daemons.pdf` (the second copy with spaces is byte-identical) | printed |
| Forsaken System Player's Guide | `forsaken-system` (creation only) | `Wrath & Glory - Forsaken System Player's Guide.pdf` | printed |
| Aeldari: Inheritance of Embers | `inheritance-of-embers` (creation only) | `Warhammer 40,000_ Wrath and Glory_ Aeldari_ Inheritance of Embers.pdf` | printed |
| An Abundance of Apocrypha v9 (homebrew) | `apocrypha` (creation only) | `Wrath & Glory - An Abundance of Apocrypha v9.pdf` | printed + 3 |
| Legacy of the Necrontyr (homebrew, 1st-edition format) | `legacy-of-the-necrontyr` (creation only) | `Legacy of the Necrontyr.pdf` | no printed pages: cite PDF pages |

No creation content: Darktide and Litanies of the Lost (official adventures), `Wrath Glory Condensed Rules.docx.pdf`
(fan quick-reference). The creation `source` ids are `SOURCES` in `packages/shared/src/creation.ts`, separate from
`Threat.source` and `WargearSource`.

**Daemons book:**
- The offset was checked on PDF pages 15, 41, 75, 101 and 125, where the folio (bottom right, odd pages only) matches
  the PDF page. Even and full-art pages have no folio.
- This PDF has **no text layer**. `pdftotext` returns nothing and `pdffonts` lists no fonts, so work from page images
  only (§4).
- It is not in the `source` enum yet, so a Daemons threat can't validate until an id is added to `Threat.source` in
  `packages/shared/src/threat.ts`.

---

## 4. Transcribing a threat from the books

1. **Find the page.** Convert printed → PDF page with §3.
2. **Read the text** (not for the Daemons book):
   `pdftotext -f N -l N "books/<pdf>" - | grep -v "Order #"`. The `grep` drops the purchase watermark.
3. **Check against the image.** Stat blocks and tables garble in text (columns interleave, "–" and dice notation get
   lost). Render the page with `pdftoppm -f N -l N -r 110 -png "books/<pdf>" <scratch>/p` and Read the PNG. The Read
   tool refuses PDFs over 100 MB, so always go through a PNG.
4. **Write `threats/<id>.json`** using the skeleton and conventions in §2.
5. **Double-check** against the image:
   - the Threat row: one letter per Tier, with the right count (4 or 5)
   - that `shock` "–" became `null`, and `salvo` "–" became `null`
   - that AP is negative and ED keeps dice strings (`"1d3"`)
   - that ranged weapons have `[S, M, L]` in that order and melee is `[1]`
   - that skill `passive` values are present and `default` is right
   - Resilience: the value plus the bracketed `note`
   - `personalRuin` on Champions
   - that Mob kit goes in `options`/`mobAbilities`, not `abilities`
   - that `page` is the **printed** page
6. **Run `bun run validate`** (§6). The api also refuses to start on a bad file.
7. Record any print errors in the commit or PR.

For a large batch, split the work across subagents, one book section each.

### Core bestiary transcription notes

All 36 Core threats (pp.327–371) are in. Print errors are copied as printed, except where the schema can't hold them:
- **Sign flipped (schema allows AP ≤ 0 only):** Corsair Felarch Power Sword "AP 3" and the Three-Armed Discount Heavy
  Rock Saw "AP 4" (p.370) are stored as −3 and −4; the option text keeps the printed value.
- **Pages:** `combat-servitor` is p.334 and `cult-leader` p.339 (the stat blocks' pages, not the contents page).
- **No range printed, kept as ability text:** Painboy's 'Urty Syringe (`[1]`, as `dok-bitzbak`), Killa Kan Explosion,
  Possessed Mortal Warp Explosion, Plague Marine Noxious Discharge, Plagueridden Rotten Explosion.
- **Psychic powers:** `Threat` has no field for them; Rogue Psyker, Patriarch and Magus list theirs in ability text.
- **Other oddities kept:** Acolyte Hybrid's Autopistol carries an autogun profile; Daemonette claws "1 1 +2ED" read as
  11; typos such as "Horrifying Mutatios"; "Rapid-Fire (1)" (Enforcer); "Inflicts" vs "Inflict".
- **Sidebars as `options`, not files:** Gun Servitor, Other Servo-Skulls, Chrono Scissor/Secutor, Aspiring Champion,
  Plague Marine, Pathfinders, Corsair Felarch, Kan Weapons, Three-Armed Discount, Bloodreaper, Alluress, Plagueridden,
  Blue/Brimstone Horror, Winged/Psychic Spawn. Stat changes live in option text (the tracker doesn't apply them).
- **Not transcribed:** Veteran Troopers & Sergeants (p.329, a partial profile), Sergeants & Assault Marines (p.331, the
  Tactical Space Marine's swaps), Runtherd (p.358).
- **Faction calls:** Chrono Gladiator `imperial`; Combat Servitor and Servo-Skull `mechanicus`; Poxwalker and Chaos
  Spawn `heretic` (by keyword, though printed among the daemons).

---

## 5. Content packs

### `Pack` (`packages/shared/src/pack.ts`)

The entry shapes reuse `CodexInput` from `packages/shared/src/codex.ts`. The server-owned uuid fields are replaced by
`key` references. Every `key` matches `^[a-z0-9-]+$`.

| Field | Shape | Notes |
|---|---|---|
| `campaign` | `{ name (1–100), tier (1–5), framework? (≤ 5000), patron? (≤ 200) }` | |
| `factions[]` | `CodexInput.faction` + `key` | `name`, `keywords[]` (≤ 20), `stance` (`ally`/`neutral`/`rival`/`enemy`), `notes`, `secrets` |
| `locations[]` | `CodexInput.location`, with `parent?: key` in place of `parentId` | `name`, `description`, `gmNotes`, `hazards`, `revealed` |
| `npcs[]` | `CodexInput.npc`, with `faction?: key` in place of `factionId` | `name`, `role`, `description`, `gmNotes`, `secrets`, `attitude` (`hostile` … `helpful`, Core p.168), `statSource`, `revealed` |
| `handouts[]` | `CodexInput.handout` + `key` | `title`, `body` (≤ 20000), `revealed` |
| `adventures[]` | `CodexInput.adventure` + `key` + `beats[]` | `title`, `premise`, `status` (`planned`/`running`/`done`) |
| `adventures[].beats[]` | `CodexInput.beat` with `location?: key`, `npcs: key[]`, `handouts: key[]` in place of the id fields | `title`, `type`, `status`, `readAloud`, `gmNotes`, `outcome`, `encounter[]`. Beats have no key; their order is their array order |
| `characters[]` | `{ name (1–100), stats: CharacterStats }` | Filled from `characters/*.json` by the loader; don't put it in `pack.json` |

Beat `type` is one of `briefing`, `travel`, `investigation`, `social`, `combat`, `revelation` or `rest`. Beat `status`
is one of `planned`, `active`, `done` or `skipped`. Almost every field has a default; only the names and titles are
required. Entity semantics: [campaign-model.md](campaign-model.md).

### Key references (checked by `Pack.superRefine`)

| Reference | Must resolve to |
|---|---|
| `locations[].parent` | A location **earlier in the array**. Parents come before children, because the seeder resolves keys in one pass |
| `npcs[].faction` | A faction key |
| `beats[].location` | A location key |
| `beats[].npcs[]` | NPC keys |
| `beats[].handouts[]` | Handout keys |
| `encounter[].threatId`, `npcs[].statSource.threatId` | A threat id. `validate.ts` checks this against the loaded threats; the schema doesn't |

### Prepared encounters (`EncounterEntry`, `codex.ts`)

| Field | Type | Meaning |
|---|---|---|
| `threatId` | string | A `threats/*.json` id |
| `count` | int 1–500, default 1 | How many |
| `asMob` | bool, default false | With `count > 1`: one Mob combatant of `count` members. Otherwise: `count` separate combatants, labelled `<label> 1..n` |
| `marker` | `red` \| `amber` \| `green` \| `blue` \| `purple` \| `white`, optional | Colour of the physical mini's tag or base |
| `label` | string ≤ 100, optional | Tracker label; default is the threat name (Mob: `Name ×N`) |

A beat allows at most 30 entries and **`MAX_ENCOUNTER_ROWS` = 60 combatant rows**. A Mob counts as 1 row; any other
entry counts as `count` rows. This is an app limit, not a rule: it bounds the inserts one `beat.startEncounter` runs
in a transaction. Group large counts as Mobs. The API doesn't check whether a threat prints a Mob option when you
set `asMob`. `beat.startEncounter` adds every party character, then the entries in order, and sets the beat to
`active`.

### NPC `statSource` (`StatSource`, `codex.ts`)

| `kind` | Extra field | Meaning |
|---|---|---|
| `bestiary` | `threatId` | Uses a threat file's stat block |
| `quick` | `tier` (1–4) | Quick NPC table, Core p.326 |
| `none` | — | No stats (the default) |

Players never receive `statSource` (`toPlayerCodex` blanks it).

### `characters/*.json` (`CharacterStats`, `state.ts`)

Each file is `{ "name": "...", "stats": { ... } }`. Every field has a default.

| Field | Type | Meaning |
|---|---|---|
| `species`, `archetype` | string | |
| `keywords` | string[] ≤ 20 | |
| `attributes` | `{ S, T, A, I, Wil, Int, Fel }`, 1–12 each | |
| `skills` | partial record of skill name → rating 0–8 | Names must be keys of `SKILLS` (e.g. `"Ballistic Skill"`). The pool is rating + the linked Attribute (`skillTotal`) |
| `armour` | `{ name, ar 0–20, invulnerable, powered 0–10, traits[] }` | `powered` is added to S for melee damage (`effectiveStrength`, Core p.232) |
| `speed` | int 0–20, default 6 | Species base speed (Core p.29) |
| `mods` | partial `{ maxWounds, maxShock, defence, resilience, resolve, conviction, influence, speed, determination }` | **Additive** on top of the derived Traits (`deriveStats`), e.g. Primaris +3 Wounds, Honour the Chapter +1 Resolve |
| `abilities[]`, `talents[]` | `{ name ≤ 100, text ≤ 2000, page?: string }`, ≤ 30 each | `page` is a free-text cite such as `"Core p.117"` or `"VoA p.35"` |
| `weapons[]` | `Weapon` + `addStrength: bool` (default false), ≤ 20 | `addStrength: true` for melee "S + X": damage = effective Strength + `damage` |
| `gear` | string[] ≤ 60 | |
| `wealth` | int ≥ 0 | Live counter (`character.supply`); starts at Tier (Core p.206) |
| `requisitioned` | `{ wargear?, ammo? }` session ids | Set by `character.requisition`; leave it out of packs |
| `ammo` | record of ammo type → count 0–99, ≤ 12 types | Live counter (`character.supply`). Per type, because each only reloads its own weapons (Core p.229): `{ "Bolt": 2, "Kraken Bolt": 1 }`. Describe special rounds in `gear` |

GM `overrides` are not part of a pack; the GM sets them in the app, and they win over the derived value plus `mods`.
The Volkus characters and their sources are in [pregens.md](pregens.md) and [kill-team.md](kill-team.md).

### How `seed.ts` loads a pack

`cd apps/api && bun run seed <name>` (the api must be running; `.env` supplies `ADMIN_KEY`, `PORT`, `WEB_ORIGIN`;
`API_URL` overrides the target):

1. `loadPack(name)`: a parse failure throws before anything is created.
2. `POST /api/campaigns` with `x-admin-key` creates the campaign (name and tier) and returns a GM token.
3. It opens a socket as the GM and sends the same `action` events the GM app sends, in order, mapping each `key` to
   the uuid the server returns:
   1. `campaign.update` (framework, patron)
   2. `codex.save` for factions, then locations, NPCs and handouts
   3. each adventure, then its beats
   4. `character.create` for each character
4. It prints counts and the table URL `/c/<campaignId>`, which the `--owner` user opens signed in.

There is no SQL: every row goes through `authorize` → `applyAction`, the same validation and campaign scoping as
live play ([backend.md](backend.md)). Each run creates a **new** campaign, and a failure part-way leaves a partial
campaign behind. An unknown `threatId` in a beat is only caught by validate or by `beat.startEncounter`, not by
`codex.save`.

### Wargear catalogue (`packages/data/wargear/*.json`, `Wargear` in `packages/shared/src/wargear.ts`)

The Core Wargear chapter (printed pp.211–247) and Vow of Absolution's Call to Arms (pp.59–75), one JSON array per
section, for the GM's requisition form. 277 entries:
- Core (219): `melee` (33, pp.211–213), `ranged` (44, pp.217–219), `ranged-xenos-grenades` (21, pp.220–221, 226),
  `upgrades-ammo` (26, pp.227–230), `armour` (28, p.233), `equipment` (41, pp.236–241), `augmetics` (26, pp.243–247).
- VoA (58, ids prefixed `voa-`): `voa-weapons` (37, tables on pp.62 and 67), `voa-upgrades-armour` (14, pp.68 and 73),
  `voa-equipment` (7, pp.74–75).
- Names printed in both books (Bolt Rifle, Heavy Bolter…) are different profiles; the form lists them with their cite.

| Field | Notes |
|---|---|
| `id`, `name`, `source`, `page`, `category` | `source` is `core` or `vow-of-absolution`; `id` is unique across all files; `page` is printed; `category` is the table heading |
| `kind` | `weapon`, `grenade` (Grenades and Missiles: requisitioned like Ammo, p.229), `armour`, `equipment`, `upgrade`, `ammo`, `augmetic` |
| `value`, `rarity` | As printed; `null` when none is printed (Clothing's "Variable" Rarity; the Arm Weapon Implant's "3 + Weapon Value") |
| `keywords` | Upper case, `[ANY]` kept |
| `weapon` | `Weapon` minus `name`, plus `addStrength` and `thrown` (the N of "S × N", p.207). A knife has both a melee `range` and `thrown` |
| `armour` | `{ ar, invulnerable, powered, traits }` |
| `effect` | Rules text only (the Effect line); no flavour |
| `note` | Print errors copied as printed, and transcription calls |

Transcription calls, all in each entry's `note`:
- **Launchers** (grenade launcher, missile launcher, Cyclone) print "Uses the profile of the Grenade/Missile fired", so
  they have no `weapon`; their range and traits are in `effect`. **Frag and Krak Missiles** print range "– – –"; they
  carry the Missile Launcher's 24/48/72 (§11.16).
- **Print errors kept:** Meltagun "Asault"; Combat Shotgun's trailing comma in Keywords (a third Keyword may be missing);
  Volkite Blaster range 12/24/48; missing commas between traits (Needle Pistol, Radium Pistol, Volkite Blaster) and
  Power Axe keywords, split.
- **Built from prose:** Psykana Mercy Blade (the Knife with AP −1 and ADEPTUS ASTRA TELEPATHICA, read as replacing
  [ANY]); Burna (Cuttin' Flame); Iron Gob's bite. The Mechadendrite is one entry per option, each with the shared
  Value 5, Very Rare.
- **VoA:** the Augmetics & Other Tools items (Adamantine Cuirass, Astartes Servo-Arm, Battle Standard, Halo Indomitus,
  Molecular Bonding Studs, Narthecium, Sanguine Flask, Teleport Homer, Omni-Scrambler, pp.73–75) print **no Value,
  Rarity or Keywords**, so the form warns and the GM sets them. Halo Indomitus is filed as armour (AR 3*), like Core's
  force fields. VoA prints the trait "Bulky (X)" (Core: "Bulk"), and Phobos's "+1 M, +2 Stealth" as in its table.
  Gladius Revelationis and Fames Sanguinius print Value "–". Described-only variants (Stalker Bolt Rifle, Hellstorm
  Heavy Bolter variant, Executor Heavy Bolter, named relics) have no entries.
- **Not entries:** Weapon Patterns (p.225, a variant rule), Ammo in the Gilead System (p.230), Augmetic Installation and
  Reconstruction rules (pp.242–243), Trinkets & Charms tables (pp.247–251).

### Rules reference (`packages/data/rules/*.json`, `RuleEntry` in `packages/shared/src/rules.ts`)

One file per `kind`: `conditions.json` (Core pp.197–200), `weapon-traits.json` (pp.208–210), `armour-traits.json`
(p.232), `combat-actions.json` (pp.177–190). Each entry is `id` (unique across files), `kind`, `name` as printed with
its rating (`Blast (X)`), `type` (actions only), `source`, printed `page`, `gist` (one terse line paraphrased from the entry's own text, in
the style of a quick-reference sheet, shown on the collapsed row) and `text`: the entry's body, verbatim,
paragraphs split by a blank line. Print errors are kept as printed; tables are plain lines. A section intro is its own
entry (`conditions`, `weapon-traits`, `armour-traits`). Served to any seat by `/api/campaigns/:id/rules`. To add a
kind (psychic powers, talents), extend `RuleKind` and add a file.

---

## 6. `validate.ts`

`bun run validate` checks the following, and exits 1 if anything fails:

| Check | Output |
|---|---|
| Every `threats/*.json` parses as `Threat` | `✖ <file>` + prettified zod error |
| `id` matches the filename | `✖ <file>: id "…" doesn't match filename` |
| A `core` threat whose id isn't in the core bestiary list (`EXPECTED`, Core contents pp.326–371) | `? <file>: …` warning, not a failure |
| Core bestiary progress | `core bestiary: N/36 (missing: …)` |
| Everything else | `supplements: N threats` (all threats minus core list hits) |
| Every pack parses as `Pack`, including key references and `MAX_ENCOUNTER_ROWS` | `✖ pack <name>` + zod error |
| Every beat `encounter[].threatId` and bestiary NPC `threatId` exists | `✖ pack <name>: unknown threat "…"` |
| Every `wargear/*.json` parses as `Wargear[]`; ids unique across files | `✖ wargear/<file>` + zod error, or `duplicate id` |
| Wargear summary | `wargear/<file>: N entries` |
| Every `rules/*.json` parses as `RuleEntry[]`; ids unique across files | `✖ rules/<file>` + zod error, or `duplicate id` |
| Rules summary | `rules/<file>: N entries` |
| Pack summary | `pack <name>: N characters, N NPCs, N beats` |
| Every `creation/<type>/<source>.json` parses; the filename is a creation source id and matches each record's `source`; ids unique per type | `✖ creation/…` + zod error, `has source`, or `duplicate id` |
| Every creation id reference resolves (factions, species, sub-factions, archetypes, talents, powers, disciplines, keyword names, `wargearId`) | `✖ creation/… "<id>": unknown <type> "…"` |
| One record per thing: a name twice in a type (with overlapping species, for archetypes) | `✖ creation/<type>: "…" in A and B; keep the newest printing` |
| Creation coverage against `creation/manifest.json` | `creation <type> <source>: N/M (missing: …)` |
| Creation summary | `creation/<type>: N records`, and counts of `text` fallbacks and wargear not yet in the catalogue |

---

## 7. Recipe: a new campaign pack

1. `mkdir -p packages/data/packs/<name>/characters`. The folder name is the pack name.
2. Write `pack.json`: `campaign` first, then `factions`, `locations` (parents before children), `npcs`, `handouts`
   and `adventures` with their `beats`. Use lowercase-kebab `key`s.
3. Add any missing threats (§4) so every `threatId` resolves. Keep each beat within `MAX_ENCOUNTER_ROWS` by using
   `asMob`.
4. Optionally add `characters/NN-<slug>.json`, one per character. The filename prefix sets the order.
5. Run `bun run validate` until it is clean and shows the `pack <name>: …` line.
6. Start `bun run dev:db` and `bun run dev:api`, then `cd apps/api && bun run seed <name> --owner <clerk user id>`. Open the printed `/c/<id>` URL, signed in as that user.
7. After seeding, the GM edits the campaign in the app. Re-seeding creates another campaign; it doesn't update the
   existing one.

---

## 8. Copyright

| Copyrighted | Where |
|---|---|
| The book PDFs | `books/`, gitignored (`*.pdf`); never commit them |
| Stat blocks and ability or rules text | `packages/data/threats/*.json`, `packages/data/wargear/*.json`, `packages/data/creation/**/*.json`, and any rule text in packs and characters |

- Keep the repo **private**.
- Never serve book content without an access token. `GET /api/campaigns/:id/threats` and `/wargear` return 401 unless
  the caller has a seat at that table and 403 for a player.
- Players get a threat's `stats` only after the GM reveals that combatant (`toPlayerView`). They never get NPC
  `statSource`.
- In docs, issues and PRs, show structure or placeholders, never a real stat block.

---

## 9. Creation catalogue

Everything a character is built from, for the character builder (not built yet; nothing serves this data yet). Schemas
are in `packages/shared/src/creation.ts`; the data is `packages/data/creation/<type>/<source>.json`, one array per
file, loaded by `creationCatalogue()` in `index.ts`.

| Type | Record | Holds |
|---|---|---|
| `keywords` | `Keyword` | Faction Keywords by printed name (`"ADEPTUS ASTARTES"`, `"[CHAPTER]"`); a bracketed one names the `placeholder` sub-faction type that fills it |
| `factions` | `Faction` | Adeptus Astartes, Asuryani… |
| `sub-factions` | `SubFaction` | Chapters, Orders, Forge Worlds, Craftworlds…: `type`, `factionId`, the `keyword` it fills in, `traits` (with `geneSeed`) |
| `species` | `Species` | XP, Speed, Size, granted Attributes and Skills, maximums, Species Keywords, abilities, and `countsAs`: the species it also counts as for requirements (Primaris → Adeptus Astartes) |
| `backgrounds` | `BackgroundTable` | Origin / Accomplishment / Goal rows with their `bonus`, and Objectives; owned by a faction, species or sub-faction |
| `option-groups` | `OptionGroup` | Other creation choices: Kroot Mutations, Asuryani Paths, Kin Cloneskein, Apocrypha Homeworlds. `pick` is a count, `"tier"` or `"any"`; `xp` is the cost of the 1st, 2nd… pick, last repeating |
| `archetypes` | `Archetype` | The printed entry: Tier, species, XP, Keywords, Attributes, Skills, abilities, wargear, Influence, suggestions |
| `talents` | `Talent` | `category` talent, faith, exarch, prayer or vow; XP, requirements, effect |
| `packages` | `Package` | Ascension and Advancement Packages |
| `disciplines`, `powers` | `Discipline`, `PsychicPower` | Psychic powers. `tags` are the power's own Keywords (PSYCHIC), not Faction Keywords |
| `patrons` | `Patron` | FSPG Patrons and their Framework options |
| `flavour` | `FlavourTable` | Names, appearance, languages |

**Shared shapes.**
- `Requirement`: `attribute`, `skill`, `influence`, `keyword`, `notKeyword`, `species` (matches `countsAs` too),
  `notSpecies`, `archetype`, `subFaction`,
  `talent`, `power`, `wargear` (printed names), `rank`, `tier`, or `text` for anything that isn't mechanical.
- `XpCost`: a number, `{ perTier }`, `{ base, plus }`, `{ atCreation, later }` (Smite) or `{ text }`.
- `Grant`: what a record gives, `{ talent }`, `{ keyword }`, `{ keywords }` (taken together), `{ power }`,
  `{ wargear }`, `{ text }`, or `{ choose, from, optional }` (`optional`: the character may take none).
- `Rule`: a named ability, verbatim, with `mods` only where the book prints a flat bonus, and `grants`.
- A wargear item keeps its printed `name`; `wargearId` links it once the Wargear catalogue has it.

**Sub-faction keywords** ("SPACE WOLVES") are defined by their `SubFaction` record, not by a keyword record; keyword
records are the glossary Faction Keywords and the `[PLACEHOLDER]`s. A sub-faction's `requires` holds printed
restrictions (Black Templars can't be PSYKER; World Eaters must take KHORNE as their [MARK OF CHAOS]).

**Waves.** `creation/manifest.json` `done` lists the types whose wave is finished. A reference into a type not yet
done is counted as pending, not failed, so data can land wave by wave; once every type is done, validate is strict.

**Transcribing.**
- **One record per thing.** When several books print the same species, archetype or talent, transcribe only the first
  source in `SOURCES` order (VoA, IoE, FSPG, Core, then the homebrew Apocrypha and Necrontyr), and cite the others in
  `note` ("Also Core p.113, 277 XP"). Official always beats homebrew; Apocrypha's `##` entries have FSPG versions.
- **Fill what the newer printing leaves out.** A Species' `keywords`, `grants`, `max` and `size` that the winning
  printing doesn't print are taken from the older one, and the note says so (IoE's Aeldari has Core p.39's Species
  Keywords). Nothing the winner prints is overridden.
- **Keep homebrew extras.** When a losing homebrew printing has rules the winner lacks (Apocrypha gives Mars a trait, Core
  prints none), they are added to the winner with `source` set on each `Rule`, so the builder can hide homebrew.
  Faction `rules` are added by name; `traits` and `abilities` only when the winner has none. Tables whose rows differ
  (the Apocrypha Harlequin and Drukhari backgrounds) are separate records named "… (Apocrypha)".
- **Name the thing, not the heading.** VoA heads Tactical Space Marine "TACTICAL"; the record is `tactical-space-marine`
  so it clashes with, and replaces, the Core printing.
- **Section rules go on every record.** VoA p.45 limits every Talent in its chapter to ADEPTUS ASTARTES, not CHAOS:
  each record carries those requirements and a `note` saying where they come from.
- Copy print errors as printed (`"weapon'sRapid Fire"`, "Psychic Master (Wil)") and note the ones that matter.
- Legacy of the Necrontyr is 1st edition: its archetypes get Core-format XP, as a house ruling written in
  [rules-flow.md](rules-flow.md) §11 when that wave lands.
- `bun run validate` until clean. `creation/manifest.json` lists the expected ids per type and source, taken from each
  book's contents pages, so progress shows.

**Open questions for the GM** (not yet decided; they go in rules-flow.md §11 once decided):

- Two Inheritance of Embers gaps are parked in GitHub issue #2: the missing Anhrathe Goal table (p.14) and the
  unexplained +20 / +30 XP under three Corsair archetypes (pp.54–56).
- Species details still missing: no Size for any Apocrypha species or the Necron.
- Chaos character creation waits for the official Chaos books (GitHub issue #3). Until then Core p.87 "Creating a
  Traitor" stays as rule text on the `chaos` faction, and Apocrypha's Chaos content is transcribed as homebrew.
