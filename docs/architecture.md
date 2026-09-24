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
| Book content is copyrighted | No public pages. Everything needs an access token, and the repo is private |
| Rules must match the books | Rules live in one tested package, and each one cites its page |

## Shape

```text
 phones / tablet (browser)
        │  HTTPS: pages, /api/*, /socket.io/*
        ▼
 Caddy (prod, not built yet)  or  Next rewrites (dev)
        │
        ├──▶ apps/web   Next.js 16. Server Component resolves who you are; client apps render the table
        │
        └──▶ apps/api   NestJS on Bun
                ├─ REST       create campaign (admin key), join (token → cookie), me, threats (GM only)
                └─ Socket.IO  the live table: every change is an `action`, every result is a snapshot
                        │
                        ▼
                  Postgres 17 (Drizzle). All live state; the api keeps none in memory
```

Both apps depend on two workspace packages:

- **`packages/shared`**: zod schemas for everything that crosses the wire, plus the pure rules functions. It's
  imported as TypeScript source, so web and api run the same rules code.
- **`packages/data`**: threat stat blocks and content packs. Only the api loads it; the web gets threats from
  `/api/threats`.

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
- There are no Server Actions and no REST writes for game state. REST only covers setup (creating a campaign) and
  identity (join, me).

## Two snapshots, full state

After each action, the server sends the **whole** snapshot that the action touched. There is no patching.

| Snapshot | Contents | Sent when |
| --- | --- | --- |
| `state` (`LiveState`) | campaign and pools, characters, the active encounter with its combatants | combat, character and pool actions |
| `codex` (`Codex`) | factions, adventures and beats, locations, NPCs, handouts, sessions | codex and prep actions (`touches()` decides) |

Keeping them separate means a Wounds tap doesn't resend every NPC. A reconnecting client gets both snapshots on
connect, so there's no resync logic. Each snapshot is a few KB.

Each campaign has two rooms: `c:<id>:gm` gets snapshots as-is, and `c:<id>:players` gets them through `toPlayerView` /
`toPlayerCodex`. Those functions drop unrevealed threat stats, GM notes, secrets, factions, adventures and hidden
entries. What's hidden is listed in [game-logic.md](game-logic.md).

## Access without accounts

```text
admin key ──POST /api/campaigns──▶ GM token ──▶ GM link  /join/<token>
GM: token.issue ──▶ player token ──▶ QR code  /join/<token>
/join/<token> (Next route) ──POST /api/join──▶ Set-Cookie wg_token (httpOnly) ──303──▶ /
/ (Server Component) ──GET /api/me with cookie──▶ { campaignId, role, characterId } ──▶ GM app | player app
socket handshake ──cookie──▶ middleware resolves ctx before the connection is accepted
```

- The DB stores only SHA-256 hashes of tokens.
- `token.revoke` marks a character's tokens revoked and **disconnects** that player's socket.
- Every query is scoped to the caller's `ctx.campaignId`, and a row id sent by the client is looked up inside that
  campaign before it's used. That includes the cross-references `codex.save` stores: a beat's adventure, location,
  NPC and handout ids, an NPC's faction, and a location's parent. See [backend.md](backend.md).

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
| Client undo = inverse delta, read against the state at tap time | inexact if a counter was clamped at 0, or healing ended Dying | server-side history |
| Prepared-encounter row cap (`MAX_ENCOUNTER_ROWS`) | 60 combatants per beat, a Mob counts as 1 | raise it, or batch the inserts |

## Deployment (planned)

The target is a VPS running `docker compose` with Caddy (TLS), web (Next `output: "standalone"`), api and
Postgres, plus a nightly `pg_dump`. In production Caddy routes `/api` and `/socket.io` to the api, so the Next
rewrites only matter in development. This isn't built yet; see [development.md](development.md) for running it locally.
