# Deploy

Production runs on the green-orange VPS (`newt-01`) as its own Dockhand stack, `auspex`, following the killteam-gm
pattern. There's no new hosting cost: the VPS, Pangolin, Dockhand, GHCR, GitHub Actions and Clerk Hobby are all free
or already paid for.

```text
phone ──HTTPS──▶ Pangolin (TLS) ──▶ host :3004 ──▶ web (Next standalone)
                                                   ├─ pages, SSR apiGet ──▶ api:4000
                                                   └─ rewrites /api/*, /socket.io/* (websockets too) ──▶ api:4000
                                                                                         └──▶ postgres (green-orange_internal)
```

| | |
|---|---|
| URL | `https://auspex.ydothien.work`, a Pangolin resource pointing at host `:3004`, **with Pangolin SSO off** (guests on a QR code have no Pangolin login; Clerk and guest tokens are the auth) |
| Images | `ghcr.io/junmaxwell/glory-gm-{api,web}:latest`, **private**: they carry book text |
| Build | `.github/workflows/images.yml`, on a push to `main` that touches app code |
| Deploy | **By hand:** "Pull & redeploy" on the `auspex` stack in Dockhand |
| Stack | `docker-compose.prod.yml` (Dockhand git stack `auspex-gm`, compose path set to that file). Dockhand's stack name overrides the compose `name:`, so containers are `auspex-gm-api-1` and `auspex-gm-web-1` |
| Database | `wg`, owned by role `wg`, inside `green-orange-postgres-1` (Postgres 16) |

## Why this shape

- **The api needs a long-lived process** (Socket.IO), so serverless hosts (Vercel, Workers) are out.
- **Web sits next to it, on one origin.** The guest cookie is httpOnly and SameSite=Lax, and the browser opens
  `/socket.io` on the page's own host. Splitting web onto Vercel or Cloudflare would mean cross-site cookies and
  CORS, and Vercel rewrites don't carry websockets.
- **No Caddy.** Next's rewrites to an external URL proxy websocket upgrades (`ws: true` in Next's `proxy-request`).
  A websocket held for 150 s through the web container stayed up, with pings answered, so the proxy's 30 s timeout
  doesn't bite: Socket.IO pings every 25 s. Only `web` is published, and the api stays internal like Postgres.
  If sockets ever start dropping in prod, add a Caddy container that routes `/api` and `/socket.io` to `api:4000`.
- **No deploy webhook.** killteam-gm's Pangolin tunnel + Dockhand webhook answered 403, so it was dropped. A button
  in Dockhand is enough for a hobby app.

## First-time setup

Run on the VPS (the `vps-ssh` shell):

```bash
# 1. Disk: it was at 88%. Drop images no container uses that are over a week old (keeps recent rollbacks).
docker image prune -a --filter "until=168h"

# 2. Database. The password must be URL-safe: it's interpolated into DATABASE_URL.
PW=$(openssl rand -hex 24); echo "$PW"   # goes into Dockhand as WG_DB_PASSWORD
docker exec green-orange-postgres-1 psql -U postgres -c "CREATE USER wg PASSWORD '$PW'" -c "CREATE DATABASE wg OWNER wg"
```

3. Add `wg` to the nightly `pg_dump` crontab (green-orange `DEPLOY.md` §8).

Then, in Clerk:

4. Create the **production** instance for `auspex.ydothien.work`.
5. Add the CNAME records it lists in Cloudflare, set to **DNS only** (grey cloud). Clerk's DNS check fails behind
   the proxy.
