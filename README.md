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
- **Party.** Characters, invites (a room QR for the whole table, a link per character, or a guest QR), session start
  and end (pool resets, XP), and Respite.
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
cp apps/api/.env.example apps/api/.env      # set ADMIN_KEY to something private, and the Clerk keys
cp apps/web/.env.example apps/web/.env.local  # the Clerk keys

bun run dev                                 # the whole stack (Turborepo): Postgres, then API :4000 + web :3000
```

Sign-in runs on [Clerk](https://clerk.com). Set it up once (details in
[`docs/development.md`](docs/development.md#clerk)):

1. Create a Clerk application on the free Hobby plan and enable the sign-in methods you want.
2. Under **Sessions → Customize session token**, add the claims
   `{ "metadata": "{{user.public_metadata}}", "name": "{{user.full_name}}", "username": "{{user.username}}" }`.
3. Sign in once, then set your user's public metadata to `{ "role": "creator" }` so you can start games.
4. Put `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `apps/web/.env.local`, and `CLERK_SECRET_KEY` and
   `CLERK_JWT_KEY` in `apps/api/.env`. Without them the web app answers 500 with "Missing publishableKey".

Start a game from the lobby at `http://localhost:3000` (**NEW GAME**), or seed a content pack (none ships in the repo now) with yourself as GM:

```bash
cd apps/api
bun run seed <pack> --owner user_2abc…     # your Clerk user id (Dashboard → Users); prints /c/<campaignId>
```

Open the table on the tablet. On the **PARTY** tab, show the **ROOM QR**; players scan it, sign in or join as a guest,
and claim an agent. To play on phones over your LAN, add the address the phones will use to `WEB_ORIGIN` in
`apps/api/.env` (comma separated, next to `http://localhost:3000`).

## How access works

People sign in with Clerk accounts. Players who don't want an account can join as guests.

- **Signed-in users** hold a seat at a table: GM, or player with a character. The GM is always a signed-in member, so
  a GM's access is their account; there are no GM links.
- **Creators** (Clerk public metadata `role: "creator"`, set by hand in the Clerk Dashboard) can start games in the
  lobby.
- **Invites.** From **PARTY**, the GM shows a **ROOM QR** (a week; players claim an open agent or name a new one) or
  an **INVITE** link for one character (a week, single use). A lost invite isn't recovered: revoke it and make a new
  one.
- **Guests** hold a per-character QR token in an httpOnly cookie. They come in through an invite that allows guests,
  or the **GUEST QR** on a character. Revoking a guest QR disconnects that guest immediately.
- The database keeps only hashes of invite codes and guest tokens.
- The lobby (`/`) lists your games and the games running now. A table lives at `/c/<campaignId>`, and your seat decides
  whether it shows the GM board or the player view ([why one app](docs/architecture.md#one-app-two-views)).
- Clerk needs internet at the table (sign-in, and a session refresh about every minute). Guests only need the api.

## Commands

| Command | What it does |
| --- | --- |
| `bun run typecheck` | Type-check shared, api and web |
| `bun run test` | Unit tests: rules functions, command parser |
| `bun run validate` | Check every threat and content pack against its schema |
| `bun run test:smoke` | End-to-end GM and player session (needs `dev:db` and `dev:api` running) |
| `cd apps/api && bun run db:generate` | Generate a migration after editing a `*.schema.ts` |

## Branches and PRs

Work goes through [`gh stack`](https://github.com/github/gh-stack) (install it with `gh extension install
github/gh-stack`), so a feature split into steps lands as a stack of small PRs, each based on the one below. The
trunk is `main`.

| Command | What it does |
| --- | --- |
| `gh stack init <branch>` | Start a stack from `main` with a new branch, or adopt an existing branch |
| `gh stack add <branch> -A -m "<message>"` | Stage everything and commit it as a new branch on top of the current one |
| `git commit`, then `gh stack rebase --upstack` | Add to the current branch, then rebase the branches above it |
| `gh stack submit` | Push the stack and open or update a PR for each branch (`--auto`: no editor, PRs as drafts) |
| `gh stack push` | Push every branch in the stack, without touching the PRs |
| `gh stack sync --prune` | Pull `main`, rebase the stack onto it, push, and delete branches whose PRs merged |
| `gh stack view` | Show the stack and each PR's status |

Plain `git` is fine for reading (`status`, `diff`, `log`) and for committing on the current branch. Don't rebase a
stacked branch with `git rebase` or push it with `git push`: `gh stack rebase` and `gh stack push` keep the parents
straight.

## Layout

```bash
apps/web          Next.js 16: the GM app and the player app
apps/api          NestJS on Bun: REST for the lobby, invites and join, Socket.IO for the live table, Drizzle + Postgres
packages/shared   zod schemas and pure rules functions, shared by web and api
packages/data     threat stat blocks, content packs (campaigns + pregens), validator
docs/             architecture, backend, frontend, game logic, data, development, deploy, rules spec (index: docs/README.md)
```

Full documentation is in [`docs/`](docs/README.md). Code style and review rules are in `.claude/`; agent guidance is in
[`CLAUDE.md`](CLAUDE.md).

## Deploy

Live at **https://auspex.ydothien.work**, on the same VPS as the other projects, at no extra cost.

- A push to `main` that touches app code runs **Build images** (`.github/workflows/images.yml`), which pushes the
  private images `ghcr.io/the-inconsistent/glory-gm-{api,web}:latest`.
- Then hit **Pull & redeploy** on the `auspex-gm` stack in Dockhand (`docker-compose.prod.yml`). The VPS never builds.
- Pangolin terminates TLS and forwards to web on host `:3004`. Next's rewrites proxy `/api` and `/socket.io` to the
  api, which uses its own `wg` database in the shared Postgres.
- Secrets live only in the Dockhand stack env. The Clerk publishable key is a variable in the GitHub `prod`
  environment.

The setup, checks and gotchas are in [`docs/deploy.md`](docs/deploy.md).

## Content packs

A campaign's opening content lives in `packages/data/packs/<name>/`:

- `pack.json` holds factions, locations, NPCs, handouts, and adventures with their beats and prepared encounters.
- `characters/*.json` holds the pregenerated characters.

`bun run validate` checks every reference in a pack. `bun run seed <name>` loads the pack through the same actions the
app uses. The repo ships no pack now; to make one, add `packages/data/packs/<name>/` in that shape.

## Status

Built:

- [x] tracker
- [x] prep
- [x] codex
- [x] party and session flow
- [x] player sheet
- [x] 369 threats (core rulebook, supplements and adventure books; vehicles wait for vehicle rules)
- [x] production deploy (Docker images, Dockhand, Clerk production instance with Google sign-in)

Not built yet:

- [ ] Doctors of Doom character import
- [ ] a rules reference in the player app
- [ ] an items and requisition tracker
- [ ] rate limiting

## Copyright

*Warhammer 40,000: Wrath & Glory* is published by Cubicle 7 under licence from Games Workshop. This is an unofficial
fan tool.

- The rulebook PDFs (in `books/`, gitignored) and the stat-block and rules text in `packages/data` are copyrighted.
  **Keep this repository private.**
- The app serves book content only to a signed-in member or a guest holding a valid access token.
