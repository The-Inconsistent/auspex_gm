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
| `packages/data/faction-presets/<source>.json` | Printed factions for CODEX › FACTIONS' ADD FROM BOOK (GitHub issue #46), one file per book. Schema `FactionPreset` in `packages/shared/src/faction-presets.ts`: the codex faction (name, `keywords`, `notes`, `secrets`) plus `id`, `source` and printed `page`. GM-only, served by `/api/campaigns/:id/faction-presets` beside the creation catalogue's own factions. Keywords only where the page prints them, or a §11 ruling maps them (rules-flow.md §11.84, §11.85); notes and secrets verbatim |
| `packages/data/npc-presets/<source>.json` | Printed NPCs for CODEX › NPCS' ADD FROM BOOK (GitHub issue #47), in the file of each NPC's first cite. Schema `NpcPreset` in `packages/shared/src/npc-presets.ts`: the codex NPC (name, `role`, `gmNotes`, `secrets`, `attitude`, `statSource`) plus `id`, `cites` (one or more `{ source, page }`) and an optional `faction` name to link. GM-only, served by `/api/campaigns/:id/npc-presets` after the creation catalogue's patrons (cite only: their text runs past GM NOTES' 5,000 characters); a file NPC with a patron's id replaces it and keeps both cites. Players see a revealed NPC's name, role and description, so DESCRIPTION stays empty and printed text goes in GM NOTES; a stat source only where the book names one |
| `packages/data/places/<source>.json` | Printed systems, worlds, sites and rooms for CODEX › LOCATIONS' ADD FROM BOOK (GitHub issue #50). Schema `Place` in `packages/shared/src/places.ts`: `id` (prefixed by the source id), `name`, `parent` (a place earlier in the same file), `source`, `page`, `stats` (a printed stat line, `{ label, value }`), `hooks` (adventure-hook sidebars, `{ title, text }`) and `gm` (the printed description). GM-only: `/api/campaigns/:id/places` sends only `PlaceSummary` (`id`, `name`, `parentId`, `source`, `page`), and `codex.addPlaces` copies the text server-side through `placeNotes` |
| `packages/data/index.ts` | Server-side loaders (below) |
| `packages/data/validate.ts` | `bun run validate` (§6) |

**Loaders** (`index.ts`, exported as `@wg/data`):

