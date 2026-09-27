# Architecture

How the pieces fit together. For the internals of each part, see [backend.md](backend.md), [frontend.md](frontend.md),
[game-logic.md](game-logic.md) and [data.md](data.md).

## Constraints that shaped it

| Constraint | Consequence |
| --- | --- |
| Played **in person** with real minis and terrain | No maps, dice or chat. The app tracks state and enforces limits; the table rolls the dice |
| GM on a tablet, players on phones | Mobile-first web app, no install. Screens stay awake (Wake Lock) |
| Several people tap at the same time | The server decides. Counters change by **delta**, never by overwriting a value |
| Players must not see what the GM hides | The server redacts every snapshot sent to players. The client never receives hidden data |
| Book content is copyrighted | No public pages. A table needs a seat (a Clerk account or a guest token), and the repo is private |
| Rules must match the books | Rules live in one tested package, and each one cites its page |

## Shape

```text
 phones / tablet (browser)
        │  HTTPS: pages, /api/*, /socket.io/*
        ▼
 Pangolin (prod TLS) ─▶ Next rewrites (dev and prod)
        │
        ├──▶ apps/web   Next.js 16 + Clerk. Server Components resolve who you are; client apps render the table
        │
        └──▶ apps/api   NestJS on Bun (verifies Clerk session tokens itself)
                ├─ REST       lobby, create campaign (creator or admin key), invites, guest join (token → cookie),
                │             your seat (me), threats (GM only)
                └─ Socket.IO  the live table: every change is an `action`, every result is a snapshot
                        │
                        ▼
                  Postgres 17 (Drizzle). All live state; the api keeps none in memory
```

Both apps depend on these workspace packages:

- **`packages/shared`**: zod schemas for everything that crosses the wire, plus the pure rules functions. It's
  imported as TypeScript source, so web and api run the same rules code.
