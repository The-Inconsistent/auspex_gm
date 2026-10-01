# Auspex: Wrath & Glory table companion

A companion app for **in-person** games of *Warhammer 40,000: Wrath & Glory* (Cubicle 7). The group plays with
real miniatures and terrain, so there are **no maps, dice or chat**. The app covers:

- **GM (tablet):** live combat tracker, campaign prep (adventures → beats), codex (NPCs, locations, handouts,
  factions), party and session management.
- **Players (phones):** live play sheet, the fight as the GM allows them to see it, handouts, known NPCs and
  locations, session recaps.

Everything syncs live. UI style is the "Imperial Manuscript", after the books' print design: vellum, crimson ink and iron
bands (Cinzel + Crimson Pro; IBM Plex Mono only for in-world print-outs), with a night "vigil" theme (`docs/frontend.md` §7).

## Rules come from the books, never from memory

This app encodes game rules. **Do not invent rules.** Every rule in code cites its printed page
(`// p.177`, `Core p.324`, `VoA p.43`, `TA p.8`, `D&H p.114`). Where a book is ambiguous, the house decision is written down
in `docs/rules-flow.md` §11 or `docs/kill-team.md`. Add new ones there, not silently in code.

- **Specs:** (index: `docs/README.md`; code-level docs: `architecture`, `backend`, `frontend`, `game-logic`, `data`,
  `development`, `deploy`)
  - `docs/rules-flow.md`: game flow (session, pools, combat state machine, damage, conditions, traits).
  - `docs/campaign-model.md`: the campaign and codex model.
  - `docs/kill-team.md`: the current campaign's Deathwatch Kill Team mapping and GM decisions.
  - `docs/pregens.md`: its eleven Tier 4 agents (the players pick five), each with its build.
- **Books** are the PDFs in `books/`, gitignored. Page offsets:
  - Core rulebook: PDF page = printed + 1.
  - Vow of Absolution, Threat Assessment, Gutshiva's Kommandos: PDF page = printed.
  - Threat Assessment: Daemons & Heretics (`daemons-and-heretics`, cite D&H): PDF page = printed. It's image-only (no text layer), so read it
    from page renders. Its creation content, relics and Sonic Weapon trait are in; its threats aren't yet.
  - Forsaken System Player's Guide, Aeldari: Inheritance of Embers: PDF page = printed. Apocrypha (homebrew): PDF = printed + 3.
    Legacy of the Necrontyr (homebrew): no printed pages, cite PDF pages. Full table: `docs/data.md` §3.
- **Reading the PDFs:**
  - Text: use `pdftotext -f N -l N "<pdf>" -` and filter the watermark with `grep -v "Order #"`.
  - Stat blocks and tables garble in text, so verify them against a page image. The Read tool refuses PDFs over
    100 MB; render with `pdftoppm -f N -l N -r 110 -png "<pdf>" <scratch>/p` and Read the PNG.
  - Split large reading jobs across subagents, one book section each.
- **Copyright:** the book PDFs and the stat-block and rules text in `packages/data` are copyrighted. Keep the
  repo private and never serve book content to anyone without an account (`/api/campaigns/:id/threats` and `/wargear` are
  GM-only; `/rules` and `/creation` need any seat; their seatless twins `/api/rules` and `/api/creation`, for the
  character library, need a signed-in Clerk user. That gate holds only because Clerk's **Access mode** is
  **Invite-only** (`docs/development.md` §Clerk): never switch it to Open without a membership check on those two).
  Book pages reach seated players only live: the GM's tablet renders the one tapped page from the GM's own PDF, and
  the api relays it without storing anything (`book:*` socket events, `docs/architecture.md`).

## Stack

**Bun** is the package manager, runtime and test runner. Don't use npm or pnpm. **Turborepo** (`turbo.json`) runs
the multi-package tasks (`bun run dev`, `bun run build`); it needs the root `packageManager` field (`bun@…`) to
find the Bun workspaces. `typecheck`, `test` and `validate` stay plain root scripts.

