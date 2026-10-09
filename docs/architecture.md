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
| Book content is copyrighted | No public pages. A table needs a seat (a Clerk account or a guest token); the builder's catalogue outside a table needs a Clerk account, and Clerk is Invite-only. The repo is private. Printed cards follow the screen's gates: the GM's browser builds the PDF from what `GmApp` already holds, and nothing is uploaded or stored |
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
                │             your seat (me), threats (GM only), your character library (signed in, no campaign)
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
  identity (join, me, the lobby), invites and the character library. Accepting an invite changes who sits at a table,
  so it runs through `TableGateway.mutate`: the same per-campaign queue, then the same broadcast. A library character
  (issue #14) belongs to no table and is nobody's live state, so it writes over plain REST scoped to its owner —
  the documented exception, in [backend.md](backend.md) §3.1.

## Two snapshots, full state

After each action, the server sends the **whole** snapshot that the action touched. There is no patching.

| Snapshot | Contents | Sent when |
| --- | --- | --- |
| `state` (`LiveState`) | campaign and pools, characters, the active encounter with its combatants, and `access` (members and open invites) | combat, character, pool and access actions, and an accepted invite |
| `codex` (`Codex`) | factions, adventures and beats, locations, NPCs, handouts, sessions | codex and prep actions (`touches()` decides) |

Keeping them separate means a Wounds tap doesn't resend every NPC. A reconnecting client gets both snapshots on
connect, so there's no resync logic. Each snapshot is a few KB.

Each campaign has two rooms: `c:<id>:gm` gets snapshots as-is, and `c:<id>:players` gets them through `toPlayerView` /
`toPlayerCodex`. Those functions drop hidden threats, bars-only threat stats, GM notes, secrets, factions, adventures not shown to the party
(and every adventure's premise and scenes) and hidden entries. What's hidden is listed in [game-logic.md](game-logic.md). Both take the viewer's `characterId`, so the gateway
emits to each player socket, computing one view per character: a handout's `audience` and an Agent's `objectives`
reach only their own player.

## Book pages, served from the GM's tablet

Players can read a cited page ("Core p.113") while the GM's tablet serves that book. The PDFs never leave the GM's
device: the GM picks them in the BOOKS tab (`gm/books`, `hooks/use-book-server`), and pdf.js renders one page on
request. These are socket events outside the action path, since they change no game state:

```text
GM tablet ── book:serving { sources } ──▶ gateway: socket.data.books ──▶ book:available { sources } to both rooms
player ── book:request { source, page } ──▶ gateway ──▶ a GM socket serving that source (ack, 15 s)
player ◀── ack { ok, image: JPEG } ◀── gateway ◀── GM tablet renders printed page + BOOKS[source].offset
```

- Nothing is stored. The gateway keeps only `socket.data.books`, so a GM tab closing or losing signal stops serving,
  and `handleDisconnect` turns the players' links back into text.
- Only a GM socket's ack can answer, and the image goes back in the asker's own ack, so no other player receives it.
- `book:request` is limited to 30 per minute per socket, and a page is capped at `MAX_PAGE_BYTES`.
- Cites are parsed from the text the sheet stores (`parseCite`). The UI is `PageCite` inside `BooksProvider`.

## The pause card, a phone's anonymous stop signal

A player's phone can ask the table to stop without saying who (issue #194, rules-flow §11.157). It's the other socket
event outside the action path. An action would put the sender's `ctx` into the queue and `applyAction`, the one place
that must never know it, and the card changes no game state anyway:

```text
player ── pause:signal (no body, no ack) ──▶ gateway: pauseRelay (table.pause.ts) ──▶ pause:signal { at } to the GM room
```

- Only a `player` seat (member or guest) sends one. The GM's own sockets and the table screen are ignored.
- The payload is `{ at }`, nothing else: no socket, user or character id. Nothing is stored and nothing is logged.
- One per socket per 10 s and 6 per minute per campaign (`PAUSE_WINDOW_MS`, `PAUSE_TABLE_MAX`). An over-limit tap is
  dropped silently, and there is no ack at all, so the sender can't tell a dropped tap from a relayed one by timing.
- The players room never hears it. The GM tablet shows `PauseBanner` until DISMISS; a reload clears it.
- Honest limit: the server can't make it more anonymous than the room. At a table of three, the GM may guess.

## Access: accounts and guests

Three kinds of caller reach a table:

| Who | Proof | Seat |
| --- | --- | --- |
| Signed-in user | Clerk session token: the `__session` cookie, or a Bearer header from server-side Next | a `membership` row: `gm` or `player`, plus a character |
| Guest | a per-character player token (`access_token`) in the httpOnly `wg_token` cookie | player only |
| Table screen | a `screen` token (`access_token`, no character) in the same cookie, from PARTY's SCREEN QR | `screen`: read-only |
| Script or test | `ADMIN_KEY` | `POST /api/campaigns` with `ownerUserId`, and a GM socket with `auth: { adminKey, campaignId }` |

There are no GM links: the GM is always a signed-in member. A Clerk user with `publicMetadata.role = "creator"` (set by
hand in the Clerk Dashboard) can start a game in the lobby and is seated as its GM. `role = "admin"` is a creator who also
reaches `/admin` and, at any game without a seat of their own, acts as its GM (`Ctx.admin`; PARTY doesn't list them, and
what they do is logged in `admin_event`). Roles are only ever changed in Clerk, never in the app.

```text
creator ──POST /api/campaigns──▶ campaign + membership (gm) ──▶ /c/<id>
GM: invite.create ──▶ code (shown once) ──▶ QR / link  /invite/<code>
/invite/<code> ──POST /api/invites/:code/accept──▶ membership (signed in) | guest token + Set-Cookie wg_token
GM: token.issue ──▶ guest token ──▶ QR code  /join/<token> ──POST /api/join──▶ Set-Cookie wg_token ──303──▶ /c/<id>
/c/<id> (Server Component) ──GET /api/campaigns/:id/me──▶ { campaignId, role, characterId, userId, admin } ──▶ GM app | player app
socket handshake { campaignId } + cookies ──▶ middleware resolves ctx before the connection is accepted
```

- The api verifies Clerk tokens locally with `verifyToken` and `CLERK_JWT_KEY` (no network call), and checks the
  `azp` claim against `WEB_ORIGIN`. The user's name and creator role come from custom session-token claims (see
  [development.md](development.md#clerk)).
- The DB stores only SHA-256 hashes of guest tokens and invite codes, so a lost one is replaced, not recovered.
- `member.remove` deletes a seat and **disconnects** that user. `campaign.delete` disconnects everyone at the game. `token.revoke` revokes a character's guest tokens and
  disconnects only guest sockets; a member playing that character keeps their seat.
- A table screen (a TV in the middle of the table) gets the players' view for no Agent (`toPlayerView(state, null)`),
  so no one's objectives or private handouts. `authorize()` refuses all its actions, and `/rules`, `/creation` and
  `book:request` refuse it. `screen.revoke` revokes every screen token and disconnects the screens.
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
