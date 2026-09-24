# Auspex: Wrath & Glory table companion

A companion app for **in-person** games of *Warhammer 40,000: Wrath & Glory* (Cubicle 7). The group plays with
real miniatures and terrain, so there are **no maps, dice or chat**. The app covers:

- **GM (tablet):** live combat tracker, campaign prep (adventures → beats), codex (NPCs, locations, handouts,
  factions), party and session management.
- **Players (phones):** live play sheet, the fight as the GM allows them to see it, handouts, known NPCs and
  locations, session recaps.

Everything syncs live. UI style is "Auspex": a green-phosphor cogitator terminal (VT323 + IBM Plex Mono).

## Rules come from the books, never from memory

This app encodes game rules. **Do not invent rules.** Every rule in code cites its printed page
(`// p.177`, `Core p.324`, `VoA p.43`, `TA p.8`). Where a book is ambiguous, the house decision is written down
in `docs/rules-flow.md` §11 or `docs/kill-team.md`. Add new ones there, not silently in code.

- **Specs:**
  - `docs/rules-flow.md`: game flow (session, pools, combat state machine, damage, conditions, traits).
  - `docs/campaign-model.md`: the campaign and codex model.
  - `docs/kill-team.md`: the current campaign's Deathwatch Kill Team mapping and GM decisions.
  - `docs/pregens.md`: its five Tier 4 characters.
- **Books** are the PDFs in the repo root, gitignored. Page offsets:
  - Core rulebook: PDF page = printed + 1.
  - Vow of Absolution, Threat Assessment, Gutshiva's Kommandos: PDF page = printed.
- **Reading the PDFs:**
  - Text: use `pdftotext -f N -l N "<pdf>" -` and filter the watermark with `grep -v "Order #"`.
  - Stat blocks and tables garble in text, so verify them against a page image. The Read tool refuses PDFs over
    100 MB; render with `pdftoppm -f N -l N -r 110 -png "<pdf>" <scratch>/p` and Read the PNG.
  - Split large reading jobs across subagents, one book section each.
- **Copyright:** the book PDFs and the stat-block and rules text in `packages/data` are copyrighted. Keep the
  repo private and never serve book content without an access token (`/api/threats` is GM-only).

## Stack

**Bun** is the package manager, runtime and test runner. Don't use npm or pnpm.

| Part | Tech |
|---|---|
| `apps/web` | Next.js 16 (App Router), React 19, socket.io-client, `qrcode` |
| `apps/api` | NestJS 12 on Bun, run from source with no build step (Bun handles decorators). Socket.IO gateway, Drizzle ORM, Postgres 17 |
| `packages/shared` | zod 4 schemas and pure rules functions, imported as TypeScript source by web and api |
| `packages/data` | threat stat blocks (`threats/*.json`), content packs (`packs/<name>/pack.json` + `characters/*.json`), `validate.ts`, server-side loaders (`index.ts`) |

TypeScript is pinned to **5.9**. TS 7 breaks the Next and Nest toolchains, so don't upgrade it.

## Architecture

```
phones/tablets ──HTTPS──▶ Caddy (prod) / Next rewrites (dev) ──▶ /api/*, /socket.io/* ──▶ NestJS ──▶ Postgres
```

- **One mutation path.** Every change is a socket `action` event, validated against the zod `Action` union
  (`packages/shared/src/actions.ts`). The gateway (`apps/api/src/table.gateway.ts`) handles each one in order:
  1. `authorize(ctx)` checks the caller's role and ownership.
  2. `applyAction` runs inside a DB transaction.
  3. The gateway rebroadcasts.
  Actions are serialised per campaign with an in-process queue, which assumes a single api instance.
- **The server decides.** Counters take deltas (`+2 Wounds`), clamped at 0 and capped where the rules cap them,
  so simultaneous taps never overwrite each other. Postgres holds all live state; the server keeps no in-memory
  game state.
- **Two snapshots, full-state broadcast.**
  - `state` (`LiveState`): campaign pools, characters, active encounter.
  - `codex` (`Codex`): factions, adventures and beats, locations, NPCs, handouts, sessions.
  - `touches(action)` decides which of the two to rebroadcast.
  - The GM room gets everything. The players room gets `toPlayerView` / `toPlayerCodex`, which drop unrevealed
    threat stats, GM notes, secrets and hidden entries.
- **Access without accounts.** An admin key creates a campaign and returns a GM token. The GM issues one token per
  character, shown as a QR code. `/join/<token>` moves the token into an httpOnly cookie, and the socket handshake
  reads that cookie. The DB stores only SHA-256 hashes of tokens. Revoking a token kicks that player's socket.
- **Rules live in `packages/shared`,** as pure, tested functions, so the web and the api agree:
  - `deriveStats` (traits, minimum 1)
  - `sideUpNext` / `canSeize` / `canAct` (alternating initiative, Seize, ambush)
  - `threatStatus` / `pcStatus` (per-class death rules)
  - `poolMax`
  - turn reminders
- **Threat data is static.** `packages/data` is loaded by the api at startup, and a malformed file fails fast. When
  a threat joins an encounter, its stat block is snapshotted into the combatant row, so a later data fix doesn't
  change a fight in progress.