| Part | Tech |
|---|---|
| `apps/web` | Next.js 16 (App Router), React 19, socket.io-client, `qrcode`, `lucide-react` |
| `apps/api` | NestJS 12 on Bun, run from source with no build step (Bun handles decorators). Socket.IO gateway, Drizzle ORM, Postgres 17 |
| `packages/shared` | zod 4 schemas and pure rules functions, imported as TypeScript source by web and api |
| `packages/auth` | the only Clerk dependency (`@clerk/backend`, `@clerk/nextjs`), as TypeScript source: `@wg/auth/api` (Bun api), `@wg/auth/next` (Next server, proxy), `@wg/auth/react` (provider, Clerk components) |
| `packages/data` | threat stat blocks (`threats/*.json`), the Wargear catalogue (`wargear/*.json`, Core pp.211–247, VoA pp.59–75), the rules reference (`rules/*.json`: Conditions, weapon and armour traits, combat actions, stat block terms), the creation catalogue (`creation/<type>/<source>.json`: species, archetypes, talents, packages, powers…, docs/data.md §9), content packs (`packs/<name>/pack.json` + `characters/*.json`), `validate.ts`, server-side loaders (`index.ts`) |

TypeScript is pinned to **5.9**. TS 7 breaks the Next and Nest toolchains, so don't upgrade it.

## Architecture

```
phones/tablets ──HTTPS──▶ Pangolin (prod TLS) ──▶ Next ──rewrites /api/*, /socket.io/*──▶ NestJS ──▶ Postgres
```

- **One mutation path.** Every change is a socket `action` event, validated against the zod `Action` union
  (`packages/shared/src/actions.ts`). The gateway (`apps/api/src/table/table.gateway.ts`) handles each one in order:
  1. `applyAction` runs inside a DB transaction.
  2. It first calls `authorize(ctx)`, which checks the caller's role and ownership.
  3. The gateway rebroadcasts.
  Actions are serialised per campaign with an in-process queue, which assumes a single api instance.
  The one exception is the **character library** (`/api/library`, `docs/backend.md` §3.1): a character outside any
  campaign is nobody's live state, so there is no room to broadcast to and no action to queue. It's plain REST, scoped
  to the owner, and still re-resolves a build server-side before saving it.
- **The server decides.** Counters take deltas (`+2 Wounds`), clamped at 0 and capped where the rules cap them,
  so simultaneous taps never overwrite each other. Postgres holds all live state; the server keeps no in-memory
  game state.
- **Two snapshots, full-state broadcast.**
  - `state` (`LiveState`): campaign pools, characters, active encounter.
  - `codex` (`Codex`): factions, adventures and beats, locations, NPCs, handouts, sessions.
  - `touches(action)` decides which of the two to rebroadcast.
  - The GM room gets everything. The players room gets `toPlayerView` / `toPlayerCodex`, which drop hidden
    threats, bars-only threat stats, GM notes, secrets and hidden entries. They filter per viewer (`characterId`):
    the gateway emits to each player socket, so private handouts (`audience`) and objectives reach only their Agent.
- **Access: Clerk accounts, plus guest QR tokens.**
  - Signed-in Clerk users hold a seat through `membership` (gm or player, plus a character). The GM is always a
    member; there are no GM links. Clerk `publicMetadata.role = "creator"` (set by hand in the Dashboard) lets a user
    start games in the lobby. The api verifies session tokens locally (`CLERK_JWT_KEY`, `authorizedParties` from
    `WEB_ORIGIN`) and reads the name and role from custom session-token claims (see `packages/auth/src/api.ts`).
  - Guests hold a per-character player token (`access_token`) in the httpOnly `wg_token` cookie, from a GUEST QR
    (`/join/<token>`) or a guest-friendly invite.
  - The GM invites from PARTY: a room QR (`mode: "room"`, 12 h) or a single-use per-character link (`mode:
    "character"`, 168 h), at `/invite/<code>`. Accepting runs through `TableGateway.mutate` (the action queue, then a
    broadcast). Players never receive invites (`toPlayerView` clears `access.invites`).
  - `ADMIN_KEY` is for scripts only: `POST /api/campaigns` with `ownerUserId`, and a socket with
    `auth: { adminKey, campaignId }`.
  - Browsers open the socket with `io({ auth: { campaignId } })` and prove who they are with the Clerk `__session`
    or guest cookie. `Ctx` carries `userId` (null for guests and the admin).
  - The DB stores only SHA-256 hashes of guest tokens and invite codes. `member.remove` kicks that user;
    `token.revoke` kicks only guest sockets.
