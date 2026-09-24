# Auspex

A table companion for **in-person** *Warhammer 40,000: Wrath & Glory*. The GM runs the table from a tablet, and each
player follows along on their phone. Everything syncs live.

The group plays with real miniatures and terrain, so Auspex has **no maps, dice or chat**. It handles the
bookkeeping: whose turn it is, Wounds and Shock, pools, Conditions, and what the players are allowed to see.

## What it does

### **GM (tablet)**

- **Tracker.** Alternating turns (players pick first), Seizing the Initiative, ambushes, and Mobs where each Wound
  removes a member. Death states follow the rules for each threat class. Conditions remind you when they tick.
  There's a command line (`hollan dmg 3`, `+pinned iskra`, `seize daro`, `end`) and undo.
- **Prep.** Adventures broken into beats (briefing, travel, investigation, social, combat, revelation, rest). A combat
  beat carries a prepared encounter that goes live with one tap.
- **Codex.** NPCs, locations, handouts and factions. Each entry has its own GM notes and secrets, and a reveal toggle.
- **Party.** Characters, a QR code to join each one, session start and end (pool resets, XP), and Respite.
- **Pools.** Glory and Ruin, capped by the rules.

### **Players (phone)**

- A live play sheet: Wounds, Shock, Wrath, Glory, Conditions, traits, weapons, skills, talents.
- The fight as the GM lets them see it: bars and Conditions always, stat blocks only once the GM reveals them.
- Handouts, known NPCs and locations, and session recaps.

Every rule in the code cites its rulebook page. Where the books are ambiguous, the house decision is written down in
[`docs/rules-flow.md`](docs/rules-flow.md).

## Quick start

You need [Bun](https://bun.sh) and Docker. Use Bun, not npm or pnpm.

```bash
bun install
cp apps/api/.env.example apps/api/.env      # set ADMIN_KEY to something private

bun run dev:db                              # Postgres in Docker on localhost:5434
bun run dev:api                             # API on :4000 (migrations run on startup)
bun run dev:web                             # web on :3000
```

Create a campaign. Both commands print a **GM link**.

```bash
cd apps/api
bun run seed volkus                         # the bundled campaign: Deathwatch Kill Team at the Volkus dig site
bun run create-campaign "My Campaign" 2     # or an empty campaign at Tier 2
```

Open the GM link on the tablet. On the **PARTY** tab, show a character's QR code; the player scans it and lands on
their sheet. To play on phones over your LAN, set `WEB_ORIGIN` in `apps/api/.env` to the address the phones will use.

## How access works

There are no accounts.

- An admin key creates a campaign and returns a GM link.
- The GM issues one link per character, shown as a QR code.
- Opening a link stores its token in an httpOnly cookie. The database keeps only a hash of the token.
- Revoking a character's links disconnects that player immediately. Issue a new QR code to let them back in.

## Commands

| Command | What it does |
| --- | --- |
| `bun run typecheck` | Type-check shared, api and web |
| `bun run test` | Unit tests: rules functions, command parser |
| `bun run validate` | Check every threat and content pack against its schema |
| `bun run test:smoke` | End-to-end GM and player session (needs `dev:db` and `dev:api` running) |
| `cd apps/api && bun run db:generate` | Generate a migration after editing a `*.schema.ts` |

## Layout

```bash
apps/web          Next.js 16: the GM app and the player app
apps/api          NestJS on Bun: REST for setup and join, Socket.IO for the live table, Drizzle + Postgres
packages/shared   zod schemas and pure rules functions, shared by web and api
packages/data     threat stat blocks, content packs (campaigns + pregens), validator
docs/             architecture, backend, frontend, game logic, data, development, rules spec (index: docs/README.md)
```

Full documentation is in [`docs/`](docs/README.md). Code style and review rules are in `.claude/`; agent guidance is in
[`CLAUDE.md`](CLAUDE.md).

## Content packs

A campaign's opening content lives in `packages/data/packs/<name>/`:

- `pack.json` holds factions, locations, NPCs, handouts, and adventures with their beats and prepared encounters.
- `characters/*.json` holds the pregenerated characters.

`bun run validate` checks every reference in a pack. `bun run seed <name>` loads the pack through the same actions the
app uses. To start a new campaign, copy `volkus/` and edit it.

## Status

Built:

- tracker
- prep
- codex
- party and session flow
- player sheet
- 44 threats (core rulebook and supplements)

Not built yet:

- Docker/Caddy deployment to a VPS
- Doctors of Doom character import
- a rules reference in the player app
- an items and requisition tracker
- rate limiting

## Copyright

*Warhammer 40,000: Wrath & Glory* is published by Cubicle 7 under licence from Games Workshop. This is an unofficial
fan tool.

- The rulebook PDFs (in `books/`, gitignored) and the stat-block and rules text in `packages/data` are copyrighted.
  **Keep this repository private.**
- The app serves book content only to someone holding a valid access token.