| Symbol | Does |
|---|---|
| `threats` | `ReadonlyMap<id, Threat>`. Parses every `threats/*.json` with `Threat.parse` **at import time**, sorted by filename. The api resolves a threat id through `loadThreats` (`apps/api/src/threat/threat.service.ts`), which reads this map plus the campaign's own `custom_threat` rows (issue #43) |
| `packNames()` | Folder names under `packs/` |
| `loadPackRaw(name)` | `pack.json` plus `characters: [...]` from `characters/*.json` (sorted by filename, so `01-`, `02-` prefixes set the order). A missing `characters/` folder is fine. Unparsed |
| `loadPack(name)` | `Pack.parse(loadPackRaw(name))`; throws on a bad pack |
| `wargear`, `wargearList()` | The Wargear catalogue (`wargear/*.json`), parsed at import |
| `rulesList()` | The rules reference (`rules/*.json`) |
| `factionPresetList()` | The printed factions (`faction-presets/*.json`), parsed |
| `npcPresetList()` | The printed NPCs (`npc-presets/*.json`), parsed |
| `placeList()`, `places` | The printed places (`places/*.json`), parsed in file order, and by id |
| `creationCatalogue()` | The creation catalogue (§9): every `creation/<type>/<source>.json`, parsed, one array per type |

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
| `source` | a `SOURCES` book id (`packages/shared/src/source.ts`), or a `THREAT_ONLY_SOURCES` one (`threat-assessment` \| `gutshivas-kommandos`, `threat.ts`, which also holds their cites); default `core` | Book id. Omit for core |
| `page` | positive int | **Printed** page in `source`, not the PDF page |
| `faction` | `imperial` \| `heretic` \| `daemon` \| `ork` \| `aeldari` \| `drukhari` \| `genestealer` \| `necron` \| `tau` \| `mechanicus` \| `votann` | Grouping for the GM picker |
| `threat` | array of `T`/`E`/`A`/`M` or `null`, 4–5 entries | Class at Tier 1..4 (supplements print a Tier 5 column). `null` is a printed "—": no class at that Tier (a follower not yet available); the last Tier is always printed, and `threatClassAt` uses the first printed Tier below it |
| `keywords` | string[], ≥ 1 | As printed, including `<PLACEHOLDER>` keywords |
| `attributes` | `{ S, T, A, I, Wil, Int, Fel }`, ints; `T`, `Wil`, `Fel` may be `null` | `null` = a printed "–": no score, auto-passes those Tests (the High Altar of Technology's Battle-Automata) |
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
| `conviction`, `resolve`, `speed` | int; `conviction`, `resolve` may be `null` | `null` as for `attributes` |
| `size` | `Tiny` \| `Small` \| `Avg` \| `Large` \| `Huge` \| `Gargantuan` | |
| `options[]` | `ThreatOption`, default `[]` | Mob and variant options (below) |
| `mobAbilities[]` | `Ability`, default `[]` | Abilities that apply only while in a Mob |
| `note` | string, optional | A print error copied as printed, or a transcription remark |

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
| `source` | Book id from the enum above; omitted means `core`. A new book goes in `SOURCES` (`source.ts`) first, or in `THREAT_ONLY_SOURCES` (`threat.ts`, with its cite) if it has only threats |
| `page` | Printed page, never the PDF page (see §3 for the offsets) |
| `threat` | 4 letters for core (Tiers 1–4), 5 when the book prints Tier 5. `threatClassAt(t, tier)` picks `threat[min(tier, length) - 1]`, so a 4-letter entry at a Tier 5 campaign uses its Tier 4 class. Class rules: [rules-flow.md](rules-flow.md) §4, Threat classes |
| Weapons | Inside an `ACTION` ability (`{ "type": "ACTION", "weapons": [...] }`, usually no name or text), never loose on the threat. An attack printed under a RUIN or WRATH heading keeps that ability's type (the Tankbusta's Tankhammer, the Clawed Fiend's Tail Spike), so its cost stays visible |
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
| Core rulebook | `core` (places, #50) | `Warhammer 40000 Roleplay Wrath and Glory - Rulebook.pdf` | printed + 1 |
| Threat Assessment | `threat-assessment` (threats; Ruin Actions, #40; faction presets, #46) | `Wrath & Glory_ Threat Assessment.pdf` | printed |
| Gutshiva's Kommandos | `gutshivas-kommandos` (NPC presets, #47; places, #50) | `Wrath & Glory_ Gutshiva’s Kommandos.pdf` (curly apostrophe) | printed |
| Vow of Absolution | `vow-of-absolution` (Frameworks, #45; NPC presets, #47; places, #50) | `Wrath & Glory_ Vow of Absolution.pdf` | printed (checked p.93) |
| Threat Assessment: Daemons & Heretics (Jun 2024 update) | `daemons-and-heretics` (cite D&H; creation, relics, rules, threats) | `Warhammer 40,000_Wrath & Glory_Threat Assessment_ Daemons.pdf` (the second copy with spaces is byte-identical) | printed |
| Forsaken System Player's Guide | `forsaken-system` (creation; faction presets, #46; NPC presets, #47; places, #50) | `Wrath & Glory - Forsaken System Player's Guide.pdf` | printed |
| Aeldari: Inheritance of Embers | `inheritance-of-embers` (creation only) | `Warhammer 40,000_ Wrath and Glory_ Aeldari_ Inheritance of Embers.pdf` | printed |
| An Abundance of Apocrypha v9 (homebrew) | `apocrypha` (creation only) | `Wrath & Glory - An Abundance of Apocrypha v9.pdf` | printed + 3 |
| Legacy of the Necrontyr (homebrew, 1st-edition format) | `legacy-of-the-necrontyr` (creation only) | `Legacy of the Necrontyr.pdf` | no printed pages: cite PDF pages |
| The High Altar of Technology (homebrew Adeptus Mechanicus, 1st-edition format) | `high-altar-of-technology` (threats only, `THREAT_ONLY_SOURCES`) | `The High Altar of Technology.pdf` | no printed pages: cite PDF pages |
| Church of Steel | `church-of-steel` (cite CoS; scene presets, issue #39; vehicles not transcribed) | `Warhammer 40,000_ Wrath & Glory, Church of Steel.pdf` | printed |
| Redacted Records | `redacted-records` (cite RR1; threats, GitHub issue #44; scene presets, #39; creation, #24; Frameworks, #45; faction presets, #46; places, #50) | `Wrath & Glory_ Redacted Records.pdf` | printed (checked pp.27, 35, 70, 71, 75, 83, 90) |
| Redacted Records 2 | `redacted-records-2` (cite RR2; threats, #44; creation, #24; Frameworks, #45; NPC presets, #47; places, #50) | `Warhammer 40k_ Wrath & Glory Redacted Records 2.pdf` | printed (checked pp.3, 41, 42, 60) |
| Darktide (Apr 2025 update) | `darktide` (threats, #44; scene presets, #39; NPC presets, #47; places, #50) | `Warhammer 40,000 Roleplay_ Wrath & Glory – Darktide.pdf` (en dash) | printed (checked pp.61, 75) |
| Litanies of the Lost | `litanies-of-the-lost` (cite Litanies; threats, #44; scene presets, #39; Frameworks, #45; faction presets, #46; NPC presets, #47; places, #50) | `Wrath and Glory_ Litanies of the Lost.pdf` | printed (checked pp.34, 73, 77) |
| Wretches of the Writ | `wretches-of-the-writ` (cite Wretches; threats, #44; NPC presets, #47; places, #50) | `Wrath & Glory, Nemesis - Wretches of the Writ.pdf` | printed (checked pp.6, 27) |
| Bloody Gates | `bloody-gates` (cite BG; threats, #44; Ruin and Glory lists, #40; Frameworks, #45) | `Wrath & Glory_ Bloody Gates.pdf` | printed (checked pp.5, 24, 25) |
| Affliction Ascendant | `affliction-ascendant` (cite AA; threats, #44; Ruin and Glory lists, #40) | `Wrath & Glory_ Affliction Ascendant.pdf` | printed (checked pp.21, 22) |

**`custom` is not a book.** A stat block the GM writes or clones (issue #43) carries `source: "custom"` (cite
`Custom`), lives in that campaign's `custom_threat` rows and has no page, so it gets no row in this table: `BOOKS` is
typed over `BookThreatSource` (every source but `custom`), which keeps it out of `BookSource`, the Books tab and the
`book:*` relay by construction. `validate` refuses a `threats/*.json` whose source is `custom` or whose id starts with
`custom-`, so a file can never shadow one a GM wrote. Anything that shows a source beside a threat reads `sourceName()`.

The seven books added for the bestiary (GitHub issue #44) sit in `SOURCES`, not `THREAT_ONLY_SOURCES`: each also holds
scene, item, NPC or location data that other work types as `Source`. Church of Steel joins them for its scene presets (issue #39).

No creation content: Darktide, Litanies of the Lost, Bloody Gates and Affliction Ascendant (official adventures;
Affliction Ascendant's psyker rule p.5 and Rites of Battle p.23 are mission-only), Church of Steel (travel and vehicles),
`Wrath Glory Condensed Rules.docx.pdf` (fan quick-reference). The creation `source` ids are `SOURCES` in
`packages/shared/src/creation.ts`, separate from `Threat.source` and `WargearSource`.

**Daemons book:**
- The offset was checked on PDF pages 15, 41, 75, 101 and 125, where the folio (bottom right, odd pages only) matches
  the PDF page. Even and full-art pages have no folio.
- This PDF has **no text layer**. `pdftotext` returns nothing and `pdffonts` lists no fonts, so work from page images
  only (§4).
- Its 59 threats are in (`dh-*`, §4). The vehicles (the Seeker Chariots and Hellflayer pp.96–97, the Engines of Chaos
  pp.107–111) use Church of Steel's format and wait with it.

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

### The High Altar of Technology transcription notes

12 homebrew Adeptus Mechanicus threats (`hat-*`, PDF pp.21–35, "Legions of the Omnissiah" plus the Kastelan Robot).
The book uses the 1st-edition stat layout, mapped as follows:
- **Page** is the PDF page of the heading (the book has no folios); a block that runs on says so in `note`.
- **Threat Classification** prose ("Adversary for Tiers 1-2, Elites for tiers 3+") → 5 letters.
- **Intellect** → `Int`. **Soak** has no 2nd-edition field, so it is appended to the Resilience note ("Battle Plate
  5; Soak 6"). **Passive Awareness** → an `Awareness` skill rolling the Default pool (an unlisted skill rolls Default,
  Core p.324), with the printed Passive.
- **Weapons:** one Range value (`[48]`), as the Necrontyr wargear; "Range 2m (M)" melee → `[2]`.
- **Loadout choices** ("Choose one of the four profiles") → an untyped "Attacks" ability with the printed sentence,
  and one `variant` per loadout, with no base ACTION unless a default is named (the Dominus's Omnissian Axe).
- **Sidebars:** Skitarii Alphas and Special Weapons (p.30) on both Ranger and Vanguard; Sicaran Princeps (p.31) on
  both Sicarans. Their stat changes live in the option text.
- **Kastelan "--"** Toughness, Willpower, Fellowship, Resolve and Conviction → `null` (Battle-Automata auto-passes).
  Its table keywords (ROBOT) differ from the text's (BATTLE-AUTOMATA); the table is kept, both in `note`.
- **Kept as printed:** "Sicaran" for Sicarian (ids `hat-sicaran-*`), "Chorclaw", "Blast(Medium)", Kataphron's Iron
  Soul "Conviction tests". Named with no printed profile: Arc Rifle, Plasma Caliver, Transuranic Arquebus.
- **Not transcribed:** the vehicle-format walkers (Ballistarii, Sydonian Dragoon, Onager Dunecrawler, pp.20–21), the
  wargear, Forge Worlds and archetypes.

### Supplement and adventure book notes (GitHub issue #44)

Every stat block in eight books, 88 threats, each book's id prefix on its ids (`threat-manifest.json` lists them). PDF
page = printed page in all eight. An identical reprint of a threat already in is skipped (rules-flow.md §11.71). Shared
calls, user rulings of 2026-10-02:
- **A melee weapon with no printed range** is `[1]`, as Core's Painboy 'Urty Syringe. An explosion or discharge with
  no range (Kastelan Explodes, the Duke's Noxious Discharge, the Oily Squig, Ara'vitu'urhal's Warp Explosion) stays
  ability text, as Core's Killa Kan. A single printed range (Botuthrax's Pestilent Tide, "Range 16") is `[16]`.
- **Strength printed with Powered in brackets** ("5 (8)", "5(9)*") stores the armoured value, since Core prints one
  armoured Strength (the Chaos Space Marine's 8). The printed pair is in `note`.
- **A Champion bonus under another name** (Botuthrax's Beloved of Nurgle, "has 5 personal Ruin") sets `personalRuin`.
- **Inflict spelling** is the catalogue's `Inflict (Poisoned 5)`, whatever the print's order ("Inflict Poisoned (5)").
- **No Tier row** (Bloody Gates, and 31 blocks in the three adventure books below): the class is proposed and the
  note says so (rules-flow.md §11.70). A Champion is A only from 7 Wounds up, otherwise E (Bloody Gates' Cravax). The
  GM confirmed every class listed here.
- **Faction by keyword:** a beast takes the faction of whoever it lives among (Darktide's hive fauna are `imperial`,
  as Apocrypha's Fenrisian Wolf); a SCUM ganger with no ADEPTUS MECHANICUS keyword is `imperial`; a block printing
  ADEPTUS MECHANICUS beside CHAOS or HERETIC is `heretic`.
- **Homebrew namesakes:** an official block that shares a name with a homebrew one (`apoc-*`, `hat-*`) is transcribed
  beside it, and its note says so.

Per book:
- **Vow of Absolution** (`voa-`, 7): the Dreadnought and Redemptor Dreadnought (p.76) use the normal threat block, not
  the vehicle format. Kill Team Righteous Will (pp.114–118) prints Talents and Equipment but no weapon profiles and no
  Default pool: each list is an untyped ability, `skills.default` is `null`. Hofniel's Tier row (A E T T T) differs
  from his squad's (A A E E T). Kept as printed: Marmaroth's 6 Wounds (his squad has 11–12), the garbled Honour the
  Chapter text, the Heavy Bolter's "Ap -1". "ABSOLVERS CHAPTER" is one keyword. All `imperial`.
- **Redacted Records 2** (`rr2-`, 7): the six expected plus an Oily Squig Mob (p.88). The Kastelan (p.53) is its own
  official printing beside the homebrew `hat-kastelan-robot`. Neither Cybercanid prints a Default pool (`null`). Magos
  Luxus prints NECRON among its keywords and stays `mechanicus`; the Duke of Putrescence is `heretic`.
- **Wretches of the Writ** (`wretches-`, 7): Lord Maloquence prints 5 Tiers, the rest 4. Kept as printed: the heading
  "VERIT MAAAZITOR" (the text says Maalazitor; id from the heading), "ARA'VITU'URHAL" (text: Aru'vitu'urhal), Brother
  Iscarius's Veteran of the Long War printed twice, possessives without apostrophes, "Inflicts (On Fire)", the
  Changeling's DN-less "DN Targets Willpower". Ara'vitu'urhal and the Changeling are `daemon`, the rest `heretic`.
  The end-of-adventure forms (the Greater Daemon, Maloquence the Terrible) print no stat block.
- **Bloody Gates** (`bg-`, 7): no Tier row anywhere (rules-flow.md §11.70): Commissar Shrake A, Cravax the Claw E,
  the five rank-and-file T. The Traitor Militia Sniper sidebar is a `variant` (its Long Las "Reliable3" is stored
  `Reliable`). Its Poxwalker (p.25) is Core's `poxwalker` exactly, so it isn't transcribed; `bg-cultist` differs from
  `cultist` (SCUM, Cunning) and is.
- **Affliction Ascendant** (`aa-`, 2): Botuthrax Clostidia (`daemon`) and Putradyne Corporis (`heretic`). The
  asterisks on Putradyne's "5(9)*" and "Powered 4*" have no footnote. The door on p.10 ("Resilience of 12") is scenery.
- **Redacted Records** (`rr1-`, 16, pp.16–92; p.55 holds two): no Tier row on Psychneuein and the three Slaughter
  Servitors (all proposed E: 5–8 Wounds, no Champion bonus, and the Servitors print no Shock). The Order of the Throne
  Knight Paladin (p.84) is in the normal threat format, so it's in (Gargantuan, M M M A). Psychneuein (XENOS, CHAOS) is
  `heretic`, for want of a beast or xenos faction. Sidebars kept as `variant`: Broken Wheel Complications (Sundered Wheel
  Cultist), A Thousand-Thousand Charms (Heralds, printed p.84, block p.83). The Escutcheon Assassin's Defence "3 (4
  Parry)" stores 3. Kept as printed: Jacobin Grizari's Cunning "1-0" (stored 10), the Knight's Ion Shield "3* AR" (no
  footnote), the Duelling Las's "Salvo 0", "Weapons Skill" and "Psychic Master" as skill names, the Corrupted Scribes'
  Feeble Hands with no dice ("1 +1 ED"). p.35 is rules text.
- **Darktide** (`darktide-`, 17, pp.31–101; p.67, p.75 and p.101 hold two): Tier rows run 4 or 5 letters, as printed;
  Gerta Phleg, Cjarl Nefft, Primilla van Grellick and Magos Momentine print none (proposed E). The Daemonhost (p.61)
  sits beside homebrew `apoc-daemonhost`. Valgaren prints no DETERMINATION line; his Bile Spray and Suffocating Mass have
  no range and stay RUIN text. Navigator Mazara's Strength "2 (3)" stores 3. Kept as printed: "Angonising" (Daemonhost),
  Valgaren's "page 109" for the Nurglings and Rot Flies (they're on p.101), the Lattice Springer's "Inflict (Poisoned)"
  with no value, the Meltagun's "Melta" trait. Core has no Nurglings block, so `darktide-nurglings` is the only one.
- **Litanies of the Lost** (`litanies-`, 25: Grim Harvest's stat blocks pp.34–38, then p.67, pp.77–95 and the Stat
  Blocks section pp.134–137): only the Skitarii Ranger (p.77) and the Tech-Ganger (p.79) print a Tier row. Of the
  other 23, A: Kaptin Slystabba, the Fulgurite Electro-Priest, Lin and Roco, Ruststalker Marech, the Entombed Champion
  and the Clawed Fiend (10 Wounds, Large); T: the Zealot, Tech-Adept, Wych, Kabalite Warrior, Pakthertius Servitor and
  Censer Cherub; E: the rest, including the five Champions under 7 Wounds (Acolyte Lockson, Corsair Baron Kasque, Mek
  Fastdakka, the Succubus, the Aeldari Ranger). Beside homebrew namesakes:
  `litanies-skitarii-ranger`, `-fulgurite-electro-priest`, `-kataphron-battle-servitor` (`hat-*`) and
  `-cyber-mastiff` (`apoc-cyber-mastiff`). The Medicae, Warden, Fabrication and Decommissioned Servitors (p.134) print no
  Attributes, so they're `variant` options on the Pakthertius Servitor, with the Tough and Strong Servitors sidebar. Lin
  and Roco share one profile (SCUM, ABHUMAN: `imperial`). Kept as printed: the Skitarii Ranger's Wounds "3 (6)" (stored
  3, the 6 unexplained), "Skirarii Auto-Cuirass", Slystabba's "Intimidation (5)" (stored as dice) and "Slystaba", the
  Electro-Priest's "*7" and "AR *2" (no footnote), the Kataphron's square-bracketed traits (stored round), the Ogryn
  Loader's death explosion (ANNIHILATION text). Shootas and the Heavy Arc Rifle print no Salvo, so it's omitted. The
  "Resilience" hits on pp.55, 62, 122 and 128 are scenery.

### Threat Assessment transcription notes (GitHub issue #44)

Every stat block in the book, 133 threats: Aeldari 31 (pp.27–57), Drukhari 18 (pp.63–77), Orks 24 (pp.82–103; 8 were
in before), Genestealer Cults 19 (pp.108–130), Necrons 23 (pp.136–157, in before), T'au 18 (pp.164–186). Every block
prints five Tier letters (p.5). The Devilfish (p.187) is a vehicle and waits for vehicle rules.
- **Ids:** a plain slug (`dire-avenger`); `ta-` when Core already has the name. Every Core namesake differs, so all are
  in: `ta-guardian-defender`, `ta-ranger`, `ta-wraithguard`, `ta-painboy`, `ta-killa-kan`, `ta-patriarch`, `ta-magus`,
  `ta-acolyte-hybrid`, `ta-neophyte-hybrid`, `ta-purestrain-genestealer` (the last two differ from Core only in the
  Tier 5 letter, name and keywords, which counts under rules-flow.md §11.72). `succubus`, `wych`, `kabalite-warrior`
  and `clawed-fiend` sit beside Litanies of the Lost's printings, `felarch` beside Core's Corsair Felarch sidebar.
- **Stray digits, kept as printed** (the note gives the likely reading): the Archon's Leadership 102, the Sslyth's
  Awareness 86 and Ballistic Skill 84, the Scourge's Weapon Skill 48, the Hellglaive's "+64 ED", the Agoniser's
  "Poisoned 35", the Scissorhand's "Poisoned 14", the Incubi's 12 personal Ruin, the Wrack's "52d6" and the Razorwing
  Flock's "13d6" Determination, the Meganob's "Passive 21", the Mek's Choppa "87", the Deff Dread Klaw's "Range 21",
  the Morkanaut's "Blast (150)", the Gorkanaut's "124d6", the Primus's Awareness 18 (Passive 4), the Alchemicus
  Familiar's "AP -22", the Autarch's Dragon Fusion Gun "186" and Starshot "+26 ED", the Warlock's "+21" Conceal.
- **Text copied from another block:** the Wraithlord prints the Wraithguard's bonuses and weapons; the Wayseeker's Ruin
  line is the Soul Weaver's; Battle Focus names the wrong unit on the Storm Guardian, Shadow Spectre and Starstorm
  Duellist; the Morkanaut's Big 'n' Stompy says "Gorkanaut".
- **Missing values:** the Warboss's Ballistic Skill (no dice), the Sanctus's DETERMINATION line, the Acolyte Hybrid's
  Blasting Charge and Frag Grenade (printed "Text"), the Jackal Alphus's Blasting Charge (cut off), Harlequin's Embrace
  (cut off at the page end). Drones print no Determination.
- **Other oddities kept:** the Farseer's Witchblade "Wary Weapon"; the Haywire Grenade's "Can only target vehicles"
  as a trait; "DAEMON MONSTER" as one keyword (Avatar of Khaine); the Corsair Prince's Craftworld keywords; Knarlocs'
  Loping Stride "Speed 14" against Speed 7; the Mandrake's empty trait (dropped).
- **Calls:** a speed printed with "(Fly)" or "(May not Run or Sprint)" stores the number, the rest in a bonus or note
  (as `ta-big-mek`). A Jackal's mounted Defence and Speed live in `note`. A weapon with melee and thrown profiles (the
  Squighogs' Stikka) is two weapons. The Morkanaut's Mega-Zappa ED "2d   3" is read `2d3`. Exarch, Shas'ui, Leader and
  Options sidebars are `variant`s; Mob swaps are `mob` options. Psychic powers (Farseer, Warlock, Weirdboy, Magus,
  Patriarch) are ability text, and p.111's Broodmind Discipline holds powers only. All Kroot and Vespid are `tau`,
  Harlequins and Corsairs `aeldari`, every Drukhari beast `drukhari`.

### Threat Assessment: Daemons & Heretics transcription notes (GitHub issue #44)

Every stat block in the book, 59 threats with the `dh-` prefix, read from page images (no text layer): Mortal Pawns 9
(pp.20–30; Onoros the Siren is the p.20 sidebar's block), Heretic Astartes 11 (pp.35–46), Tzeentch 9 (pp.51–59),
Nurgle 10 (pp.64–73), Khorne 10 (pp.78–87), Slaanesh 10 (pp.92–102). Every block prints five Tier letters. The Seeker
Chariot, Exalted Seeker Chariot, Hellflayer (pp.96–97) and the Engines of Chaos (pp.107–111) are vehicles; the relic
pages (pp.60–61, 74–75, 88–89, 103–104) and p.37's Chaos Terminator Armour table aren't threats.
- **Reprints, all different from the printing already in:** `dh-cultist` (Core and Bloody Gates), `dh-mutant`,
  `dh-chaos-spawn` (a wholly different profile), `dh-plaguebearer`, `dh-poxwalker`, `dh-plague-marine` (Core's is an
  option on `chaos-space-marine`), `dh-pink-horror`, `dh-daemonette`, `dh-bloodletter` (only its Tier row differs,
  rules-flow.md §11.72), `dh-nurgling` and `dh-rot-fly` (Darktide), `dh-the-changeling` (Wretches of the Writ).
  `dh-rubric-marine` sits beside homebrew `apoc-rubric-marine`.
- **Options, not files:** the Blue and Brimstone Horrors on `dh-pink-horror` (as Core), the Exalted Flamer, the
  Aspiring Champion and the Havocs sidebar on `dh-legionary`, the Chosen and Raptor Champions, the Blood Legions on the
  Bloodthirster, the Lord of Skulls Options, the Legions of Excess on the Keeper of Secrets.
- **Faction by keyword:** a block printing DAEMON is `daemon`, including the Warp Talon, Obliterator, Possessed and
  Poxwalker; Heretic Astartes, Plague, Rubric and Noise Marines, Berzerkers and mortals are `heretic`.
- **Kept as printed:** the keyword "PSKYER" (the Tzeentch daemons, the Great Unclean One); the traits "Superchange",
  "Unweildy (2)", "Rend (1)", "Rend (2)" and "Warp"; "Intimitation"; "Weapons Skill" (Plaguebearer); the Bilepiper's
  Weapon Skill printed twice; "Mark of Chaos(KHORNE)"; the Poxwalker's "Inflicts (Poison 3)", as Core's.
- **Calls:** the Contorted Epitome's 3 personal Ruin is shared with its riders (note). The Doomsiren's Salvo "1d6"
  can't be an int, so it's in the Mob option text. The Steed of Slaanesh takes its block title (the heading says
  "Seeker"). A "(Fly)" or "(Flying)" speed keeps the number. Greater Daemons' "Daemon Lord" and "Entrusted by" bonuses
  set `personalRuin` (5).

---

## 5. Content packs

### `Pack` (`packages/shared/src/pack.ts`)

The entry shapes reuse `CodexInput` from `packages/shared/src/codex.ts`. The server-owned uuid fields are replaced by
`key` references. Every `key` matches `^[a-z0-9-]+$`.

| Field | Shape | Notes |
|---|---|---|
| `campaign` | `{ name (1–100), tier (1–5), framework? (≤ 5000), patron? (≤ 200), homebrew? (false) }` | `homebrew`: the builds may use the homebrew books |
| `factions[]` | `CodexInput.faction` + `key` | `name`, `keywords[]` (≤ 20), `stance` (`ally`/`neutral`/`rival`/`enemy`), `notes`, `secrets` |
| `locations[]` | `CodexInput.location`, with `parent?: key` in place of `parentId` | `name`, `description`, `gmNotes`, `hazards`, `revealed` |
| `threats[]` | `Threat` without `id`, `source` and `page` (what `threat.save` takes), at most 100 | The pack's own stat blocks (issue #43). `seed.ts` saves them before the NPCs and beats, which name one as `custom-<slug>` where the slug comes from the name |
| `npcs[]` | `CodexInput.npc`, with `faction?: key` in place of `factionId` | `name`, `role`, `description`, `gmNotes`, `secrets`, `attitude` (`hostile` … `helpful`, Core p.168), `statSource`, `revealed` |
| `handouts[]` | `CodexInput.handout` + `key` | `title`, `body` (≤ 20000), `revealed` |
| `adventures[]` | `CodexInput.adventure` + `key` + `beats[]` | `title`, `premise`, `status` (`planned`/`running`/`done`) |
| `adventures[].beats[]` | `CodexInput.beat` with `location?: key`, `npcs: key[]`, `handouts: key[]` in place of the id fields | `title`, `type`, `status`, `readAloud`, `gmNotes`, `outcome`, `encounter[]`, `hazards[]` (picks by the entry `id` in its location's `hazardList`; one that isn't there is dropped on save). Beats have no key; their order is their array order |
| `characters[]` | `{ name (1–100), stats: CharacterStats, detail?, objectives?, build?: CharacterBuild }` | Filled from `characters/*.json` by the loader; don't put it in `pack.json`. `stats` is the sheet as printed; `build` is how it was made, so the builder opens it filled in (`packages/data/build.test.ts` checks one against the other) |

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
| `encounter[].threatId`, `npcs[].statSource.threatId` | A threat id. `validate.ts` checks this against the loaded threats plus the pack's own `threats` (issue #43); the schema doesn't |

### Prepared encounters (`EncounterEntry`, `codex.ts`)

| Field | Type | Meaning |
|---|---|---|
| `threatId` | string | A `threats/*.json` id |
| `count` | int 1–500, default 1 | How many |
| `asMob` | bool, default false | With `count > 1`: one Mob combatant of `count` members. Otherwise: `count` separate combatants, labelled `<label> 1..n` |
| `marker` | `red` \| `amber` \| `green` \| `blue` \| `purple` \| `white`, optional | Colour of the physical mini's tag or base |
| `label` | string ≤ 100, optional | Tracker label; default is the threat name (Mob: `Name ×N`) |
| `profiles` | `ProfileId[]` (at most 3), default `[]` | Tier 5 Threat Profiles applied to the stat block before the snapshot: `heretical-strength`, `xenos-cunning`, `enemy-within` (VoA p.126). They stack (rules-flow §11.104) |
| `scale` | bool, default false | Scaling Threats (Core p.326): + Tier on an Elite's Wounds and Shock, + Agents + Tier on an Adversary's or Monstrous Creature's. Nothing on a Troop or a Mob (§11.107) |

A beat allows at most 30 entries and **`MAX_ENCOUNTER_ROWS` = 60 combatant rows**. A Mob counts as 1 row; any other
entry counts as `count` rows. This is an app limit, not a rule: it bounds the inserts one `beat.startEncounter` runs
in a transaction. Group large counts as Mobs. The API doesn't check whether a threat prints a Mob option when you
set `asMob`. `beat.startEncounter` adds every active Agent (`claimedCharacterIds`), then the entries in order, and
sets the beat to `active`.

`profiles` and `scale` are the GM's two levers on a prepared fight, applied by `prepareThreat`
(`packages/shared/src/threat-scale.ts`) as the stat block is snapshotted, each appending a BONUSES line that says
what moved. They change no data file: the bestiary is one shared in-process `Map`. Neither changes the class, which
is always `threatClassAt` on the printed block (Core p.323).

### NPC `statSource` (`StatSource`, `codex.ts`)

| `kind` | Extra field | Meaning |
|---|---|---|
| `bestiary` | `threatId` | Uses a threat file's stat block, or one of the campaign's own (`custom-<slug>`, issue #43) |
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
   1. `campaign.update` (framework, patron, homebrew)
   2. `codex.save` for factions, then locations, NPCs and handouts
   3. each adventure, then its beats
   4. `character.create` for each character, then, when it has a `build`, `character.build` with `keepSheet`: the
      server derives the sheet but keeps the printed armour and gear lines and the Wealth (issue #18); the weapons are
      the build's, plus a printed one the build has none of by name (`keepSheetWeapons`, rules-flow.md §11.68)
4. It prints counts and the table URL `/c/<campaignId>`, which the `--owner` user opens signed in.

There is no SQL: every row goes through `authorize` → `applyAction`, the same validation and campaign scoping as
live play ([backend.md](backend.md)). Each run creates a **new** campaign, and a failure part-way leaves a partial
campaign behind. An unknown `threatId` in a beat is only caught by validate or by `beat.startEncounter`, not by
`codex.save`.

### Wargear catalogue (`packages/data/wargear/*.json`, `Wargear` in `packages/shared/src/wargear.ts`)

The Core Wargear chapter (printed pp.211–247), Vow of Absolution's Call to Arms (pp.59–75) and the Forsaken System
Player's Guide armoury (pp.120–128) and Inheritance of Embers' Armoury (pp.77–99), plus the homebrew Legacy of the
Necrontyr's Vaults of the Tomb Lords (PDF pp.10–13) and An Abundance of Apocrypha's Chapter IV (printed pp.326–482),
and the relics of Threat Assessment: Daemons & Heretics, one JSON array per section, for the GM's requisition form. 1,228
entries:
- Core (219): `melee` (33, pp.211–213), `ranged` (44, pp.217–219), `ranged-xenos-grenades` (21, pp.220–221, 226),
  `upgrades-ammo` (26, pp.227–230), `armour` (28, p.233), `equipment` (41, pp.236–241), `augmetics` (26, pp.243–247).
- Daemons & Heretics (26, ids prefixed `dh-`): `dh-relics`: Chaos Terminator Armour (p.37) and the Relics of Tzeentch
  (pp.60–61), Nurgle (pp.74–75), Khorne (pp.88–89) and Slaanesh (pp.103–104). Every relic is Unique. "Must have the Mark
  of X" is a keyword requirement on the god, and "Psyker" is PSYKER. A relic only a named daemon may carry (Skullreaver:
  "Only a Bloodthirster") needs DAEMON plus a `gm` requirement. The Terminator armour's printed "Chaos[Legion], Mark of
  Chaos" is split into CHAOS, [LEGION] and [MARK OF CHAOS]. Soulbane prints a melee and a pistol profile, so it is two
  entries. A'rgath, which takes the form of any bladed weapon, has no `weapon`. Armour of Scorn's Invulnerable applies
  only below 14 base Damage, so `invulnerable` is false and the condition is in `effect`.
- VoA (58, ids prefixed `voa-`): `voa-weapons` (37, tables on pp.62 and 67), `voa-upgrades-armour` (14, pp.68 and 73),
  `voa-equipment` (7, pp.74–75).
- FSPG (45, ids prefixed `fspg-`): `fspg-weapons` (23, pp.121–124), `fspg-armour-gear` (22, pp.125–128).
- IoE (154, ids prefixed `ioe-`): `ioe-ranged` (47, pp.79–85), `ioe-melee` (67: melee, grenades, armour and shield
  generators, pp.86–93), `ioe-gear` (40: helms and masks, upgrades and equipment, drugs, pp.93–99).
- Necrontyr (26, ids prefixed `necron-`, `page` is the PDF page): `necron` (ranged, melee, armour, wargear).
- Apocrypha (700, ids prefixed `apoc-`): `apoc-melee` (120, pp.329–345), `apoc-ranged` (200, pp.346–377),
  `apoc-ranged-upgrades` (100: T'au and Votann ranged, upgrades, ammunition, Drukhari poisons, pp.378–395),
  `apoc-armour` (85, pp.396–418), `apoc-equipment` (154: tools, drugs, faction equipment, augmetics, pp.419–455),
  `apoc-followers` (41 `follower` entries, pp.456–482; their 30 stat blocks are `threats/apoc-*.json`). Vehicles
  (pp.483–495) wait for *Church of Steel*, whose rules they use.
- IoE reprints of Core's Aeldari-only items supersede them (rules-flow.md §11.46); Core's entry stays, and its `note`
  names the IoE id.
- Names printed in both books (Bolt Rifle, Heavy Bolter…) are different profiles; the form lists them with their cite.

| Field | Notes |
|---|---|
| `id`, `name`, `source`, `page`, `category` | `source` is a `SOURCES` book id (`source.ts`); `id` is unique across all files; `page` is printed; `category` is the table heading |
| `kind` | `weapon`, `grenade` (Grenades and Missiles: requisitioned like Ammo, p.229), `armour`, `equipment`, `upgrade`, `ammo`, `augmetic`, `follower` (a companion, servo-skull or drone bought as Wargear) |
| `value`, `rarity` | As printed; `null` when none is printed (Clothing's "Variable" Rarity; the Arm Weapon Implant's "3 + Weapon Value") |
| `keywords` | Upper case, `[ANY]` kept |
| `weapon` | `Weapon` minus `name`, plus `addStrength` and `thrown` (the N of "S × N", p.207). A knife has both a melee `range` and `thrown` |
| `armour` | `{ ar, invulnerable, powered, traits }` |
| `effect` | Rules text only (the Effect line); no flavour |
| `requires` | Who may buy or install it, a `Requirement[]` structured from a printed "Requirements:" line (the line stays in `effect`) |
| `upgrade` | Every `kind: "upgrade"` entry has one, and no other kind may (`validate.ts`): `{ slot, fits, mods, exempt, copies, slotOn, gmOnly }`, below |
| `threatId`, `variant` | A `follower`'s bestiary stat block (required), and which of its `variant` options it is when the book prints one profile with variants (the T'au Drones, Apocrypha p.479). Only followers have them |
| `note` | Print errors copied as printed, and transcription calls |

**Upgrades** (Core pp.227–228; rulings rules-flow.md §11.63–§11.65). An item takes at most three, one per type
(`MAX_UPGRADES`, p.227):

| `upgrade` field | Notes |
|---|---|
| `slot` | One of `UPGRADE_SLOTS`: `sight`, `grip`, `muzzle`, `magazine`, `bayonet`, `attachment`, `mount`, `core`, `craft`, `coating`, and armour's `crest`, `plate`, `system`. The book names only grips and scopes, so the vocabulary is the house call in §11.64; one upgrade per slot per item |
| `fits` | The printed compatibility line as a `WargearFilter` (`upgradeRefusal` refuses a bad fit). Filter fields added for it: `allKeywords` (has all of these; `wargearKeywords` is any-of), `weaponTraits` (has any of these Traits, by name without rating), `notWeaponTraits` (has none of these) |
| `mods` | What the fitted profile shows, `UpgradeMod[]` by `kind`: `trait` (`traitId`, `rating?`), `removeTrait`, `traitRating` (`traitId`, `delta`: moves a rating the weapon already has, no-op without the Trait), `damage`, `ed`, `ap`, `salvo` (each `delta`), `range` (`multiply`, `delta`, or `bands: [short, medium, long]` added band by band), `ar` (armour only), `bonusDice` (`dice`, `when`: shown, not rolled), `gm` (`what`) |
| `exempt` | `"max"`: doesn't count toward the three (Distinction, p.228). `"slot"`: shares its slot without taking it (Support System, §11.64) |
| `copies` | The upgrade's own printed limit, e.g. "up to 3 times" (IoE p.96) |
| `slotOn` | A slot per host, for the one entry that is a different type on each: the Suspensor Crystal is `mount` on a weapon and `system` in armour (IoE p.95, §11.64). `validate.ts` refuses a host that isn't in `fits.kinds` |
| `gmOnly` | Off a player's fit picker, for an upgrade `fits` can't describe: Matched Pair reads on two weapons at once, so the GM fits it and polices the pairing (Apocrypha p.388, §11.64) |

A `gm` mod is prose the GM applies at the table: whatever a profile can't hold (an Action, a Glory spend, a Test) stays
in `effect` and takes one, so nothing is dropped. `validate.ts` also checks that every mod `traitId` resolves in the
rules reference (weapon or armour traits). A stored weapon — and the sheet's armour, which carries the same three fields — keeps its printed profile plus `upgrades` (ids fitted in the
build) and `fitted` (ids fitted in play); `withUpgrades` derives the shown profile on read (`toCharacter` in
`apps/api/src/table/table.state.ts`), so a data fix reaches existing characters. `withWeaponEffects` then applies the
build's standing weapon effects (`stats.weaponEffects`, rules-flow.md §11.68) with the same mods, at the Rank now.

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
- **FSPG** prints Rarity as a number, read as its DN penalty (rules-flow.md §11.44); each `note` keeps the printed
  number. Keyword print errors: missing commas split (Blessed Blade, Brazier of Holy Fire, Simulacrum Imperialis…), and
  "ADEPTUS, MECHANICUS" (Flechette Blaster, Macrostubber, Phosphor Serpenta, Stubcarbine) merged into ADEPTUS
  MECHANICUS so the Keyword matches. Kept as printed: "Excrutiator", "B.O.N.E", "MILITARUM AUXILLA", "2 HANDED", and the
  Eradication Ray's KROOT keywords. The Kroot Rifle and the Ripper Gun's bayonet print two profiles, so each is two
  entries, and a starting "Kroot Rifle" or "Ripper Gun (with bayonet)" is a `bundle` of both. Its Mk X Phobos Power
  Armour (p.125) reprints VoA's without the +1 M, +2 Stealth, so only VoA's is kept. The Grapnel Launcher and Narthecium
  differ from VoA's and are kept. The Condemnor Boltgun and Bolt Carbine are described on p.122 but have no printed
  profile, so no entries. Not entries: the Hearing Range sidebar (p.126) and the p.119 species rules for Kroot and
  Ogryn weapons and abhuman armour Rarity.
- **IoE:** the Avenger Shuriken Catapult's name is split over three table rows (p.81), and the first two repeat the
  Bright Lance and Hawk's Talon profiles, so its one entry is the "Catapult" row. Ranger Long Rifle and Hexrifle print
  range 18/26/54, the Vibro-Cannon a Long range of 65 and "Blast 10", the Shredder "Blast (6, Inflict (Restrained)":
  kept as printed. The Void Sabre, Witchblade and other p.89 rows print flat Damage, unlike Core's S + X. The Cameleoline
  Cloak's "ANY" is stored as [ANY]. Two-profile items are one entry per profile (Aeldari Missile Launcher, Reaper
  Launcher, Razorflail); Rangefinder and Spirit Stone print two prices, so two entries each. Star Glaive and Wireweave
  Net are described with no table row (null Value and Rarity). Not entries: the War Mask sidebar (p.93, a `mundane`
  item), The Grey Between and the lore Test (pp.77–78, requisition rules), The Art of the Knife (p.86, in the Knife's
  `effect`).
- **Necrontyr** uses the 1st-edition format: one Range value (`range: [48]`), flat melee Damage ("5+1ED"), "Heavy"
  with no rating, and the Force Shield armour trait, which no book here defines. Its rule that Necron items count as
  Unique for other races is in every entry's `note`. The Rod of Covenant and Staff of Light print shooting and melee
  profiles, so two entries each, and a starting one is a `bundle` of both.
- **Apocrypha** is homebrew: an item it reprints with the same stats as an official entry is left out, and one with
  different stats is kept, its `note` naming the official id. Where its summary tables (pp.386, 396–398, 419, 434…)
  and an item's own description disagree, the description wins and the table's values are in `note`, except where
  the description is plainly copied from a neighbour (Daemonic Rune, Haemonculus' Tools). Keywords get a straight
  apostrophe (T'AU EMPIRE, as the glossary). A second profile printed only in a description ("Ranged:" on the
  Guardian Spear, "Melee:" on the Boltstorm Gauntlet…) is its own entry with no Value or Rarity; a starting one is a
  `bundle` with its base. Two traits keep a book's variant spelling ("Agonizing", "Warp Weapon"), and "Bulky (1)".
  Section rules (Nurgle's Rot, Combat Drugs, Dark Gifts, Special Issue Grenades…) open each affected item's `effect`.
  Not entries: the Optional Rules: Adjusted Core Weapon Traits (p.328), the T'au BATTLESUIT, SUPPORT SYSTEM and JUMP
  JETS keyword rules (p.414), the Astartes armour swaps and RELIC rule (p.401), and the follower rules (p.456).
- **Not entries:** Weapon Patterns (p.225, a variant rule), Ammo in the Gilead System (p.230), Augmetic Installation and
  Reconstruction rules (pp.242–243), Trinkets & Charms tables (pp.247–251).

### Rules reference (`packages/data/rules/*.json`, `RuleEntry` in `packages/shared/src/rules.ts`)

One file per `kind`: `conditions.json` (Core pp.197–200), `weapon-traits.json` (Core pp.208–210, plus FSPG p.120's
Blessed, Daemons & Heretics p.103's Sonic Weapon, IoE p.79's Lance and Gruesome, the Necrontyr's Tesla as `tesla-necrontyr`, and Apocrypha pp.326–328's 25,
among them its own Tesla), `armour-traits.json` (Core p.232, plus Apocrypha p.398's Agile and Void),
`combat-actions.json` (pp.177–190), `stat-block.json` (kind `stat`: every value a threat stat block prints, in
printed order, from the Bestiary Format legend p.323 and the pages it points to; attributes pp.119–120, Speed p.180,
Size p.191, weapon profile pp.207–208, Mobs p.324, Resolve and Personal Ruin p.325), `character.json` (kind
`character`: Bringing Your Character to Life, Core p.34, behind the (?) beside WHO YOU ARE on the sheet and in the
builder; the Ten Questions keep their headings only, and question 10, "Why Are You In The Gilead System?", is left
out because it belongs to the Core book's setting, not to every campaign; plus the character Traits, Core pp.37–38,
that `stat-block.json` doesn't already hold as threat terms (Resolve, Passive Awareness, Influence, Wealth), Skills
(p.121), Wrath Points (p.164) and Glory (pp.164–165, `page` 164), all for the sheet's TRAITS (?); worked examples and
optional rules left out; and, for a scene's Ruin and Glory (GitHub issue #40), Wrath Complications (p.163, with its
optional rule's Complication Consequences table), Combat Complications (p.191, with its d66 table) and Ruin (p.320,
`gm`)), `tests.json` (kind `test`, for scene Tests, GitHub issue #39: Difficulty Numbers, Core
pp.160–161, with the Determining Difficulty table and the How Hard Could It Be? sidebar; Shifting, pp.165–166, with
Using Shifts and its five uses; Fail Forward, p.319; worked examples left out). Each entry is `id` (unique across
files), `kind`, `name` as printed with its rating (`Blast (X)`), `abbr` (stats only: the stat block's label, `SHK`),
`type` (actions only), `source`, printed `page`, `gist` (one terse line paraphrased from the entry's own text, in
the style of a quick-reference sheet, shown on the collapsed row) and `text`: the entry's body, verbatim,
paragraphs split by a blank line, and `gm: true` on an entry from the Gamemaster chapter (Fail Forward and Ruin),
which only the GM's seat is served (rules-flow.md §11.74, §11.76). Print errors are kept as printed; tables are plain lines. A section intro is its own
entry (`conditions`, `weapon-traits`, `armour-traits`). Served to any seat by `/api/campaigns/:id/rules`, minus `gm` entries for a player. The player
FIGHT tab hands the `stat` entries to the stat block's (?) legend. To add a
kind (psychic powers, talents), extend `RuleKind` and add a file.

### Scene presets (`packages/data/scene-presets/*.json`, `ScenePresets` in `packages/shared/src/scene-presets.ts`)

GM-only book data for building scenes (GitHub issues #39, #40 and #49), served by `GET /api/campaigns/:id/scene-presets` as
`{ skillDns, tables, pools, hazards }`. Loaded once at api startup by `scenePresets()` (`index.ts`).

- `skill-dns.json` (`SkillDn[]`): Skills and DN, the table at the foot of Core pp.122, 123, 125 and 126. There is one
  row per Skill and printed DN, `{ skill, dn, source, page, example }`, with the example verbatim: 17 Skills × DN 1,
  3, 5, 7, 9 = 85 rows. Psychic Mastery prints none. `validate` fails unless every other Skill has exactly those five
  DNs, so a dropped, doubled or stray row can't slip through. Kept as printed: "enginge" (Tech DN 5, p.126) and the full stop
  ending the Investigation DN 1 example (p.123). The scene editor shows the row for a Test's Skill and DN under its DN
  chips.
- `<source>.json` (`EventTable[]`, one file per book, named by its `source`): the book's rolled event tables, for
  NEW SCENE FROM A TABLE. Planned: Church of Steel (Battlefield, Urban and Wasteland Travel, d66, pp.36–42),
  Redacted Records (Space Hulk Internal, External and High-Tier Events, 2d6, pp.13–15), Darktide (Lattice Encounters,
  d6, p.74) and Litanies of the Lost (Random Encounters, 2d6, pp.117–120). Left out by the GM's choice (2026-10-02):
  the Forsaken System Player's Guide's downtime Events, which modify Endeavours rather than make scenes, and Darktide's
  Sump Events, which are the scenes of its adventure rather than a table.
  - A table is `{ id, name, source, page, dice, type, defaultDn?, gm?, rows, gaps, overlaps }`. `dice` is one of
    `Dice` (`roll-table.ts`: d3, d6, 2d6, 4d6, d66). `type` is the scene type its events make. `defaultDn` is a
    printed default ("Skill Tests are DN 5 unless you determine otherwise", Church of Steel). `gm` holds the book's
    notes on using the table, verbatim (when to roll, the Wrath Die).
  - An event is `{ from, to, name, page, type?, readAloud, text, tests }`. Ranges are inclusive printed results, so a
    d66 row 16–24 covers 16 and 21–24. `readAloud` and `text` are verbatim; a nested table inside an event is plain
    lines in `text`. Threats, effects (damage, Glory, Ruin) and links to other tables stay in the text: the scene
    leaves the encounter to the GM.
  - An event's Test (`PresetTest`) is `{ kind, skills, attribute, dn, purpose, gm? }`. `skills` lists every Skill the
    book offers for one DN ("Awareness (Int), Leadership (Wil), or Survival (Wil)"), and the scene gets one Test per
    Skill. `dn` is null where none is printed: the table's `defaultDn`, else the GM, fills it (rules-flow.md §11.75).
    The printed Attribute of a Skill isn't kept (it comes from `SKILLS`), so a misprinted one stays in the text.
    `purpose` is our words; `gm` holds what a Test can't (a condition, repeats, bonus dice, a Skill that isn't in
    Core, such as Navigation).
  - `validate` checks every range against the dice. Each result has exactly one event, unless it's listed in `gaps`
    (the book prints no row) or `overlaps` (it prints two). It also checks that ids are unique across files and that
    a file holds only its own book's tables, and it prints each table's events, Tests, printed DNs and `gm` notes.
  - `presetScene({ table, row })` turns an event into a scene's `codex.save` data: title, type, read-aloud, the text as
    GM notes with its cite, and the Tests. Nothing else.
  - **Church of Steel** (`church-of-steel.json`):
    - 3 tables, 36 events, 46 Tests, transcribed from page renders.
    - Only 3 Tests print a DN (Landmine 7, Radiation Zone 9, the Ravaged Landscape Fear Test 3). The rest take the
      printed default, 5.
    - Each table's `gm` keeps its printed note: the Battlefield Wrath Die rule, and Urban's line about the mode of
      transport.
    - Kept as printed: "one years past" (Landmine, p.36), "lighting" (Dangerous Weather, p.38), and "unless you
      determine otherwise determined" (Wasteland note, p.41).
    - Difficult Terrain offers four Attributes as alternatives, so they are four Attribute Tests, each with a `gm`
      note.
    - No Test entry for an event that names none (Forward Operating Base, Dangerous Weather, Light in the Darkness,
      Forgotten Church) or that says "almost any sort of Test" (Xenos Influence). Rampant Flora's extra Medicae dice
      stay in its text.
  - **Redacted Records** (`redacted-records.json`):
    - Space Hulk Internal, External and High-Tier Events: 3 tables, 2d6, 33 events, transcribed from page renders.
    - The book prints no Tests in them.
    - External's advice to pair an internal crisis with an external one, and High-Tier's line about Tier 4 parties,
      are each table's `gm`.
    - The p.16 stat block (Psychneuein) isn't transcribed. The row that points to it keeps "see page 16".
    - Kept as printed: "descendents" (Undying Grudges, p.13), "Gellar field" (Nox Tenebris, p.15), "Homonculi" (The
      Wild Hunt, p.15), and a straight apostrophe and spaced hyphens in Titanicus (p.15).
  - **Darktide** (`darktide.json`):
    - Lattice Encounters only: d6, 6 events, 3 Tests, each with a printed DN.
    - The table's `gm` holds p.73's instructions: roll once at each of the four stages, and the signal after two
      encounters.
    - Ambush, Broadside, Pursuit and Lattice Springer make combat scenes.
    - Vibrations' Toughness Test notes its repeats and Shock in `gm`.
    - Out of scope: the Sump Events (the scenes of the book's adventure). The Chapter 2 Hazards tables are in
      `hazards/darktide.json` (issue #49); its Bounties are not.
  - **Litanies of the Lost** (`litanies-of-the-lost.json`):
    - Random Encounters: 2d6, 11 events, each with its read-aloud, and 3 Tests: Tech DN 7, Medicae DN 3, and an
      Opposed Stealth Test.
    - `name` is the table's row name. Three entries print a shorter heading (rows 5, 8 and 9).
    - The table's `gm` holds p.117's instructions: the d6 trigger roll before the table, that the GM may skip, force
      or pick instead, and the Combining Encounters sidebar.
    - Nested tables are plain lines in their entry: the Suggested Servitor Patrol Size (row 10, p.119) and the
      Incident Survivor d6 (row 12, p.120).
    - Row 3's "sneak past" and "deceive" name no Skill, so they stay in its text.
    - Kept as printed: "Maerch" (sidebar, p.117), "manufactorium" (pp.118–119), and a mismatched ‘…” quote (p.119).
- `pools/<source>.json` (`PoolPresetTable[]`, one file per book, GitHub issue #40): the books' ready-made Ruin and
  Glory lines, for the scene editor's ADD FROM BOOK.
  - A list is `{ id, name, source, page, gm?, rows }`, `gm` holding the book's notes on using it, verbatim. A row is
    `{ kind, pool, n, name, page?, text, gm? }`: `kind` is `earn` (a trigger or award) or `spend`, `pool` is Ruin or
    Glory, and `n` is the printed amount or cost, null where the book prints none (rules-flow.md §11.78). `name` is
    as printed (our words only where the book names none), `text` the printed effect verbatim, and `gm` a condition
    the app can't check.
  - `presetLine({ table, row })` copies a row into the scene, with its cite: an `earn` row becomes a Ruin or Glory
    line (`name`, `gm` and the cite; an award with no printed amount starts at 1, §11.77), a `spend` a planned spend
    (`text`, `gm` and the cite; no printed cost stays empty and SAVE waits for the GM's).
  - `validate` checks that ids are unique, that a file holds only its book's lists, that each planned list holds the
    rows the book prints, and that every row fits a scene line once copied; it prints each file's presets, `gm`
    conditions and rows with no printed number.
- `hazards/<source>.json` (`HazardTable[]`, one file per book, GitHub issue #49): the books' hazards, for a place's
  hazard list. A place's entry points at a row by `id`, as an encounter points at a threat, so the text stays here.
  - A table is `{ id, name, source, page, dice, gm?, rows, gaps, overlaps }`. `dice` is null for a list to pick from
    rather than roll on (Core pp.201–202); its rows have no ranges.
  - A row is `{ id, from?, to?, name, page, text, tests, conditions, threats, variants, gm? }`. `id` is unique across
    files. `text` is the printed result, verbatim. `tests` are `PresetTest`s, whose `tierDn` holds a DN of the game's
    Tier plus n ("a DN equal to the game's Tier", TA p.11, is 0). `conditions` are ids in `rules/conditions.json`,
    `threats` are `{ threatId, count }` with a bestiary id and an `Amount` ("3d6"): the Threats a row may bring in, as
    printed, whether always or only on a failed Test or a GM spend; the condition stays in `text` and `gm`. `variants` are the printed
    intensities (Light, Moderate, Intense), each with its Tests and effect. `gm` holds what the fields can't: a
    Wrath Complication trigger, a DN penalty for some Rounds, Influence or Wealth lost.
  - `validate` checks the ranges against the dice (the Space Hulk's 66 is a listed gap), unique table and row ids,
    each planned table's row count, and every Condition and Threat; it prints each table's Tests, Conditions, Threats
    and `gm` notes.
  - **Threat Assessment** (`threat-assessment.json`): the six Battlezone tables, d66, pp.11–21: Space Hulk (12 rows,
    no row for 66), Hive City, Deathworld, Volcanic Wastes, Frozen Tundra and Forgeworld (13 each), transcribed from
    page renders.
  - **Core Rulebook** (`core.json`): Environmental Hazards, pp.201–202, a list of six to pick from: Suffocation,
    Electricity, Extreme Heat & Cold, Falling, Fire and Radiation. Electricity and Radiation's Rad Poison carry their
    Light, Moderate and Intense intensities as `variants`, each a Toughness DN (3, 5, 7) and its damage. Heat & Cold,
    Fire and Radiation print no DN ("The GM decides"), so those Tests have none. The section's opening line is the
    table's `gm`. Kept as printed: "Inflict (On Fire ) Trait" (p.202).
  - **Darktide** (`darktide.json`): the seven Hive Encounter Hazards tables, 2d6, 9 rows each, pp.14–26: Warrens,
    Hab Settlement, Industrial Works, Gang Turf, Militarum Depot, Quarantine Zone and Profaned Ground, transcribed
    from page renders. Written for Hive Tertium, "adapted to fit into any game … set within a hive city" (p.13). The
    Bounties tables on the facing pages are rewards, not hazards, and stay out. A printed Mob size is the Threat's
    `count` ("a Mob of 20 Troopers"). Kept as printed: `<LOCATION REDACTED>` (Militarum Depot 6, p.22), "Intimidate
    (Wil)" (Militarum Depot 7), "Agility (S) Test" (Gang Turf, Pneumatic Crusher, an Agility Test in the data), and
    the missing comma between Stack Skirrers and Lattice Springers (Warrens 11–12). "Chem-Squad Garrison" keeps the
    hyphen the page breaks the line on (p.22).
  - **Redacted Records** (`redacted-records.json`): Stage 4 of the Space Hulk Generator, the Hazards Table, d6, p.11:
    five features of a whole hulk (1–2, 3, 4, 5, 6), each row's description and Effect as its text. The opening
    paragraph is the table's `gm`. The table prints "Warp Twisted" and "Into the Warp", the sections "Warped" and
    "Into The Warp": rows take the table's names. Kept as printed: "ordinance" and "mean they" (p.11).
  - **Core Rulebook** (`core.json`): 3 lists, 10 rows. Acquiring Ruin (p.320): the three +1 triggers, plus a
    Complication taken as Ruin (p.163) and Fail Forward's "The GM gains 1 Ruin" (p.319), both named in our words.
    Spending Ruin (p.320): the four priced spends; Activate Ruin Actions isn't one, since each Threat prices its own.
    Glory Points (p.316): an award for a particularly impressive feat, with no printed amount.
  - **Threat Assessment** (`threat-assessment.json`): Additional Ruin Actions (p.7), 5 spends, checked against a page
    render. Two are priced: “Cower Before Me!” at 1 (the book prices a "second Ruin point", which adds the Tier to the
    DN; that stays in its text) and Counterattack at 1. Blasphemous Resilience, Gleeful Mockery and “Enough!” print
    no cost, so `n` is null and the GM sets it per scene (rules-flow.md §11.78). The list's `gm` is p.7's note that
    any enemy capable of Ruin Actions may use them. Kept as printed: Counterattack's "the Champion orders another
    enemy", though the table never says which enemy is the Champion.
  - **Bloody Gates** (`bloody-gates.json`): The Deadly Battlefield, pp.25–26, checked against a page render. Calling
    for Support: 6 Glory spends (2, 2, 1, 1, 3, 1); its `gm` is p.25's two paragraphs (a Full Round Action, rolls that
    generate no Wrath, Glory or Ruin, support listed per mission, the Astra Militarum Trooper from Core p.328).
    Battlefield Ruin: 6 Ruin spends (1, 3, 2, 2, 3, 2); its `gm` is p.26's intro (options per mission, a combat-time
    effect takes a Turn as an extra NPC). Each `text` keeps the italic quote that opens it. Artillery Support's profile
    is one plain line. Kept as printed: its "Traits (8)", which names no trait, "AP —1" with a dash, and the lowercase
    word after the quote in Barrage and Spotlit.
  - **Affliction Ascendant** (`affliction-ascendant.json`): The Deadly Battlefield, pp.23–24, checked against page
    renders. Rites of Battle (p.23): 9 Glory spends, three per rite at 1, 2 and 3, each named "<Rite>: <benefit>" as
    the table prints them; its `gm` is p.23's conditions (an ASTARTES Agent picks one rite before battle and pays at
    the start of their turn; Tier 4 only, for Astartes who trained together or share a [CHAPTER] Keyword). Battlefield
    Ruin (p.24): 6 Ruin spends (1, 1, 2, 2, 3, 3); its `gm` is p.24's intro. Nurgle's Miasma's four choices are "• "
    lines in its text, standing in for the printed skull bullets. Kept as printed: "-2 AP" with a hyphen in Staggering
    Blow beside "−1 AP" elsewhere, and "(see Wrath & Glory, page 194)".

### Places (`packages/data/places/<source>.json`, `Place` in `packages/shared/src/places.ts`)

The books' places for CODEX › LOCATIONS' ADD FROM BOOK (GitHub issue #50), one file per book, parents first:

| Book | Pages | Places |
|---|---|---|
| Core Rulebook | pp.296–309 | 16: the Gilead System, its six worlds with their stat lines and hooks, the Reach and the Membrane Worlds |
| Forsaken System Player's Guide | pp.5–38 | 7: the six worlds, each with its adventure-hook sidebars; Enoch's Maintenance Undercrofts |
| Vow of Absolution | pp.94–111 | 9: the battle barge with the Crucible of Command and Relics of War, Castle Grigori with its halls and the Training Fields, the Vault of Absolution and the Vault of the Endless Watch |
| Gutshiva's Kommandos | p.6 | 2: Gilead Primus and Hive Gulgatha |
| Darktide | pp.4–12, 14–26, 29–33, 79–83 | 33: the Moebian Domain, Atoma Prime (with its stat line), Hive Tertium's Main Hive, Habculum and Snakestack districts, the Slung, the Sump and its Refuse Archipelago (Port Odium, Blot, Saint Wretch), and the seven hive location types |
| Litanies of the Lost | pp.6–7, 10–22, 44, 53–61, 112–132 | 52: the Valley of Ancra and its sites, the monastery Hephesteum's Rest and its rooms, and the Pakthertius Manufactorum's floors and numbered areas |
| Redacted Records 2 | pp.38–40, 56–58, 78–93 | 10: Battlezone Balthazar, the Kaurdar Breach with Outpost Nemo and the Shattered Monolith, three shrines and three sites of discovery |
| Wretches of the Writ | pp.8–9 | 4: the Diver's Bell, the Fallow, Daedalon's Labyrinth and Brother's Ruin |
| Redacted Records | pp.23–33 | 5: the named space hulks: the Caveat Emptor, the Compostela, the Umbraeus, the Dominus Vobiscum and the Wrath of Janus |

**Conventions** (the transcription brief):
- A place is a named site with its own printed heading: a system, world, city, hive, ship, site, region, building or
  room. Organisations, people, events, rules and tables are not places. A heading that only groups places isn't one.
- `stats` holds only a printed "Label: value" stat line; `hooks` holds adventure-hook sidebars with their printed
  titles; `gm` holds the place's own section, verbatim. Non-place sections inside it (an organisation in a world's
  chapter) may follow under a line with their heading in capitals.
- GM NOTES are `placeNotes`: the cite, the stat line, the hooks, then `gm`, and must fit 5,000 characters. Long text
  stops at a whole paragraph, with a last line `… continues, <cite> p.N`; hooks that don't fit are named in a final
  `Hooks left out for length: …` line (rules-flow §11.100).
- Print errors are copied as printed and listed in the PR.

**Core Rulebook notes.** "The Heartworlds" and "The Straits of Andraste" are lore headings inside the system's text, not
places. Charybdion sits under the system, beside the Reach: its orbit "marks the border" between the Heartworlds and the
Reach (p.306). Craftworld Ul-Khari is a subheading inside Trollius. Kept as printed: "For all it's impressive power"
(Avachrus), "Andraste" and "Andrastre", "subtlety builds on" (The Harvest Smith), "targeting conveys" (the Voidmire).

**Forsaken System Player's Guide notes.** These pages print no heading for the system, so the six worlds are top level;
their cities and forges appear only in running text, so only Enoch's titled Maintenance Undercrofts sidebar (p.25) is a
place inside one. Each world has four to six hook sidebars, which fill most of its 5,000 characters: the description
stops after a few paragraphs, and Faces of Faith (Avachrus), A Crop of Psykers (Ostia) and A Noble Pursuit (Gilead
Primus) are named as left out. Two hooks print in the next world's section and go with the world they are about: The
Ion Hastilude (p.17, about Nethreus) and A Noble Pursuit (p.33, about Gilead Primus). Kept as printed: "of the of the
Sanctified Shield", "seeking the churches blessings", "Gilead Prime" (p.21), "Julyana"/"Julyanna".

**Vow of Absolution notes.** The ship's id is `vow-of-absolution-barge`, since `vow-of-absolution` is the source id.
Castle Grigori and the Vault have no place parent in these pages, so they are top level; the Endless Watch nests in the
Vault, which the book calls its core. The NPC pages (Captain Akahir p.98, Brother Loastin p.106, Chaplain Heractis
p.112) and the Chaplains box (p.111) are out. Kept as printed: "philosphies", "assign theseto", "Gilead Syatem", "Master
Loastin can not abide", "the mater investigated", "Brevit Captain".

**Gutshiva's Kommandos notes.** Hive Gulgatha nests in Gilead Primus. No stat line or hooks.

**Darktide notes.** The seven location types (pp.14–26) nest in Hive Tertium, whose new regions they generate; their
hazard and bounty tables are not place text (the hazards are in `scene-presets/hazards`). The Snakestack nests in Hive
Tertium, the Slung on its E07 platform, the Sump at its bottom. Chasm Station, Metalfab 36 and the Deep Below follow
the Habculum heading in print order, so they nest in it (a reading; the book doesn't say). Port Odium, Blot and Saint
Wretch are bold run-in names, counted as places. The Enclave has only event headings, so it is not a place; travel
rules, organisations, events (pp.85–94) and NPCs are out. Atoma Prime's Governance line runs past a stat value's 500
characters, so it opens the description. Kept as printed: "Snakestake", "Habiculum", "(or one the factions)".

**Litanies of the Lost notes.** The Valley of Ancra's description is "A Primer on Ancra" (pp.6–7) under a capitals
line, since p.10 prints only the chapter title. The monastery takes its printed name and p.44 heading. Numbered rooms
keep their number ("1: Prison"); the Manufactorum's floors list their Minor and Major Manifestations as `stats`. NPC and
organisation sections, encounters, Tests and sidebars are out. Kept as printed: the Julcian Complex's doubled sentence
(p.13), "recoding the all Servitors", "Enoch.These", "page247", "An DN 3", "three key locations" over four (p.122),
"unsubscribed resilient fabric", "Scriptorum".

**Redacted Records 2 notes.** No world is described in these pages, so the battlezones and the Hallowed Ground places
are top level; Trollius has no heading of its own. The "Shrines of Gilead" and "Sites of Discovery" intros are
groupings. NPCs, stat blocks, Tests and item rules are out; each "Adventure Hook" sidebar is a hook of its place. Kept
as printed: "shrine-cites", "suprise", "descendents", "archeotech"/"archaeotech".

**Wretches of the Writ notes.** Ostia has no heading of its own, so the Fallow is top level; "Gathering Chaos" is a
section heading. Kept as printed: "Daealon", "moons' production reports".

**Redacted Records notes.** The third hulk is the Umbraeus (p.28), and a fifth, "Space Hulk Designation Wrath of
Janus" (pp.32–33), is in as the Wrath of Janus. No hulk prints headed rooms, so none nests. Each Mission Briefs entry is
a hook; each hulk's secrets follow its description under a capitals line. Relic and NPC blocks are out; the Space Hulk
Generator (pp.6–11) is its own file, below. Kept as printed: "that that the vessel", "Gilead Rosarious", "planets ,and".

**The Space Hulk Generator** (`scene-presets/space-hulk.json`, `SpaceHulkGenerator` in `places.ts`, #50 step 8). One
object: `source`, `page` (6) and four d66 tables, `origin` (p.7, 5 rows), `occupants` (p.8, 10), `objectives` (p.8, 5)
and `rooms` (pp.9–10, 21). A row is `{ id, from, to, name, page, text? }`: the table's result as `name`, the section
that describes it as `text` (the Occupants rows have none). Stage 4 is the Hazards Table above (`HULK_HAZARDS`).
`codex.addHulk` takes row ids and writes the hulk and its rooms as places, with `hulkNotes` and `roomNotes` as their GM
NOTES. Served on `/scene-presets` as `spaceHulk`. `validate` checks the row counts, unique ids, and that the longest
notes a hulk can get (five origins) fit 5,000. Kept as printed: the Objective table prints no row for 14–16 or 46
(`gaps`), "Genestealer Putation" (p.8), and the table's "Warp Tainted Chamber" over the section's "Warp-Tainted".

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
| Coverage per book against `threat-manifest.json` (`{ source: ids[] }`, from each book's contents pages and a scan for stat blocks; outside `threats/` so the loader skips it). A book goes in when its transcription lands | `threats <source>: N/M (missing: …)` |
| A threat whose `source` is in the manifest but whose id isn't listed | `? <file>: not in threat-manifest.json …` warning, not a failure |
| Every pack parses as `Pack`, including key references and `MAX_ENCOUNTER_ROWS` | `✖ pack <name>` + zod error |
| Every beat `encounter[].threatId` and bestiary NPC `threatId` exists | `✖ pack <name>: unknown threat "…"` |
| Every `wargear/*.json` parses as `Wargear[]`; ids unique across files | `✖ wargear/<file>` + zod error, or `duplicate id` |
| Wargear summary | `wargear/<file>: N entries` |
| Every `rules/*.json` parses as `RuleEntry[]`; ids unique across files | `✖ rules/<file>` + zod error, or `duplicate id` |
| Rules summary | `rules/<file>: N entries` |
| Every `traits` string in `threats/`, `wargear/` and packs that `ruleKey` can't match to a `LINKED_RULE_KINDS` entry. The web shows these as plain text instead of a rule link. Some are missing rules or new spellings (add an alias to `ruleKey` in `packages/shared/src/rules.ts`); others aren't traits at all | `? N trait names match no rule: …` warning, not a failure |
| Pack summary | `pack <name>: N characters, N NPCs, N beats` |
| Every `creation/<type>/<source>.json` parses; the filename is a creation source id and matches each record's `source`; ids unique per type | `✖ creation/…` + zod error, `has source`, or `duplicate id` |
| Every creation id reference resolves (factions, species, sub-factions, archetypes, talents, powers, disciplines, keyword names, `wargearId`, a wargear item's `upgrades` and weapon-trait `traitIds`) | `✖ creation/… "<id>": unknown <type> "…"` |
| A wargear item with `upgrades` or `traitIds` has its base `wargearId` | `✖ creation/… "<id>": "…" has upgrades or traitIds but no base wargearId` |
| One record per thing: a name twice in a type, compared with its `category` and `disciplineId` (and overlapping species, for archetypes) | `✖ creation/<type>: "…" in A and B; keep the newest printing` |
| A Species' XP is the cost of its granted ratings (`ratingsXp`) | `? … "<id>": XP N, but its ratings cost M` warning, silenced by "XP as printed" in the note |
| An Archetype's XP is its ratings + (Tier − 1) × 10 (`archetypeXp`) | `? … "<id>": XP N, but ratings + (Tier − 1) × 10 = M` warning, silenced by "XP as printed" in the note |
| Creation coverage against `creation/manifest.json` | `creation <type> <source>: N/M (missing: …)` |
| Creation summary | `creation/<type>: N records`, and counts of GM-judged story conditions, `mundane` possessions and wargear not yet in the catalogue |
| A `follower` Wargear entry has a known `threatId`, and any `variant` (there or on a `followers` grant) is one of that threat's variants; nothing else has a `threatId` | `✖ wargear/<file> "<id>": …` or `✖ creation/… "<id>": "…" has no variant "…"` |
| Every `faction-presets/<source>.json` parses as `FactionPreset[]`; the filename matches each `source`, which is an official book; ids are unique across the files and the creation factions; every Keyword is a glossary or sub-faction Keyword, or printed on a threat | `✖ faction-presets/<file>` + zod error, `is from`, `homebrew`, `duplicate id`, or `unknown Keyword` |
| Faction preset summary | `faction-presets/<file>: N factions (N with Keywords, N with secrets)` |
| Every `npc-presets/<source>.json` parses as `NpcPreset[]`; the filename matches the first cite's book; every cite is an official book; ids are unique across the files (a patron's id is allowed, to replace it); `description` is empty; a bestiary stat source names a threat | `✖ npc-presets/<file>` + zod error, `is first cited from`, `homebrew`, `duplicate id`, `DESCRIPTION reaches players`, or `unknown threat` |
| NPC preset summary | `npc-presets/<file>: N NPCs (N with stats, N replacing a patron)` |
| Every `places/<source>.json` parses as `Place[]`; the filename is the source; official books only; ids are unique across the files and start with the source id; a `parent` comes earlier in the same file; a copied place's GM NOTES (`placeNotes`) fit 5,000 characters (rules-flow §11.100) | `✖ places/<file>` + zod error, `is from`, `homebrew`, `doesn't start with`, `duplicate id`, `parent … is unknown or comes later`, or `over 5,000` |
| Place summary | `places/<file>: N places (N top level, N with a stat line, N hooks)` |
| A `mundane` item links nothing in the catalogue | `✖ creation/… "<id>": "…" is mundane but links the catalogue` |

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
| Stat blocks and ability or rules text | `packages/data/threats/*.json`, `packages/data/wargear/*.json`, `packages/data/creation/**/*.json`, `packages/data/rules/*.json`, `packages/data/scene-presets/**/*.json`, `packages/data/places/*.json`, and any rule text in packs and characters |

- Keep the repo **private**.
- Never serve book content without an access token. `GET /api/campaigns/:id/threats`, `/wargear` and `/scene-presets` return 401 unless
  the caller has a seat at that table and 403 for a player.
- Players get a threat's `stats` only after the GM reveals that combatant (`toPlayerView`). They never get NPC
  `statSource`.
- In docs, issues and PRs, show structure or placeholders, never a real stat block.
- `codex.addPlaces` and `codex.addHulk` (issue #50) copy a place's printed text into the campaign's GM NOTES, so it is stored in the
  database and leaves the app in the GM's export file. Only the GM receives it (`toPlayerCodex` blanks `gmNotes`), as
  with a threat snapshotted into a fight.

---

## 9. Creation catalogue

Everything a character is built from, for the character builder. `resolveBuild` (`packages/shared/src/build.ts`) turns a
`CharacterBuild` (the choices) into a sheet, an XP ledger, the choices still pending and the problems; the acceptance
test `packages/data/build.test.ts` rebuilds the volkus pregens. Nothing serves this data to clients yet. Schemas
are in `packages/shared/src/creation.ts`; the data is `packages/data/creation/<type>/<source>.json`, one array per
file, loaded by `creationCatalogue()` in `index.ts`.

**Status (2026-10-01).** All seven books are transcribed and verified against the page images: 113 keywords, 27
factions, 136 sub-factions, 22 species, 31 background tables, 5 option groups, 205 archetypes, 336 talents, 32
packages, 41 disciplines, 291 powers, 16 Patrons, 27 Frameworks (58 in all with the Patrons' options, issue #45), 5 languages and 27 flavour tables, with every reference resolving.
What is left is outside the catalogue: 55 starting-wargear items the Wargear catalogue doesn't link yet, waiting on
rulings, and vehicles (see the Wargear catalogue).

| Type | Record | Holds |
|---|---|---|
| `keywords` | `Keyword` | Faction Keywords by printed name (`"ADEPTUS ASTARTES"`, `"[CHAPTER]"`); a bracketed one names the `placeholder` sub-faction type that fills it |
| `factions` | `Faction` | Adeptus Astartes, Asuryani…; `keywords` is the Faction Keyword it stands for, which is its name for 22 of the 27. Five are mapped by hand: Imperial Navy → NAVIS IMPERIALIS (Apocrypha p.48, Core p.376), Harlequins → HARLEQUIN, Rogue Trader Dynasties → ROGUE TRADER, Orks → ORK, Necrons → NECRON. T'au Empire takes T'AU, Core p.377's official Keyword, not Apocrypha p.68's T'AU EMPIRE (GitHub issue #46); `backgroundsFrom` lists the factions whose Background tables its Agents take (Anhrathe → Asuryani, Drukhari, Harlequins, rules-flow.md §11.60) |
| `sub-factions` | `SubFaction` | Chapters, Orders, Forge Worlds, Craftworlds…: `type`, `factionId`, the `keyword` it fills in, `traits` (with `geneSeed`) |
| `species` | `Species` | XP, Speed, Size, granted Attributes and Skills, maximums, Species Keywords, abilities, and `countsAs`: the species it also counts as for requirements (Primaris → Adeptus Astartes) |
| `backgrounds` | `BackgroundTable` | Origin / Accomplishment / Goal rows with their `bonus`, and Objectives; owned by a faction, species or sub-faction |
| `option-groups` | `OptionGroup` | Other creation choices: Kroot Mutations, Asuryani Paths, Kin Cloneskein, Apocrypha Homeworlds. `pick` is a count, `"tier"` or `"any"`; `xp` is the cost of the 1st, 2nd… pick, last repeating |
| `archetypes` | `Archetype` | The printed entry: Tier, species, XP, Keywords, Attributes, Skills, abilities, wargear, Influence, suggestions (with their printed XP); `grants` for a keyword choice, `requires` beyond species (a Pariah archetype needs the Pariah template) |
| `talents` | `Talent` | `category` talent, faith, exarch, prayer or vow; XP, requirements, effect |
| `packages` | `Package` | Ascension and Advancement Packages |
| `disciplines`, `powers` | `Discipline`, `PsychicPower` | Psychic powers. A discipline's `requires` is who may learn it (checked for every power in it); a power's `requires` is only its own prerequisite. `tags` are the power's own Keywords (PSYCHIC), not Faction Keywords; `alsoIn` lists other disciplines that print it. Minor powers and the free Universal Psyker Abilities are the pseudo-disciplines `minor` and `universal-psyker-abilities` |
| `patrons` | `Patron` | Patrons (Core pp.310–313, FSPG) and their Framework options, each a `FrameworkBody`: description, Limitations (Requirements, shown and never checked, rules-flow.md §11.81), Wargear and Bonus (Grants). Not read by the builder; PARTY's Framework picker shows them to the GM (issue #45) |
| `frameworks` | `Framework` | Frameworks with no patron: Core p.20's examples (with the printed `tier`, `characters`, `enemies`), Redacted Records' by Faction (`factionId`) and by Tier. A Framework printed both on its own and under a patron is kept once, under the patron |
| `languages` | `Language` | The Core p.31 languages: `keywords` that allow the one free pick, `xenos` for an alien tongue. Low Gothic (everyone) has no record; unlisted languages are GM-approved write-ins (rules-flow.md §11.48–50) |
| `flavour` | `FlavourTable` | Names, appearance. The name lists and the Eye Colour, Hair Colour and Features tables also go to the GM's `/flavour` for CODEX › NPCS' ROLL NAME and ROLL LOOK (`rollOn`, issue #48) |

**Nothing is free text.** Everything a record requires or gives, at creation or on purchase, is structured, and the
schema has no free-text form for either. Prose (`effect`, ability and trait `text`, `bonus`) is the printed rule text,
kept verbatim beside the structure. In-play effects (bonus dice in a situation, rerolls, "when you do X") stay in that
prose; a flat, always-on Trait bonus is `mods`. A condition the builder truly can't check is a `gm` requirement or a
`story` grant, which the GM judges; validate counts them.

**Shared shapes.**
- `Scaled`: a number, or `{ perTier }` (per Tier Ascended in packages; × the new Tier in XP), `{ timesTier }`
  (× the character's Tier), `{ perRank, plus? }` (× Rank, + N: Devotees' "Double Rank + 2") or `{ rankPlus }`
  (Rank + N). `Amount` also allows dice ("1d3", `{ perTier: "1d3" }`, `{ roll: "1d3", times: 3 }`).
- `Requirement`:
  - ratings: `attribute`, `skill`, `chosenAttribute` / `chosenSkill` (a bracketed Talent's pick), `influence`, `rank`,
    `tier` (`min`, `max`)
  - identity: `keyword`, `notKeyword`, `species` (matches `countsAs` too), `notSpecies`, `archetype`, `subFaction` (a
    Successor matches its `successorOf` too), `option` (an OptionGroup choice: the Pariah template)
  - what the character has: `talent`, `notTalent`, `talentCategory` ("at least one Faith talent"), `power`,
    `powerCount` ("2 powers from one Discipline"), `wargear` (printed names), `wargearKeyword`, `wargearCount`
    ("three or more augmetics")
  - composition: `either` (any one of `of`, each of which may be an `all`), `all`
  - `gm`: a story condition the GM judges ("entrusted with the secret of the Fallen")
- `XpCost`: a number, `{ perTier }`, `{ base, plus }`, `{ atCreation, later }` (Smite), or `{ byChoice }` ("10 or
  20").
- `WargearFilter`: which catalogue items qualify, by `kinds`, `weapon` (melee or ranged), `categories`, `nameIncludes`,
  `wargearKeywords`, `maxValue` (a number, `{ tierPlus }`, `{ newTierPlus }`), `rarity` (`atMost`, `atLeast`),
  `upgrade`, and a GM-judged `condition`.
- `Grant`:
  - items: `wargear` (optionally `requires`), `bundle`, `pick` + `wargearOf` (a `WargearFilter`), `weapon` (an innate
    profile, `addStrength` for S + X), `weaponTrait`, `trinkets`, `followers` (mob, companion, familiar, devotees or
    minion): a fixed bestiary `threatId` (+ `variant`), or `threatOf` for the player's pick (`classes` at the
    character's Tier, `maxSize`, any of `keywords`), and `genericStats`, the printed "1 + Double Rank" stand-in
  - character: `talent`, `keyword`, `keywords`, `loseKeyword`, `neverKeyword`, `power`, `disciplineAccess`,
    `chooseDisciplines` (optionally `from`), `onlyDisciplines` (optionally `untilTier`; it limits the
    species' `chooseDisciplines` and the powers bought, rules-flow.md §11.62), `talentAccess` (+ `asKeyword`),
    `optionAccess`, `mods` (scaled; any `Mods` key, `passiveAwareness` and `maxTraumatic` included, or `armourRating`),
    `attribute` (`add` / `to`; "any", "lowest"), `skills` + `add`, `chosenTrait`, `influenceAttribute`, `xpDiscount`
    (a Talent at a price, or a discipline at a multiplier), `noArmour`, `never` (Faith or Corruption), `languages`
    (scaled, or `{ skill }` for "equal to your Scholar rank"; `xenos` for "one alien language")
  - resources: `wealth`, `wealthPerSession`, `influence`, `corruption`, `faith`, `wrathPerSession`, `ammoPer`,
    `memorableInjuries`, `mutations`, `bonusDice` (scaled), `gmRuin`
  - composition: `all` (optionally `requires`), and `choose` from options, from disciplines, or of Skills; `optional`,
    `repeat`, `random`
  - `story`: a narrative benefit the GM runs
- `Rule`: a named ability, verbatim, with `mods` and `grants`. A `Keyword` has `grants` too (PSYKER gives the Universal
  Psyker Abilities and Minor / Smite access, Core pp.257, 375; PRIEST gives Prayer access, rules-flow.md §11.40), and each Species grants a psyker its disciplines
  (Core p.257: Aeldari Divination, Runes of Battle and one more; everyone else one). A `PsychicPower`'s `useRequires`
  is what using it (not learning it) needs.
- A wargear item keeps its printed `name`, a `qty` (a number or dice), a `scope` (character or group), and a
  `wargearId` once the Wargear catalogue has it. A variant no book prints as its own item is the base `wargearId` plus
  `upgrades` (catalogue upgrade ids) and `traitIds` (weapon-trait rule ids): Master-crafted Power Sword, Kustom Slugga
  (rules-flow.md §11.42).
  A possession no armoury prints and no rule reads (a Bedroll, a Grooming kit) is `mundane`: a sheet line with no
  catalogue entry (§11.43).

**Sub-faction keywords** ("SPACE WOLVES") are defined by their `SubFaction` record, not by a keyword record; keyword
records are the glossary Faction Keywords and the `[PLACEHOLDER]`s. A sub-faction's `requires` holds printed
restrictions (Black Templars can't be PSYKER; World Eaters must take KHORNE as their [MARK OF CHAOS]).

**Waves.** `creation/manifest.json` `done` lists the types whose wave is finished. A reference into a type not yet
done is counted as pending, not failed, so data can land wave by wave. Every type is done now, so validate is strict: a
new type added to `CREATION_TYPES` starts pending until it is added to `done`.

**Test.** `packages/data/creation.test.ts` (part of `bun run test`) checks that every volkus pregen resolves: its
species, archetype and packages (at the XP in `docs/pregens.md`'s ledgers), talents, and Chapter with its traits.

**Transcribing.**
- **One record per thing.** When several books print the same species, archetype or talent, transcribe only the first
  source in `SOURCES` order (D&H, VoA, IoE, FSPG, Core, then the homebrew Apocrypha and Necrontyr), and cite the others in
  `note` ("Also Core p.113, 277 XP"). Official always beats homebrew; Apocrypha's `##` entries have FSPG versions.
- **Fill what the newer printing leaves out.** A Species' `keywords`, `grants`, `max` and `size` that the winning
  printing doesn't print are taken from the older one, and the note says so (IoE's Aeldari has Core p.39's Species
  Keywords). Nothing the winner prints is overridden.
- **Keep homebrew extras.** When a losing homebrew printing has rules the winner lacks (Apocrypha gives Mars a trait, Core
  prints none), they are added to the winner with `source` set on each `Rule`, so the builder can hide homebrew.
  Faction `rules` are added by name; `traits` and `abilities` only when the winner has none. Tables whose rows differ
  (the Apocrypha Harlequin and Drukhari backgrounds) are separate records named "… (Apocrypha)".
- **Access rules survive the merge.** When the winning official printing states no `requires` and an older official
  one does, the older one's apply (IoE's Runes of Battle takes Core p.271's PSYKER + AELDARI).
- **One record per thing means per category** (and per discipline, for powers). An Apocrypha Exarch Power named Evade is not the Evade talent: they
  get different ids (`evade-exarch`), and dedup compares category and name.
- **Daemons & Heretics (Psychic Diabolus, pp.113–125):**
  - Its Prayers to the Dark Gods are `prayer` talents that need only CHAOS (p.114: "Any Agent with the CHAOS Keyword can
    purchase…"). Each prints "You gain +1 Corruption." in its Effect, which is a purchase grant, as on Core's Betrayer.
  - Three of them (Benediction of Darkness, Dark Zealotry, Litany of Despair) share a name and category with Apocrypha
    prayers, so the official printing replaces those, and each `note` cites the Apocrypha version. Apocrypha's Dark
    Apostle suggestions now point at the official ones.
  - Its Maleficarum powers join Core's `maleficarum`. Death Hex, Diabolic Strength and Warptime are also Apocrypha Dark
    Hereticus powers, so the new ones carry the discipline in their id (`death-hex-maleficarum`), and so does
    `delightful-agonies-soulstain`.
  - Pandaemoniac, Soulstain and Warprot require PSYKER, CHAOS and none of the other three gods. "A Psyker with the
    TZEENTCH Keyword can always purchase powers from the Pandaemoniac Discipline, without it counting as one of the
    limited number of Disciplines they can learn" (p.118, likewise pp.121, 123) is a PSYKER-gated `disciplineAccess`
    grant on the Core TZEENTCH, SLAANESH and NURGLE keyword records. It reaches the god keyword however it came: a
    Mark of Chaos, or an archetype that prints it (Tzaangor, Plague Marine).
- **Where an index and an entry disagree, the entry is the rule.** Note the difference.
- **Bracketed names drop the placeholder from the id** and repeat once per choice (`repeatable: "perChoice"`): "Hatred [Any]" is `hatred`, "Loremaster [Keyword]" is
  `loremaster`, as Core's contents page lists them.
- **Standing weapon effects** (rules-flow.md §11.68, `WeaponEffect` in `packages/shared/src/weapon-effect.ts`): a
  Talent, a package, or a `Rule` (an archetype's or species' ability, a sub-faction trait, a faction rule) carries
  `weapons: [{ fits, mods }]`. `fits` is the Wargear filter, matched against the weapon's catalogue entry, plus
  `chosen` (the Talent's choice names the weapon, Trademark Weapon), `granted` (the weapon the record's own grant
  gave, the Doctrines) and `unarmed`. `mods` are the upgrades' (`weaponMods`), with amounts that may be Rank:
  `{ "perRank": 1 }`, Double Rank `{ "perRank": 2 }`. A record's entries are alternatives: the first that fits a weapon
  applies, so "SHURIKEN weapons" can be the keyword and Inheritance of Embers' "Shuriken Weapons" category without
  counting twice. Re-rolls, bonus dice, "may" and GM-judged effects are `gm` or `bonusDice` notes, never numbers.
  `validate.ts` holds `chosen` to Talents and `granted` to records that grant wargear. Known gaps, each a note or
  nothing until the data or schema grows:
  - unarmed strikes have no sheet line, so an `unarmed` effect stays in its text (Brawler, Assassinorum Conditioning);
  - faction `rules` don't reach the sheet yet, so Assassinorum Conditioning (Apocrypha p.55) does nothing;
  - a weapon outside the catalogue can't be matched: the Reaver's Bladevanes (Church of Steel) and the Eradicator
    Doctrine's Heavy Melta Rifle;
  - no "set" for a Trait's rating with dice ("Mortal (1d3)", Scorpion's Grasp) or a multiplied Salvo (Fast Shot);
  - a condition on the character, not the weapon (Bork'an "Fire caste T'au" range) is a note;
  - a Package that takes a weapon by choice (A Test of Faith, Lost on the Warrior Path's Mastercrafted Aspect weapon)
    has no `choice` to name it.
- **A Talent whose text lists what its choice is one of** carries them as `options` (Acute Sense's five senses, Core
  p.129). A bought one must name one; a granted one (the Space Wolves' Hunters Unleashed) asks for it in
  `choices["<grant path>/choice"]`, as an option index.
- **Archetypes printed in several books share one id** so the merge sees them as one: FSPG's "Astartes Apothecary"
  and VoA's "Apothecary" are both `apothecary`; Apocrypha's "Harlequin Player" is IoE's `troupe-player`. Apocrypha's
  dual stat blocks are two records (`apothecary`, `primaris-apothecary`).
- **Archetype XP** is, for about 85% of printed entries in every book, the cost of its ratings plus (Tier − 1) × 10
  (`archetypeXp`). Validate flags the rest; a real misprint keeps the printed XP with "XP as printed" in its note.
- **Name the thing, not the heading.** VoA heads Tactical Space Marine "TACTICAL"; the record is `tactical-space-marine`
  so it clashes with, and replaces, the Core printing.
- **Section rules go on every record.** VoA p.45 limits every Talent in its chapter to ADEPTUS ASTARTES, not CHAOS:
  each record carries those requirements and a `note` saying where they come from.
- Copy print errors as printed (`"weapon'sRapid Fire"`, "Psychic Master (Wil)") and note the ones that matter.
- Names and DNs use straight apostrophes (`Target's Defence`), so lookups by name work; prose keeps the book's
  typography.
- Legacy of the Necrontyr is 1st edition: its archetypes get Core-format XP, as a house ruling written in
  [rules-flow.md](rules-flow.md) §11 when that wave lands.
- `bun run validate` until clean. `creation/manifest.json` lists the expected ids per type and source, taken from each
  book's contents pages, so progress shows.

**Open questions for the GM** (not yet decided; they go in rules-flow.md §11 once decided):

- GitHub issue #2: the missing Anhrathe Goal table (IoE p.14); only ANHRATHE OBJECTIVES is printed. Check the updated
  PDF (around May 2024; ours is from Jan 2024) before ruling. Corsair Backgrounds are settled by §11.60; the +20 / +30 XP half by §11.35.
- Species details still missing: no Size for any Apocrypha species or the Necron.
- Archetype print problems kept as printed, pending a ruling: Howling Banshee's SKILLS copy the Ranger's (IoE p.27);
  Lexmechanic prints "SKILLS: 3" with no Skill names (FSPG p.117); Corsair Prince's keywords read "AELDARI, ASURYANI,
  [CRAFTWORLD]" (IoE p.56; ANHRATHE, [COTERIE] meant?); Venenum Assassin prints TEMPLUM VANUS (Apocrypha); the Corsair
  "Shuriken Rifle or Shuriken Pistol and Void Sabre" is read as (Rifle or Pistol) and Sabre (IoE pp.52–55).
- Apocrypha suggests talents from "RR1" and "RR2" (Redacted Records and Redacted Records 2); they are listed in notes only
  until those books are transcribed (GitHub issue #24).
- Magisterial House "+Rank to Wealth" (Apocrypha p.53) is read as a one-off grant at creation.
- The Primaris Chaplain's and Dark Apostle's "+Rank Resolve to you and allies" is read as an aura, not `mods`.
- Indomitable Belief's +Rank Resilience aura includes its owner (`mods`); Lobotomised Efficiency's "no longer add Tier
  to Max Shock" is `maxShock: { timesTier: -1 }`.
- Navigator Hereditary Mutations (Apocrypha p.11): does −1 to Intellect-derived Traits touch Passive Awareness?
- Chaos character creation (GitHub issue #3): Threat Assessment: Daemons & Heretics prints no archetypes and doesn't
  revisit Core p.87 "Creating a Traitor", so those recipes stay as rule text on the `chaos` faction. Apocrypha's Chaos
  archetypes have no official counterpart and stay as homebrew. Revisit when an official Chaos player book prints
  archetypes.