- **Rules live in `packages/shared`,** as pure, tested functions, so the web and the api agree:
  - `deriveStats` (traits, minimum 1)
  - `resolveBuild` (creation choices → sheet, XP ledger, pending choices, problems; `build.ts`)
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
apps/api/src/
  main.ts, app.module.ts
  core/        db.ts (drizzle client, migrations), errors.ts (ActionError, fail), sql.ts (clamped deltas, column helpers)
  auth/        auth.schema.ts (access_token, app_user, membership, invite),
               auth.service.ts (guest tokens, cookie, Ctx, resolveCtx), invite.service.ts (preview, accept),
               access.actions.ts (invite.create/revoke, member.remove)
  campaign/    campaign.controller.ts (REST: campaigns, lobby, me, threats, join, guest, invites), campaign.service.ts,
               campaign.actions.ts (campaign, pools, sessions), campaign.schema.ts
  character/   character.actions.ts (characters, guest tokens), character.schema.ts,
               creation.service.ts (buildCatalogue, creationPayload, buildRefusal)
  library/     library.controller.ts (REST: creation, rules, library CRUD for a signed-in user),
               library.service.ts, library.schema.ts (library_character: characters outside any campaign)
  encounter/   encounter.actions.ts (encounters, turns, combatants, beat.startEncounter), encounter.schema.ts
  codex/       codex.actions.ts (codex save/delete, beat order), codex.schema.ts
  table/       table.gateway.ts (socket), table.dispatch.ts (authorize, touches, kicks, applyAction), table.state.ts
apps/api/drizzle/   generated migrations (applied automatically at startup)
apps/api/test/      smoke.test.ts: end-to-end GM, player, guest and invite sessions against a running api
apps/api/scripts/   seed.ts (load a content pack, --owner <clerk user id> as GM), drop-placeholders.ts (one-off pack fix)
apps/web/proxy.ts   authMiddleware(), protects nothing, skips /api and /socket.io
apps/web/app/       page.tsx (lobby, guest redirect, sign-in landing), c/[campaignId]/page.tsx (seat → GM or player app),
                    c/[campaignId]/build/[characterId]/page.tsx (character builder; `new` for a new one),
                    library/[characterId]/page.tsx (the builder without a campaign),
                    invite/[code]/page.tsx, sign-in, sign-up, join/[token]/route.ts (guest token → cookie),
                    server-api.ts (apiGet: Clerk Bearer + guest cookie), layout.tsx (AuthProvider)
apps/web/components/lobby/   lobby-view (your games, your characters, running now, new game)
apps/web/components/invite/  invite-accept
apps/web/components/gm/      gm-app, tracker, prep, codex, party (with ascend-panel; kebab-case folders, children under
                             components/)
apps/web/components/player/  player-app (sheet, fight, intel)
apps/web/components/builder/ builder (draft, live resolveBuild, one screen per creation step, XP ledger; one Bench for a
                             campaign or the library, import-library for bringing a library character in)
apps/web/components/ui/      rules-ref (the RULES tab, GM and player), rules-provider + rule-link (tap a trait or Condition
                             to read its rule), weapon-line, sheet (with upgrade-row), bar, stat-block, status-chips,
                             status-screen, refusal
apps/web/hooks/use-table/    socket + wake lock
apps/web/lib/                command (tracker command line), blocks, weapon-line, tokens (raw colour values),
                             share-origin (QR and invite links carry an address a phone can reach)
packages/shared/src/         source.ts (SOURCES: book ids, precedence, cites), threat.ts, state.ts, codex.ts, actions.ts, access.ts (lobby, invite REST shapes), library.ts (personal library REST shapes, LIBRARY_CAP), pack.ts, requisition.ts, wargear.ts, rules.ts, creation.ts
packages/auth/               type.d.ts (Clerk public metadata + session claims), src/api.ts (verifySession, test tokens),
                             src/next.ts (authMiddleware, sessionToken), src/react.tsx (AuthProvider, Clerk components)
