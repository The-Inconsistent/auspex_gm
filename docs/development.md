# Development

Setup, day-to-day commands, testing and the gotchas that have already bitten. For how the system fits together, see
[architecture.md](architecture.md).

## Prerequisites

| Tool | Notes |
| --- | --- |
| [Bun](https://bun.sh) 1.3+ | Package manager, runtime and test runner. **Don't use npm or pnpm** |
| Docker | Runs Postgres 17 (`docker-compose.yml`) |
| TypeScript **5.9** | Pinned. TS 7 breaks the Next and Nest toolchains |
| poppler (`pdftotext`, `pdftoppm`) | Only needed to transcribe from the books ([data.md](data.md)) |

## First run

```bash
bun install
cp apps/api/.env.example apps/api/.env      # then set ADMIN_KEY
bun run dev:db                              # Postgres on 127.0.0.1:5434, waits until healthy
bun run dev:api                             # :4000, bun --watch; runs migrations on startup
bun run dev:web                             # :3000, proxies /api and /socket.io to :4000

cd apps/api && bun run seed volkus          # prints the GM link
```

## Environment

`apps/api/.env`, which Bun loads automatically:

| Var | Purpose | Dev value |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection | `postgres://wg:wg@localhost:5434/wg` |
| `ADMIN_KEY` | Required to create campaigns (`x-admin-key`). Also used by the scripts and the smoke test | anything private |
| `WEB_ORIGIN` | Socket.IO CORS origin, and the host in printed GM links | `http://localhost:3000` |
| `COOKIE_SECURE` | `true` behind HTTPS. Keep it `false` on plain http, or the browser drops the cookie | `false` |
| `PORT` | api port | `4000` |

Web (optional): `API_ORIGIN` is where Next reaches the api server-side, for the rewrites and `/api/me`. The default
is `http://localhost:4000`.

**Playing over the LAN:** open the web app at the machine's LAN address (`http://192.168.x.y:3000`). Set `WEB_ORIGIN`
to that address so the printed links and QR codes point there, then restart the api.

## Commands

Run these from the repo root unless noted.

| Command | What it does |
| --- | --- |
| `bun run typecheck` | `tsc` for shared, api and web. Must pass before a commit |
| `bun run test` | Unit tests (`bun test packages apps/web`): rules functions, command parser, libs |
| `bun run validate` | Every threat and pack against its schema, plus bestiary progress |
| `bun run test:smoke` | End-to-end GM and player session over Socket.IO. Needs `dev:db` and `dev:api` |
| `cd apps/web && bun run build` | Production build. Catches what `tsc` doesn't, such as Server/Client boundaries |
| `cd apps/api && bun run seed <pack>` | New campaign from `packages/data/packs/<pack>` |
| `cd apps/api && bun run create-campaign "<name>" <tier>` | Empty campaign |
| `cd apps/api && bun run db:generate` | Migration from the `src/**/*.schema.ts` files |

## Database and migrations

- The tables live next to their feature (`<feature>/<feature>.schema.ts`). `drizzle.config.ts` globs them, and
  `core/db.ts` imports each one for the query builder. **A new feature schema file must be added to `core/db.ts` too.**
- Migrations in `apps/api/drizzle/` are applied automatically when the api starts.
- **Pre-release:** there's a single migration, and it may be regenerated:

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
| Login works on localhost but not the LAN | `COOKIE_SECURE=true` on plain http, or `WEB_ORIGIN` pointing at localhost |
| Player page stuck on "NO SIGNAL · RECONNECTING" | The api is down. The client retries a DB refusal every 3 s and reloads on `unauthorized` |
| `enum` doesn't compile | Intended: `erasableSyntaxOnly` is on. Use a `z.enum` in shared, or an `as const` object |
| Upgrading TypeScript breaks everything | Stay on 5.9 |
| Read tool refuses a book PDF | Over 100 MB. Render the page with `pdftoppm` ([data.md](data.md)) |

## Not built yet

- Docker/Caddy deployment ([architecture.md](architecture.md#deployment-planned))
- Doctors of Doom import
- a rules reference in the player app
- an items tracker
- rate limiting
- server-side undo