### Game flow (details in docs/rules-flow.md)

- **Turns alternate between sides.** Initiative is not a fixed order. After an Agent acts, a Threat acts; if one
  side runs out, the other goes back to back. The players pick first each Round.
- **Seizing the Initiative** costs 1 Glory or 1 Ruin, and lets the side that just acted go again, once. The GM can
  also Seize at the start of a Round.
- **Ambush:** ambushed combatants skip Round 1. Paying 1 Glory or Ruin makes one aware.
- **Mobs:** every member has 1 Wound, so Wounds remove members. Once half are slain, the app prompts a DN 3 Resolve
  Test.
- **Death by threat class:** a Troop over max Shock is slain. Troops, Elites and Monstrous Creatures over max
  Wounds are slain. An Adversary is Dying or dead, as the GM decides.
- **Session start:** every character's Wrath → 2, Glory → 0, Ruin → number of players. **Session end** awards XP.

## Layout

```
apps/api/src/   main.ts, app.module.ts, campaign.controller.ts (REST: campaigns, join, me, threats),
                table.gateway.ts, actions.ts (all game logic), state.ts (snapshot loaders), schema.ts (Drizzle),
                auth.ts (tokens, cookie), db.ts
apps/api/drizzle/  generated migrations (applied automatically at startup)
apps/api/test/     smoke.test.ts: end-to-end GM + player session against a running api
apps/web/app/      page.tsx (routes to GM or player by /api/me), join/[token], layout, manifest
apps/web/components/gm/      GmApp, Tracker, Prep, Codex, Party
apps/web/components/player/  PlayerApp (SHEET / FIGHT / INTEL)
apps/web/lib/      useTable.ts (socket + wake lock), command.ts (the tracker's command line)
packages/shared/src/  threat.ts, state.ts, codex.ts, actions.ts
```

## Commands

Run these from the repo root unless noted.

```bash
bun install
bun run dev:db              # Postgres in Docker on localhost:5434 (5432/5433 are taken on this machine)
bun run dev:api             # NestJS on :4000, watches src
bun run dev:web             # Next on :3000; proxies /api and /socket.io to :4000
cd apps/api && bun run seed volkus                          # new campaign from packages/data/packs/volkus; prints GM link
cd apps/api && bun run create-campaign "Name" 4             # empty campaign; prints the GM join link

bun run typecheck           # shared + api + web
bun run test                # unit tests: rules functions, command parser
bun run validate            # every threat JSON against the schema, with bestiary progress
bun run test:smoke          # end-to-end; needs dev:db and dev:api running
cd apps/api && bun run db:generate                           # after editing schema.ts
```

- `apps/api/.env` holds `DATABASE_URL`, `ADMIN_KEY`, `WEB_ORIGIN`, `COOKIE_SECURE` and `PORT`. Bun loads it
  automatically. See `.env.example`.
- The app is pre-release, so schema changes may regenerate the single migration: delete `apps/api/drizzle/`, run
  `db:generate`, then `docker compose down -v`. **Once there is real campaign data, add migrations instead.**

## Conventions and gotchas

- **Adding an action** touches four places:
  1. its zod schema in `actions.ts`
  2. a `case` in `apps/api/src/actions.ts`
  3. `touches()`, if it changes the codex
  4. `PLAYER_ACTIONS` or `authorize()`, if players may send it
- **Scope every query to `ctx.campaignId`.** Never trust ids from the client.
- **Clients send `ActionInput`** (zod input: defaulted fields optional). The server sees `Action` (parsed output).
- **Threat JSON conventions:**
  - `id` = filename; `source` = book id; `page` = printed page.
  - `threat` holds 4–5 Tier letters.
  - Weapons sit under an `ACTION` ability.
  - `shock: null` means "–".
  - Mob content goes in `options` (kind `mob`) and `mobAbilities`.
  - Print errors are copied as printed and noted in the commit or PR, not corrected silently.
- **Content packs** (`Pack` in `packages/shared/src/pack.ts`) reference entries by `key`. Parents come before children,
  and every encounter or NPC `threatId` must exist; `bun run validate` checks all of it. `apps/api/scripts/seed.ts`
  loads a pack through the normal socket actions, never direct SQL.
- **Character stats** (`CharacterStats`) carry additive `mods`, e.g. Primaris +3 Wounds or Honour the Chapter
  +1 Resolve; GM `overrides` win over everything. Melee wargear uses `addStrength` (damage = S + X, including the
  armour's Powered bonus).
- **Next rewrites:** `skipTrailingSlashRedirect` plus an explicit `/socket.io/` rewrite are required, otherwise
  socket.io's handshake gets a 308 or 404.
- **Style:** match the surrounding code. Comments say *why*, with page cites. Deliberate shortcuts are marked
  `// ponytail: <ceiling>, <upgrade path>`.

## Not built yet

- Doctors of Doom character import
- A full rules reference in the player app
- Items and requisition tracker
- Docker/Caddy deployment to the VPS
- Rate limiting
- Server-side undo history (client undo is inverse deltas)