packages/data/               threats/*.json, wargear/*.json, rules/*.json, creation/<type>/<source>.json, packs/<name>/, validate.ts, index.ts (loaders),
                             creation.test.ts (the volkus pregens resolve in the creation catalogue)
aspire-apphost/     apphost.mts: optional Aspire TypeScript AppHost (Postgres → api → web, with a dashboard)
```

## Commands

Run these from the repo root unless noted.

```bash
bun install
bun run dev                 # whole stack via Turborepo (turbo.json): dev:db first, then api + web in parallel
bun run dev:db              # Postgres in Docker on localhost:5434 (5432/5433 are taken on this machine)
bun run dev:api             # NestJS on :4000, watches src
bun run dev:web             # Next on :3000; proxies /api and /socket.io to :4000
aspire run                  # optional: same stack with a dashboard (logs, OTel traces), health-gated startup.
                            # TypeScript AppHost, no .NET SDK. Podman needs DOTNET_ASPIRE_CONTAINER_RUNTIME=podman.
                            # Turborepo still owns `build`; deploy unchanged. See docs/development.md §Aspire
cd apps/api && bun run seed volkus --owner user_2abc…       # packages/data/packs/volkus, that Clerk user as GM; prints /c/<id>

bun run typecheck           # shared + api + web (with test, the Husky pre-commit hook: .husky/pre-commit)
bun run lint                # ESLint (eslint.config.mjs): typescript-eslint everywhere, Next + React rules in apps/web
bun run format              # Prettier, width 120 (format:check only checks). Skips *.md and packages/data JSON
bun run test                # unit tests: rules functions, command parser
bun run validate            # every threat JSON against the schema, with bestiary progress
bun run test:smoke          # end-to-end; needs dev:db, and dev:api with CLERK_TEST_SECRET set
cd apps/api && bun run db:generate                           # after editing any src/**/*.schema.ts
```

- `apps/api/.env` holds `DATABASE_URL`, `ADMIN_KEY`, `WEB_ORIGIN` (comma separated: localhost and the LAN origin),
  `COOKIE_SECURE`, `PORT`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY` and, in dev only, `CLERK_TEST_SECRET` (the smoke test's
  fake Clerk tokens; the api refuses to start with it in production). Bun loads it automatically. See `.env.example`.
- `apps/web/.env.local` holds `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. Without them every page is a
  500 "Missing publishableKey". Clerk setup (session-token claims, the creator role) is in `docs/development.md`.
- The app is pre-release, so schema changes may regenerate the migrations: delete `apps/api/drizzle/`, run
  `db:generate`, then `docker compose down -v`. **Once there is real campaign data, add migrations instead.**
  `0001` (accounts) is additive; old GM tokens still sit in `access_token` but open nothing.

## Standards

These are binding; follow them when writing code and use them when reviewing:
- **Backend:** `.claude/backend-code-style.md` (NestJS, Drizzle, Bun).
- **Frontend:** `.claude/frontend-code-style.md` (Next.js 16, React 19, plain CSS tokens).
- **Reviews:** `.claude/code-review.md` (checklist and block-merge rules).
- **Review procedure:** the `/review` command (`.claude/commands/review.md`), which falls back to the local diff when
  there's no PR.
- **Multi-file investigation:** the `codebase-navigator` agent.

## Conventions and gotchas

- **Clerk only through `@wg/auth`.** Apps never list `@clerk/*` as a dependency. Bun's isolated linker then makes a
  direct import fail typecheck and runtime. A new Clerk API gets a wrapper in `packages/auth`, in the subpath for its runtime.
- **Adding an action** touches these places:
  1. its zod schema in `packages/shared/src/actions.ts`
  2. its handler in the owning feature's `*.actions.ts`
  3. its `case` in `table/table.dispatch.ts` (a missing case is a type error)
  4. `touches()`, if it changes the codex
  5. `PLAYER_ACTIONS` / `authorize()`, if players may send it
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
- **Deploy** (`docs/deploy.md`): CI builds private GHCR images, then "Pull & redeploy" in Dockhand; the VPS never
  builds, so `docker-compose.prod.yml` never gets `build:`. There's no Caddy: Next's rewrites proxy `/api` and `/socket.io` in prod too.
- **Clerk needs internet at the table**, for sign-in and the session refresh about every 60 s. Guests on a QR token
  depend only on the api.
- **Next rewrites:** `skipTrailingSlashRedirect` plus an explicit `/socket.io/` rewrite are required, otherwise
  socket.io's handshake gets a 308 or 404.
- **Rate limits** (`apps/api/src/core/rate-limit.ts`, in-process): 60/min per IP on `/api/join`, `/api/guest` and
  `/api/invites`, 120/min **per caller** (their session, falling back to the IP) on `/api/library`, `/api/creation`,
  `/api/rules` and `/api/campaigns/import`, because the library builder autosaves and a whole table shares one IP,
  60 socket connects/min per IP, 120 actions/min per socket (the admin key is exempt, for `seed.ts`).
  The IP is `CF-Connecting-IP`, so Next's server-side fetches to the api must forward it.
- **Style:** match the surrounding code. Comments say *why*, with page cites. Deliberate shortcuts are marked
  `// ponytail: <ceiling>, <upgrade path>`.

## Not built yet

- Advanced Creation (Core pp.38–39)
- Server-side undo history (client undo is inverse deltas)
- Upgrades fitted to **armour** (12 of the 62 are armour's: the sheet's `armour` carries no upgrades, so fitting one is
  refused). Weapons take them (`character.fitUpgrade`, Core p.227)
- A purchase history for advancement: what a character bought is in its build, when it bought it isn't recorded
