# Development

Setup, day-to-day commands, testing and the gotchas that have already bitten. For how the system fits together, see
[architecture.md](architecture.md).

## Prerequisites

| Tool | Notes |
| --- | --- |
| [Bun](https://bun.sh) 1.3+ | Package manager, runtime and test runner. **Don't use npm or pnpm** |
| Docker or Podman | Runs Postgres 17 (`docker-compose.yml`), which `dev:db`, `dev`, `test:smoke` and [Aspire](#aspire) all need. Podman works: install `podman-docker` (or Podman Desktop) for the `docker` shim, or use `podman compose` |
| [Aspire](https://aspire.dev) CLI | Optional. A dashboard with per-resource logs and traces, and health-gated startup ([Aspire](#aspire)) |
| TypeScript **5.9** | Pinned. TS 7 breaks the Next and Nest toolchains |
| poppler (`pdftotext`, `pdftoppm`) | Only needed to transcribe from the books ([data.md](data.md)) |
| A [Clerk](https://clerk.com) application | Sign-in. The free Hobby plan is enough ([Clerk](#clerk)) |

## First run

```bash
bun install
cp apps/api/.env.example apps/api/.env      # then set ADMIN_KEY and the Clerk keys
cp apps/web/.env.example apps/web/.env.local  # then set the Clerk keys
bun run dev                                 # everything, via Turborepo (below)
# or one piece at a time:
bun run dev:db                              # Postgres on 127.0.0.1:5434, waits until healthy
bun run dev:api                             # :4000, bun --watch; runs migrations on startup
bun run dev:web                             # :3000, proxies /api and /socket.io to :4000

cd apps/api && bun run seed volkus --owner user_2abc…   # your Clerk user id; prints /c/<campaignId>
```

Or sign in at `http://localhost:3000` as a creator and start an empty game with **NEW GAME** in the lobby.

## Aspire

Optional alternative to `bun run dev`, for a dashboard with per-resource logs, OTel traces and metrics, health-gated
startup and container lifecycle. The AppHost is TypeScript (`aspire-apphost/apphost.mts`) — no C#, no .NET SDK.
Turborepo still owns `build`, and deploy is unchanged.

```bash
curl -sSL https://aspire.dev/install.sh | bash   # or install.ps1 on Windows; adds ~/.aspire/bin to PATH
aspire certs trust                               # once; opens an OS dialog, so run it in your own terminal
aspire run                                       # Postgres → api → web, in order
```

The installer edits your user PATH, so **an already-open shell won't see `aspire`** — open a new one, or
`export PATH="$HOME/.aspire/bin:$PATH"`.

It orchestrates the same three things `bun run dev` does:

| Resource | How |
| --- | --- |
| `postgres` | Its own container, `17-alpine`, host port 5434, user/password/db all `wg` — matching `docker-compose.yml`, so `apps/api/.env` and drizzle-kit keep working. The volume is **separate from compose's**, so the two hold different data |
| `api` | `bun run dev` in `apps/api`, port 4000. Only `DATABASE_URL` is injected, from `db.uriExpression()` (`postgresql://…`); everything else still comes from `apps/api/.env` — `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `WEB_ORIGIN`, `ADMIN_KEY`. Delete that file and sign-in silently fails. Waits for Postgres |
| `web` | `next dev` in `apps/web`, port 3000, unproxied so it binds every interface (phones at the table reach it by LAN address). Waits for the api. Still needs Clerk keys in `.env.local` ([Clerk](#clerk)) |

Ports are pinned deliberately: 4000 and 3000 are what Next's rewrites, `WEB_ORIGIN` and Clerk's `authorizedParties`
assume. Both JS resources set `withBun({ install: false })` — an installer running inside `apps/*` hangs, because
`workspace:*` deps only resolve from a root `bun install`.

**Stop the compose Postgres first.** It holds the same port 5434 with the same credentials, and `bun run dev` leaves
it running after Ctrl-C. Otherwise Aspire's container can't bind and the api hangs on `waitFor(db)` — or worse, you
connect to whichever won the port and campaigns appear to vanish, because the two containers have separate volumes.

```bash
docker compose stop postgres
```

**Podman** needs `DOTNET_ASPIRE_CONTAINER_RUNTIME=podman`, since Aspire defaults to Docker.

## Clerk

Accounts come from Clerk. Guests with a QR token don't need one, but the GM does. One-time setup:

1. Create a Clerk application on the free **Hobby** plan, and enable the sign-in methods you want.
2. In the Dashboard, under **Sessions → Customize session token**, add these claims. The api reads the name and the
   creator role from the session token, so it never calls Clerk (`packages/auth/src/api.ts`):

   ```json
   { "metadata": "{{user.public_metadata}}", "name": "{{user.full_name}}", "username": "{{user.username}}" }
   ```

3. Sign up once in the app, then under **Users →** your user, set **public metadata** to `{ "role": "creator" }`. Only
   creators see NEW GAME in the lobby. There's no in-app way to grant it; set it by hand for each GM.
4. Copy the keys from **API keys**:

   | File | Vars |
   | --- | --- |
   | `apps/web/.env.local` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` |
   | `apps/api/.env` | `CLERK_SECRET_KEY`, `CLERK_JWT_KEY` (the PEM public key, for verifying sessions without a network call) |

5. Your Clerk user id (`user_…`, under **Users**) is what `seed --owner` takes.

Without the web keys, every page answers 500 with "Missing publishableKey".

`CLERK_TEST_SECRET` in `apps/api/.env` is **dev/test only**: it lets the smoke test act as signed-in users with fake
tokens (`test.<secret>.<userId>.<creator|member>`), and the api refuses to start with it when `NODE_ENV=production`.

## Environment

`apps/api/.env`, which Bun loads automatically:

| Var | Purpose | Dev value |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection | `postgres://wg:wg@localhost:5434/wg` |
| `ADMIN_KEY` | Scripts only: `POST /api/campaigns` (`x-admin-key`, with `ownerUserId`) and an admin socket (`auth: { adminKey, campaignId }`). Used by `seed` and the smoke test | anything private |
| `WEB_ORIGIN` | The web origins, comma separated: Socket.IO CORS, Clerk's `authorizedParties`, and the host `seed` prints (the first entry) | `http://localhost:3000` |
| `CLERK_SECRET_KEY` | Clerk backend key | from the Clerk Dashboard |
| `CLERK_JWT_KEY` | Clerk's PEM public key: verifies session tokens locally | from the Clerk Dashboard |
| `CLERK_TEST_SECRET` | **Dev/test only.** Lets the smoke test sign in as fake Clerk users. The api refuses to start with it when `NODE_ENV=production` | any string, in dev |
| `COOKIE_SECURE` | `true` behind HTTPS. Keep it `false` on plain http, or the browser drops the cookie | `false` |
| `PORT` | api port | `4000` |

`apps/web/.env.local` holds `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (see `apps/web/.env.example`).
Optional: `API_ORIGIN` is where Next reaches the api server-side, for the rewrites and the server-side reads
(`app/server-api.ts`). The default is `http://localhost:4000`.

**Playing over the LAN:** open the web app at the machine's LAN address (`http://192.168.x.y:3000`). Add that address
to `WEB_ORIGIN`, next to localhost (`http://localhost:3000,http://192.168.x.y:3000`), then restart the api. Otherwise
the api rejects the Clerk session (wrong `azp`) and the socket's CORS check. QR codes use the address the GM's browser
is on, so open the table at the LAN address before showing them.

## Commands

Run these from the repo root unless noted.

| Command | What it does |
| --- | --- |
| `bun run typecheck` | `tsc` for shared, api and web. Must pass before a commit |
| `bun run test` | Unit tests (`bun test packages apps/web`): rules functions, command parser, libs |
| `bun run validate` | Every threat and pack against its schema, plus bestiary progress |
| `bun run test:smoke` | End-to-end GM, player, guest and invite sessions over Socket.IO. Needs `dev:db`, and `dev:api` running with `CLERK_TEST_SECRET` set |
| `bun run dev` | The whole stack: Turborepo runs the root `dev:db` task (Postgres, waits until healthy), then every workspace's `dev` in parallel (api and web). Ctrl-C stops the api and web; Postgres keeps running |
| `bun run build` | `turbo run build`: today that's the web production build. Catches what `tsc` doesn't, such as Server/Client boundaries |
| `aspire run` | The whole stack with a dashboard, as an alternative to `bun run dev` ([Aspire](#aspire)). Ctrl-C stops everything, Postgres included |
| `bun run aspire:build` | `tsc` for the AppHost. `aspire:dev` is the same in watch mode — neither one runs the stack |
| `cd apps/api && bun run seed <pack> --owner <clerk user id>` | New campaign from `packages/data/packs/<pack>`, with that user as GM. Prints `/c/<campaignId>` |
| `cd apps/api && bun run db:generate` | Migration from the `src/**/*.schema.ts` files |

## Database and migrations

- The tables live next to their feature (`<feature>/<feature>.schema.ts`). `drizzle.config.ts` globs them, and
  `core/db.ts` imports each one for the query builder. **A new feature schema file must be added to `core/db.ts` too.**
- Migrations in `apps/api/drizzle/` are applied automatically when the api starts.
- `0001` added accounts (`app_user`, `membership`, `invite`) without touching existing tables. Old GM tokens are still
  rows in `access_token`, but they no longer open anything.
- **Pre-release:** the migrations may still be regenerated:

  ```bash
  rm -rf apps/api/drizzle && (cd apps/api && bun run db:generate)
  docker compose down -v && bun run dev:db        # wipes all data
  ```

  **Once there is real campaign data, add migrations instead, and never rewrite them.**
- Inspect the data with `docker compose exec postgres psql -U wg wg`.

## Testing

| Layer | Where | What goes there |
| --- | --- | --- |
| Rules | `packages/shared/src/*.test.ts` | Every pure rules function, with page cites in the assertion messages |
| Web libs | `apps/web/lib/<name>/<name>.test.ts` | Parsers and formatters (command line, blocks, weapon line) |
| End-to-end | `apps/api/test/smoke.test.ts` | Every action and rule, **including its refusal cases**, against a real api and DB |
| Data | `bun run validate` | Every threat, pack reference and prepared-encounter threat resolves |

Tests use `node:test` and `node:assert`, run by `bun test`. Take test values from the same constants the code uses
(`poolMax`, `MAX_ENCOUNTER_ROWS`) rather than copying numbers.

## Standards and review

These are binding:

- [`.claude/backend-code-style.md`](../.claude/backend-code-style.md)
- [`.claude/frontend-code-style.md`](../.claude/frontend-code-style.md)
- [`.claude/code-review.md`](../.claude/code-review.md)

`/review` in Claude Code runs the review procedure: parallel reviewers, then confidence scoring. It reviews the PR, or
the local diff when there's no PR.

## Gotchas

| Symptom | Cause / fix |
| --- | --- |
| Socket connects then 308s, or `/socket.io/` 404s in dev | Next strips the trailing slash. `next.config` needs `skipTrailingSlashRedirect: true` **and** the explicit `/socket.io/` rewrite |
| `EADDRINUSE :4000` or changes not showing | A stale api process. `lsof -nP -iTCP:4000 -sTCP:LISTEN`, then kill it |
| Postgres port clash | 5432 and 5433 are taken on the main dev machine, hence 5434 |
| Login works on localhost but not the LAN | `COOKIE_SECURE=true` on plain http, or the LAN address missing from `WEB_ORIGIN` |
| Every page is a 500 "Missing publishableKey" | No Clerk keys in `apps/web/.env.local` ([Clerk](#clerk)) |
| Signed in, but no NEW GAME in the lobby | Your Clerk user has no `{ "role": "creator" }` public metadata, or the session-token claims are missing `metadata` ([Clerk](#clerk)) |
| Sign-in fails, or a signed-in player can't reload or reconnect, when the venue's internet is down | Clerk needs internet: for sign-in, and to refresh the session token about every 60 s. Guests on a QR token depend only on the api, so hand out GUEST QRs if the connection is unreliable |
| Smoke test fails with 401s on every signed-in call | The api isn't running with `CLERK_TEST_SECRET`, or the test sees a different value |
| Player page stuck on "NO SIGNAL · RECONNECTING" | The api is down. The client retries a DB refusal every 3 s and reloads on `unauthorized` |
| `enum` doesn't compile | Intended: `erasableSyntaxOnly` is on. Use a `z.enum` in shared, or an `as const` object |
| Upgrading TypeScript breaks everything | Stay on 5.9 |
| A lost invite or guest QR | Codes are stored as hashes only, so they can't be shown again. Make a new one on PARTY (and REVOKE the old one if it may have leaked). A GM's access is their Clerk account, so there's no GM link to lose |
| The printed `/c/<id>` link opens on this machine but not on the tablet | It uses the first `WEB_ORIGIN` entry, `localhost`. Swap the host for the LAN address, or put the LAN address first |
| Read tool refuses a book PDF | Over 100 MB. Render the page with `pdftoppm` ([data.md](data.md)) |
| `bun: command not found: next` | Bun linked no `node_modules/.bin`, and a plain `bun install` reports "no changes". `bun install --force` relinks. Workspace binaries land in the member dir (`apps/web/node_modules/.bin`), not the root |
| `npm error Unsupported URL Type "workspace:"` | npm can't resolve `workspace:*`. Use `bun install` — never npm |
| `bash: aspire: command not found` right after installing | The installer edited your user PATH; the open shell predates it. New terminal, or `export PATH="$HOME/.aspire/bin:$PATH"` |
| `aspire run` hangs at "Trusting certificates…" | It wants an OS dialog it can't show. Run `aspire certs trust` in an interactive terminal once |
| `bun --cwd <dir> run <script>` prints usage and exits 0 | Bun wants `--cwd=<dir>`. The space form is a silent no-op |
| Aspire starts nothing, socket refused | Podman machine is down, or Aspire is looking for Docker. `podman machine stop; podman machine start`, and set `DOTNET_ASPIRE_CONTAINER_RUNTIME=podman` |
| `aspire run` hangs on the api, or seeded campaigns "disappear" | The compose Postgres is still on 5434 from an earlier `bun run dev`. `docker compose stop postgres` — the two have separate volumes, so they are different databases with the same credentials |
| A join link answers "NO SIGNAL" rather than "LINK INVALID" | Not the token: the Next server couldn't reach the api, or got a 5xx (`app/join/[token]/route.ts`). A rejected token gives "LINK INVALID" instead. The api restarts on every file change under `bun --watch` |

## Not built yet

- The character builder, which replaces the planned Doctors of Doom import (its creation catalogue is done, `docs/data.md` §9)
- an items tracker
- rate limiting
- server-side undo