6. Re-create the session-token claims and the `creator` role ([development.md](development.md#clerk)).

In GitHub (`JunMaxwell/auspex_gm`):

7. In the **`prod` environment** (Settings → Environments → prod), add the **variable** `CLERK_PUBLISHABLE_KEY` =
   `pk_live_…`. It must be a variable, not a secret: the workflow reads `vars.`.
8. Run **Build images** once (Actions → Build images → Run workflow).

In Dockhand:

9. Add a git stack for `JunMaxwell/auspex_gm` with compose file `docker-compose.prod.yml`, and set its env:

   | Var | Value |
   |---|---|
   | `WG_DB_PASSWORD` | from step 2 |
   | `ADMIN_KEY` | `openssl rand -hex 24`; for `seed.ts` and scripts only |
   | `CLERK_SECRET_KEY` | `sk_live_…` |
   | `CLERK_JWT_KEY` | the production PEM, pasted in any shape (`pemBody()` in `packages/auth` strips the header and all whitespace) |

   GHCR pull already works: the classic PAT logged in inside the `dockhand` container covers the user's own
   packages.

In Pangolin:

10. Add a public resource `auspex.ydothien.work` → host `:3004`, the same way as `kt-api.ydothien.work`. Turn SSO
    off.

Finally, back in the VPS shell:

11. Seed the first campaign:

    ```bash
    docker exec auspex-gm-api-1 bun scripts/seed.ts volkus --owner <clerk user id>
    ```

## Checking a deploy

- `https://auspex.ydothien.work` loads, and Clerk sign-in works. The lobby rendering proves SSR `apiGet` reaches
  `api:4000`.
- In DevTools → Network, `/socket.io/?EIO=4&transport=websocket` returns **101** and stays open.
- Open a guest QR on a phone over mobile data: the `wg_token` cookie is set with `Secure`, and the player view loads.
- A +1 Wound on the tablet shows on the phone live.
- On the VPS, check `docker stats auspex-gm-web-1 auspex-gm-api-1` and `df -h /`.

## Running the prod stack locally

Build both images, tag them with the GHCR names, and point the api at the dev database's network:

```bash
docker build -f apps/api/Dockerfile -t ghcr.io/junmaxwell/glory-gm-api:latest .
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_… -t ghcr.io/junmaxwell/glory-gm-web:latest .
set -a; source apps/api/.env; set +a
CLERK_TEST_SECRET= WG_DB_PASSWORD=wg ADMIN_KEY=test WEB_ORIGIN=http://localhost:3004 COOKIE_SECURE=false \
  PG_NETWORK=wrath_glory_default docker compose -f docker-compose.prod.yml -p auspex-local up -d
```

`bun run test:smoke` can't run against these images: they set `NODE_ENV=production`, and the api refuses
`CLERK_TEST_SECRET` in production.

## Gotchas

- **Signed in but every campaign says NO ACCESS** means the api can't verify the Clerk token, and `verifySession`
  treats that as signed out. Usual causes are a `CLERK_JWT_KEY` from the wrong Clerk instance (dev vs prod), or a
  `WEB_ORIGIN` that isn't the site's exact origin. A PEM mangled by the env editor used to cause it too: Dockhand
  turned the key's newlines into spaces. `pemBody()` now handles that.
- **Cloudflare 523 = the DNS record points at the wrong origin.** The `auspex` record must target the Pangolin
  server, exactly like `kt-api`: `prp.hdc-cloud.org` (`42.96.17.33`), proxied. To test Pangolin while bypassing
  Cloudflare, run `curl -k --resolve auspex.ydothien.work:443:42.96.17.33 https://auspex.ydothien.work/`.
- **A 500 on every page with "Missing publishableKey" in `docker logs auspex-gm-web-1`** means the image was built
  without the `CLERK_PUBLISHABLE_KEY` variable in the `prod` environment. The web Dockerfile now refuses to build without it.
- **Never `build:` in the compose.** Dockhand's plain `up -d` would build once and then serve that stale image
  forever.
- **The web image bakes in two values:** the Clerk publishable key, and `API_ORIGIN=http://api:4000` for the
  rewrites (Next freezes them into the routes manifest). Changing either means a rebuild.
- **The web build runs on Node, not Bun.** Bun installs the dependencies, but Bun 1.3 crashes with SIGTRAP running
  `next build` when there's no `node` binary.
- **The api image skips peer dependencies** (`--omit=peer`). `@wg/auth` lists Next as a peer for its web subpath,
  and Next is ~370 MB the api never loads.
- **The CI build has provenance off.** Its attestation would be stored as an untagged GHCR version, and the
  untagged-version prune would delete it, breaking `:latest`.
- **Prod Postgres is 16; dev is 17.** Drizzle's generated SQL is plain, so this doesn't matter today. Moving dev to
  16 needs `docker compose down -v`.