- **`packages/auth`**: the only package that depends on Clerk. It has one subpath per runtime: `api` (verify session
  tokens), `next` (proxy, the caller's token), `react` (provider and Clerk components). Apps don't list `@clerk/*`, so
  Bun's isolated linker rejects a direct import.
- **`packages/data`**: threat stat blocks and content packs. Only the api loads it; the web gets threats from
  `/api/campaigns/:id/threats`.

## One mutation path

Every change to the game, from both GM and players, is a socket `action` event. It is one member of the zod `Action`
union in `packages/shared/src/actions.ts`.

```text
client send(action) ──▶ gateway ──▶ parse (zod) ──▶ db.transaction( authorize(ctx, action) → applyAction )
                                                                                     │ commit
      ◀── ack { ok, id? | error } ◀──────────────────────────────────────────────────┤
      ◀── "state" / "codex" snapshots to GM room + redacted to players room ◀─────────┘
```

- **Serialized per campaign.** An in-process promise queue runs one action at a time for each campaign. A check-then-act
  inside a handler is safe because of this. The queue assumes a **single api instance** (see the `ponytail:` note in
  `table.gateway.ts`).
- **Deltas, clamped in SQL.** `+2 Wounds` becomes `greatest(0, wounds + 2)`, and pools are capped by the rules, so two
  simultaneous taps both count.
- **Refusals** (`ActionError`) come back as `{ ok: false, error }`, and the UI shows the reason. Once the transaction
  has committed, the client is told "ok" even if the broadcast afterwards fails, so a retap can't apply the change twice.
- There are no Server Actions and no REST writes for game state. REST only covers setup (creating a campaign),
  identity (join, me, the lobby) and invites. Accepting an invite changes who sits at a table, so it runs through
  `TableGateway.mutate`: the same per-campaign queue, then the same broadcast.

## Two snapshots, full state

After each action, the server sends the **whole** snapshot that the action touched. There is no patching.

| Snapshot | Contents | Sent when |
| --- | --- | --- |
| `state` (`LiveState`) | campaign and pools, characters, the active encounter with its combatants, and `access` (members and open invites) | combat, character, pool and access actions, and an accepted invite |
| `codex` (`Codex`) | factions, adventures and beats, locations, NPCs, handouts, sessions | codex and prep actions (`touches()` decides) |

Keeping them separate means a Wounds tap doesn't resend every NPC. A reconnecting client gets both snapshots on
connect, so there's no resync logic. Each snapshot is a few KB.

Each campaign has two rooms: `c:<id>:gm` gets snapshots as-is, and `c:<id>:players` gets them through `toPlayerView` /
`toPlayerCodex`. Those functions drop hidden threats, bars-only threat stats, GM notes, secrets, factions, adventures and hidden
entries. What's hidden is listed in [game-logic.md](game-logic.md). Both take the viewer's `characterId`, so the gateway
emits to each player socket, computing one view per character: a handout's `audience` and an Agent's `objectives`
reach only their own player.

## Access: accounts and guests

Three kinds of caller reach a table:

| Who | Proof | Seat |
| --- | --- | --- |
| Signed-in user | Clerk session token: the `__session` cookie, or a Bearer header from server-side Next | a `membership` row: `gm` or `player`, plus a character |
| Guest | a per-character player token (`access_token`) in the httpOnly `wg_token` cookie | player only |
| Script or test | `ADMIN_KEY` | `POST /api/campaigns` with `ownerUserId`, and a GM socket with `auth: { adminKey, campaignId }` |

There are no GM links: the GM is always a signed-in member. A Clerk user with `publicMetadata.role = "creator"` (set by
hand in the Clerk Dashboard) can start a game in the lobby and is seated as its GM.

```text
creator ──POST /api/campaigns──▶ campaign + membership (gm) ──▶ /c/<id>
GM: invite.create ──▶ code (shown once) ──▶ QR / link  /invite/<code>
/invite/<code> ──POST /api/invites/:code/accept──▶ membership (signed in) | guest token + Set-Cookie wg_token
GM: token.issue ──▶ guest token ──▶ QR code  /join/<token> ──POST /api/join──▶ Set-Cookie wg_token ──303──▶ /c/<id>
/c/<id> (Server Component) ──GET /api/campaigns/:id/me──▶ { campaignId, role, characterId, userId } ──▶ GM app | player app
socket handshake { campaignId } + cookies ──▶ middleware resolves ctx before the connection is accepted
```

- The api verifies Clerk tokens locally with `verifyToken` and `CLERK_JWT_KEY` (no network call), and checks the
  `azp` claim against `WEB_ORIGIN`. The user's name and creator role come from custom session-token claims (see
  [development.md](development.md#clerk)).
- The DB stores only SHA-256 hashes of guest tokens and invite codes, so a lost one is replaced, not recovered.
- `member.remove` deletes a seat and **disconnects** that user. `token.revoke` revokes a character's guest tokens and
  disconnects only guest sockets; a member playing that character keeps their seat.
- Players never receive invite codes or the invite list (`toPlayerView` clears `access.invites`).
- Clerk needs internet at the table, for sign-in and for the session refresh about every 60 s. A guest on a QR token
  depends only on the api.
- Every query is scoped to the caller's `ctx.campaignId`, and a row id sent by the client is looked up inside that
  campaign before it's used. That includes the cross-references `codex.save` stores: a beat's adventure, location,
  NPC and handout ids, an NPC's faction, and a location's parent. See [backend.md](backend.md).

## One app, two views

The GM board and the player view are one Next app with two routes: `/` is the lobby, and `/c/<campaignId>` is a
table. `app/c/[campaignId]/page.tsx` asks `/api/campaigns/:id/me` for the caller's seat, and the seat decides the view:
`GmApp` for the GM, `PlayerApp` for a player. The code trees are separate (`components/gm/`, `components/player/`), and Next loads only the
client code for the view it rendered.

The two aren't separate apps because the separation that matters is in the **data**: the server redacts every player
snapshot, and the bestiary is fetched server-side for the GM only. So a player's browser never receives hidden data,
whichever app renders it. Two apps would duplicate the sign-in and join flow, the cookies, the socket hook, the UI kit and the
theme. They would also need two builds, two deploys, and either two origins or path-prefix routing, and an invite
would have to know which app to open.

If the views ever need their own URLs or install manifests (landscape tablet, portrait phone), split the table route
in two (`/c/<id>/gm` and `/c/<id>/play`), each checking the seat on the server, rather than into two apps.

## Static data, snapshotted

The api loads `packages/data` at startup and fails fast on a malformed file. When a threat joins an encounter, its stat
block at the campaign's Tier is **copied into the combatant row**. Fixing a threat file later doesn't change a fight
already in progress.

## Deliberate limits

These are marked `ponytail:` in the code, with an upgrade path.

| Limit | Ceiling | Upgrade path |
| --- | --- | --- |
| In-process action queue | one api instance | Postgres advisory locks |
| Full-snapshot broadcast | fine at a few KB | patches if the payload grows |
| Client undo = the exact difference (shared rules, `raw` adjust), read against the state at tap time | doesn't take back an automatic Prone; a raced tap diffs older state | server-side history |
| Prepared-encounter row cap (`MAX_ENCOUNTER_ROWS`) | 60 combatants per beat, a Mob counts as 1 | raise it, or batch the inserts |

## Deployment

Its own Dockhand stack on the green-orange VPS: web (Next `output: "standalone"`) published behind Pangolin's TLS, the
api internal-only, and the green-orange Postgres. The Next rewrites route `/api` and `/socket.io` to the api in
production too, websockets included, so there is no Caddy. See [deploy.md](deploy.md).
