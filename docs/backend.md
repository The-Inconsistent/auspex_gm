# Backend: `apps/api`

How the NestJS api works and how to change it safely. For the system overview see [architecture.md](architecture.md).
For the client side of the socket see [frontend.md](frontend.md). For the rules functions in `packages/shared` see
[game-logic.md](game-logic.md). Threat JSON and content packs are covered in [data.md](data.md), and running things
locally in [development.md](development.md). Code style is binding: `.claude/backend-code-style.md`.

NestJS 12 on Bun, run from source (`bun --watch src/main.ts`) with no build step. Drizzle ORM on Postgres 17. One
Socket.IO gateway carries every mutation; REST exists only for setup, login and the bestiary.

---

## 1. Boot

`src/main.ts`:

1. `runMigrations()` (`core/db.ts`) applies `apps/api/drizzle/` before Nest starts. A failed migration stops the process.
2. `NestFactory.create(AppModule)`. `AppModule` wires one controller (`CampaignController`) and one provider (`TableGateway`).
   There's no DI beyond that: feature code is plain functions that take a `tx`.
3. Global prefix `api`, so REST lives under `/api/*`. Socket.IO keeps its default path `/socket.io/`.
4. `enableShutdownHooks()`, then listen on `PORT` (default 4000).

`@wg/data` loads and zod-parses every threat JSON at import time, so a malformed file fails at startup ([data.md](data.md)).

REST has no CORS enabled: browsers reach it same-origin through the Next rewrites (dev) or Caddy (prod). The gateway sets
`cors: { origin: WEB_ORIGIN ?? false, credentials: true }`.

## 2. Module map

| Folder | Owns | Key exports |
|---|---|---|
| `core/` | DB client, error type, SQL helpers | `db.ts`: `db`, `Tx`, `runMigrations`. `errors.ts`: `ActionError`, `fail(msg): never`. `sql.ts`: `bump` (clamped delta), column builders `conditions`, `createdAt`, `body` |
| `auth/` | Login tokens and the cookie | `auth.schema.ts`: `accessToken`. `auth.service.ts`: `COOKIE` (`"wg_token"`), `Ctx`, `issueToken`, `resolveToken`, `readCookie` |
| `campaign/` | Campaign row, pools, sessions; all REST | `campaign.controller.ts`: `CampaignController`. `campaign.service.ts`: `isAdmin`, `createCampaign`, `listThreats`. `campaign.actions.ts`: `CampaignAction`, `applyCampaignAction`, `campaignTier`. `campaign.schema.ts`: `campaign`, `session`, `owned()` |
| `character/` | Characters and player tokens | `character.actions.ts`: `CharacterAction`, `applyCharacterAction`, `ownCharacter`. `character.schema.ts`: `character` |
| `encounter/` | Encounters, turns, combatants, starting a beat's fight | `encounter.actions.ts`: `EncounterAction`, `applyEncounterAction`. `encounter.schema.ts`: `encounter`, `combatant` |
| `codex/` | Factions, adventures, beats, locations, NPCs, handouts | `codex.actions.ts`: `CodexAction`, `applyCodexAction`. `codex.schema.ts`: the six tables |
| `table/` | The socket | `table.gateway.ts`: `TableGateway`. `table.dispatch.ts`: `applyAction`, `touches`, `kicks` (and private `authorize`). `table.state.ts`: `loadState`, `loadCodex` |

Rules:

- `*.actions.ts` and `*.service.ts` import no Nest symbols. Transports (controller, gateway) parse, resolve `Ctx` and call them.
- Each feature owns its tables in `<feature>.schema.ts`. `drizzle.config.ts` globs `src/**/*.schema.ts`, and `core/db.ts`
  spreads every schema module into the client.
- `Ctx = { campaignId, role, characterId }` comes from a token and is the only source of campaign scope.

## 3. REST endpoints

All in `campaign/campaign.controller.ts`. Bodies are zod-parsed by the local `parse()`, and a failure is a
`400` with `z.prettifyError` text. "Cookie" means the `wg_token` cookie, read by `callerOf()` → `resolveToken`. A
missing, malformed, unknown or revoked token is a `401`. REST never reads `auth.token` or an `Authorization` header.

| Method, path | Auth | Body | Success | Errors |
|---|---|---|---|---|
| `POST /api/campaigns` | `x-admin-key` header equal to `ADMIN_KEY` (constant-time, `isAdmin`) | `{ name: string 1–100, tier: 1–5 }` | `201 { campaignId, gmToken }` | `401` bad or missing key, or `ADMIN_KEY` unset. `400` bad body (checked after the key) |
| `POST /api/join` | the token in the body | `{ token: string 1–200 }` | `200` `Ctx` (`{ campaignId, role, characterId }`), and `Set-Cookie: wg_token` (flags in §10) | `400` bad body. `401 "Invalid or revoked link"` |
| `GET /api/me` | Cookie | none | `200` `Ctx` (`Me` in `packages/shared/src/state.ts`) | `401` |
| `GET /api/threats` | Cookie, GM only | none | `200 Threat[]`, the whole bestiary | `401` no or bad token. `403` player |

`createCampaign` inserts the campaign and issues its GM token in one transaction. `/api/threats` is the only REST route
that serves book content, which is why it's GM-only (see CLAUDE.md, Copyright).

## 4. Socket lifecycle (`table/table.gateway.ts`)

### Handshake: `afterInit` middleware

Runs before the connection is accepted, so no event can arrive without a `Ctx`.

- Token: the `wg_token` cookie (`readCookie` of the handshake `Cookie` header, which browsers send), else
  `handshake.auth.token` (used by scripts and tests).
- `resolveToken` throws (DB unreachable) → refused with `Error("unavailable")`. It's transient, and the web client retries.
- `resolveToken` returns null (no, bad or revoked token) → refused with `Error("unauthorized")`. It's permanent, and the
  web client reloads into its no-access screen.
- Otherwise `socket.data = ctx`.

`readCookie` swallows a malformed `%` escape and returns "no token". Otherwise the throw would be an unhandled rejection in
the middleware and would take the process down. `smoke.test.ts` covers this.

### `handleConnection`

1. Joins one room: `c:<campaignId>:gm` for the GM, `c:<campaignId>:players` for players.
2. Loads `loadState` and `loadCodex` in parallel and emits `state` then `codex` to that socket only: the full versions for
   the GM, and `toPlayerView` / `toPlayerCodex` for players. `state` is skipped if the campaign row is gone.

### The `action` event (`onAction`)

Clients call `emitWithAck("action", ActionInput)` and receive an `ActionResult`:
`{ ok: true, id?, token? } | { ok: false, error }`.

1. **Parse** `Action.safeParse(body)`. A failure acks `{ ok: false, error: <prettified zod error> }` at once, outside the queue.
2. **Queue** on `serial(ctx.campaignId, …)`.
3. **Transaction:** `db.transaction(tx => applyAction(tx, { ctx, action }))`. `applyAction` calls `authorize` first, so a
   refusal also happens inside the (then rolled back) transaction.
4. **Errors:**
   - An `ActionError` (thrown by `fail()`) rolls back and acks `{ ok: false, error: e.message }`. These messages are
     user-facing.
   - Anything else rolls back, is logged, and acks `{ ok: false, error: "Server error" }`. No stack reaches the client.
5. **After commit:** `kicks(action)` → disconnect the matching player sockets. Then `broadcast(campaignId, touches(action))`.
   An error here is logged and **the committed result is still returned**. Reporting a failure would make the client
   retap and apply a delta twice; the next broadcast resyncs everyone.

### Per-campaign serial queue (`serial`)

`tails: Map<campaignId, Promise<void>>`. Each call awaits the previous tail for that campaign, runs, and becomes the new
tail. A rejected run doesn't break the chain. Different campaigns run concurrently.

This makes every check-then-act inside a handler safe, e.g. "no turn in progress" then "set current", or the full-set
check in `beat.reorder`. It's in-process, so it assumes **one api instance** (marked `ponytail:` in the file, and the
upgrade path is pg advisory locks). Anything that bypasses the socket (REST, direct SQL) isn't covered by it.

### Broadcast

- `touches.state` → `loadState` → GM room gets it raw, players room gets `toPlayerView`.
- `touches.codex` → `loadCodex` → GM room raw, players room `toPlayerCodex`.

Always the full snapshot, never a diff.

## 5. Dispatch (`table/table.dispatch.ts`)

### `authorize(ctx, action)`

- GM: everything.
- Player: only types in `PLAYER_ACTIONS` (`packages/shared/src/actions.ts`), else `"GM only"`. Then:

| Action | Extra player check | Refusal |
|---|---|---|
| `character.update`, `character.adjust`, `character.respite` | `a.id === ctx.characterId` | `"Not your character"` |
| `character.update` | no `overrides` field | `"Overrides are GM only"` |
| `character.adjust` | no `traumatic` field | `"GM only"` |
| `pool.adjust` | `pool === "glory"` | `"GM only"` |

A player may therefore edit their own character's `name`, `stats` and `conditions`, adjust its Wounds, Shock and Wrath,
take a Respite, and add to or spend Glory. Nothing else.

### `touches(action)` → `{ state, codex }`

| Actions | state | codex |
|---|---|---|
| `codex.save`, `codex.delete`, `beat.reorder` | no | yes |
| `beat.startEncounter` (new encounter, and beat status → active), `session.*` (session list) | yes | yes |
| everything else | yes | no |

`token.*` rebroadcasts `state` even though tokens aren't in it.

### `kicks(action)` → characterId or null

`token.revoke` → `a.characterId`. `character.delete` → `a.id` (its tokens are cascade-deleted). The gateway disconnects
every socket in the players room whose `ctx.characterId` matches.

### `applyAction` routing

A `switch` on `action.type` hands each action to the owning feature's `apply*Action(tx, { ctx, action })`. Each feature
narrows its slice with `Extract<Action, …>` (`CampaignAction`, `CharacterAction`, `EncounterAction`, `CodexAction`),
so a type missing from the switch is a compile error.

## 6. Action catalogue

Schemas: `packages/shared/src/actions.ts`. "GM" means GM only. "Own" means a player on their own character, as in §5.
Snapshots: S = `state`, C = `codex`. Rule pages are printed Core pages; behaviour is in [game-logic.md](game-logic.md).

| Type | Who | What it does | Snap | Page |
|---|---|---|---|---|
| `campaign.update` | GM | Patch `name`, `tier`, `framework`, `patron`. Existing combatants keep the threat class they were added with | S | |
| `pool.adjust` | GM; player Glory only | `pool += delta`, clamped to `[0, poolMax(pool, #characters)]` | S | p.164, p.320 |
| `session.start` | GM | Every character Wrath → 2. Glory → 0. Ruin → number of characters. Closes any open session (no XP). Inserts session `number = count + 1`. Returns `id` | S C | p.162, p.164, p.320 |
| `session.end` | GM | Open session gets `endedAt`, `recap`, `xp`. Every character `xp += xp`. Fails `"No session in progress"` | S C | p.321 |
| `character.create` | GM | Insert with `name`, `stats` (default `{}`). Returns `id` | S | |
| `character.update` | GM; Own (no `overrides`) | Patch `name`, `stats`, `overrides`, `conditions`. `stats` and `overrides` replace the whole jsonb value | S | |
| `character.adjust` | GM; Own (no `traumatic`) | Deltas on `wounds`, `shock`, `wrath`, `traumatic`, each floored at 0, no cap | S | |
| `character.respite` | GM; Own | Wounds 0, Shock 0, Wrath 2. Refused while Dying (`wounds > deriveStats().maxWounds`) | S | p.197 |
| `character.delete` | GM | Delete. Cascades to tokens and combatant rows. Kicks the player | S | |
| `token.issue` | GM | New player token for a character in this campaign. Returns `token` (plaintext, once) | S | |
| `token.revoke` | GM | Stamp `revokedAt` on all of the character's live tokens. Kicks the player | S | |
| `encounter.start` | GM | Deactivate any active encounter, insert an empty one. Returns `id` | S | |
| `encounter.end` | GM | Deactivate all the campaign's encounters | S | |
| `encounter.newRound` | GM | Round + 1. Clear `acted`, `ambushed`, `currentId`, `lastSide`, `seizedSide` | S | p.176–177 |
| `turn.start` | GM | Set `currentId`. Refused if a turn is running, the combatant already acted, it's ambushed in Round 1, or it's the other side's turn and that side can still act | S | p.177 |
| `turn.seize` | GM | As `turn.start`, but out of order. Needs `canSeize`, then spends 1 Glory (Agent) or 1 Ruin (Threat) and sets `seizedSide` | S | p.176–177, p.320 |
| `turn.end` | GM | Mark current `acted`, set `lastSide`, keep `seizedSide` only if the same side. Auto new Round when no one else can act | S | p.176 |
| `combatant.addThreat` | GM | Add a threat from `@wg/data` to the active encounter. Snapshots its stat block and its class at the campaign Tier. `mobCount` makes it a Mob (`mobStart` = `mobCount`). Returns `id` | S | |
| `combatant.addCharacter` | GM | Add a campaign character as a PC combatant. Returns `id` | S | |
| `combatant.update` | GM | `ambushed` on any combatant. `label`, `mobCount`, `conditions`, `revealed`, `marker` on threat combatants only | S | |
| `combatant.adjust` | GM | Threat combatants only. Deltas on `wounds`, `shock`, `personalRuin`, floored at 0. On a Mob, `wounds` removes members (clamped `[0, mobStart]`) instead. Refuses Shock for a threat whose Shock is "–" | S | p.324, p.325 |
| `combatant.aware` | GM | Ambushed combatant pays 1 Glory or Ruin by side, then `ambushed = false` | S | p.177 |
| `combatant.remove` | GM | Delete from the active encounter. `currentId` is nulled by the FK | S | |
| `codex.save` | GM | Insert (no `id`) or full replace (`id`) of one codex row. `data` is validated per `kind` by `CodexInput`. Beats check that `adventureId` is in the campaign. Handouts stamp `revealedAt` on first reveal and clear it on unreveal. Returns `id` | C | |
| `codex.delete` | GM | Delete one codex row by `kind` and `id` (FK effects in §7) | C | |
| `beat.reorder` | GM | `ids` must list every beat of the adventure exactly once. Sets `order` = index | C | |
| `beat.startEncounter` | GM | Validate the beat's `encounter` entries, start a new encounter, add **every** campaign character, then each entry (`asMob && count > 1` → one Mob row, else `count` rows labelled `Name 1..n`). Beat status → `active`. Returns the encounter `id` | S C | |

Notes:

- Every encounter action except `encounter.start`, `encounter.end` and `beat.startEncounter` needs an active encounter
  (`"No active encounter"`), and finds combatants only within it.
- `codex.save` with an `id` is a **full replace**. `CodexInput` fills defaults, so an omitted field reverts to its default.
  Clients send the whole row. `beat.order` isn't in `CodexInput` and so survives saves.
- Delta fields are ints in `[-100, 100]`. Other limits are in the zod schemas.

## 7. Database schema

Postgres, `snake_case` columns (`casing: "snake_case"` in both `drizzle.config.ts` and the client). Ids are `uuid`,
`defaultRandom()`. Timestamps are `timestamptz`. There are no secondary indexes or unique constraints beyond primary keys.
Campaign-owned rows share `owned()` from `campaign.schema.ts` (`id`, `campaign_id` → campaign **cascade**, `created_at`).
No action or endpoint deletes a campaign; the cascades apply to manual cleanup.

| Table (file) | Purpose | Key columns | FKs (on delete) |
|---|---|---|---|
| `campaign` (`campaign.schema.ts`) | The root. Party Glory and GM Ruin live here | `name`, `tier`, `glory`, `ruin`, `framework`, `patron` | none |
| `session` (`campaign.schema.ts`) | Play sessions and recaps | `number`, `started_at`, `ended_at` (null = in progress), `recap`, `xp` | campaign cascade |
| `access_token` (`auth.schema.ts`) | Login tokens | `token_hash` (PK, SHA-256 hex), `role`, `character_id` (null for GM), `revoked_at` | campaign cascade. character cascade |
| `character` (`character.schema.ts`) | Player characters | `name`, `wounds` (taken, not remaining), `shock`, `wrath`, `traumatic`, `xp`, `conditions text[]` | campaign cascade |
| `encounter` (`encounter.schema.ts`) | A fight. At most one `active` per campaign, enforced in code, not by a constraint. Ended ones stay as inactive rows | `active`, `round`, `current_id`, `last_side`, `seized_side` | campaign cascade. `current_id` → combatant **set null** |
| `combatant` (`encounter.schema.ts`) | One PC or threat (or Mob) in an encounter | `order` (display only), `acted`, `ambushed`, `kind`. PC: `character_id`. Threat: `threat_id` (text, no FK: static data), `threat_class`, `label`, `marker`, `mob_count`, `mob_start`, `personal_ruin`, `wounds`, `shock`, `conditions`, `revealed` | encounter cascade. character cascade |
| `faction` (`codex.schema.ts`) | Factions | `name`, `keywords text[]`, `stance`, `notes`, `secrets` | campaign cascade |
| `adventure` | Adventures | `title`, `premise`, `status` | campaign cascade |
| `beat` | Scenes of an adventure | `adventure_id`, `order`, `title`, `type`, `status`, `read_aloud`, `gm_notes`, `outcome`, `location_id`, `npc_ids uuid[]`, `handout_ids uuid[]` | campaign cascade. adventure **cascade**. location **set null**. The id arrays have no FK |
| `location` | Places, nestable | `parent_id`, `name`, `description`, `gm_notes`, `hazards`, `revealed` | campaign cascade. `parent_id` → location **set null** |
| `npc` | NPCs | `faction_id`, `name`, `role`, `description`, `gm_notes`, `secrets`, `attitude`, `revealed` | campaign cascade. faction **set null** |
| `handout` | Player handouts | `title`, `body`, `revealed`, `revealed_at` | campaign cascade |

Text-set columns (`role`, `side`, `kind`, `marker`, `threat_class`, `stance`, `status`, `type`, `attitude`) are `text` typed
with `.$type<>` from the shared `z.enum`s.

### jsonb columns

| Column | Holds (zod, `@wg/shared`) | Validated |
|---|---|---|
| `character.stats` | `CharacterStats` | On write by the action schema. On read, `loadState` parses it and fills defaults, so `{}` is a valid stored value |
| `character.overrides` | `Overrides` | Same as `stats` |
| `character.dod_raw` | nothing yet: no code reads or writes it (Doctors of Doom import isn't built) | none |
| `combatant.stat_snapshot` | `Threat`, copied at add time so a data fix doesn't change a running fight | Parsed at startup by `@wg/data`, and cast on read |
| `beat.encounter` | `EncounterEntry[]`, at most `MAX_ENCOUNTER_ROWS` rows once expanded | On write by `CodexInput.beat`. Re-parsed by `beat.startEncounter`, and cast in `loadCodex` |
| `npc.stat_source` | `StatSource` | On write by `CodexInput.npc`, cast in `loadCodex` |

Deleting an NPC or handout leaves its id in any `beat.npc_ids` / `beat.handout_ids`, and clients must tolerate unknown ids.

## 8. Snapshots (`table/table.state.ts`)

Both loaders read with the top-level `db` (not a `tx`), after the commit.

**`loadState(campaignId): LiveState | null`**, where null means no such campaign:

- `campaign`: `id`, `name`, `tier`, `glory`, `ruin`, `framework`, `patron`.
- `characters`, by `created_at`: counters, `conditions`, and `stats` / `overrides` parsed through their zod schemas.
- `encounter`: the active one or null, with `round`, `currentId`, `lastSide`, `seizedSide` and `combatants` by `order`.
  - PC → `{ id, kind, characterId, acted, ambushed }`.
  - Threat → the combatant row plus `maxWounds` / `maxShock` from the snapshot, `label` (falling back to the snapshot name)
    and `stats` = the full snapshot.

**`loadCodex(campaignId): Codex`:** six queries in parallel, then beats for the campaign's adventures, nested under each
adventure and sorted by `order`, then `created_at`. `campaignId` and `createdAt` are stripped. Dates are ISO strings. Sessions
are by `number`.

### Player redaction (`packages/shared`)

| Function | Hides from players | Keeps |
|---|---|---|
| `toPlayerView` (`state.ts`) | `stats` → null on every threat combatant with `revealed: false` | Everything else, including threat label, class, `threatId`, Wounds, Shock, `maxWounds` / `maxShock`, conditions, and every character's full sheet |
| `toPlayerCodex` (`codex.ts`) | All factions and all adventures (so all beats). Unrevealed locations, NPCs and handouts. Location `gmNotes`, `hazards`. NPC `gmNotes`, `secrets`, `statSource` (→ `{ kind: "none" }`) | Revealed locations, NPCs and handouts otherwise whole. All sessions with recaps |

A new field is visible to players unless one of these functions drops it. Decide when you add it.

## 9. Concurrency and counters

- One action = one transaction. Handlers only write through `tx`.
- Counters change by **delta in SQL**, so two phones tapping `+1 Wound` at once both land. A read-modify-write in app
  code would let the last write win and would also break the "retap after commit" guarantee (§4).
  - `bump(col, d)` (`core/sql.ts`) → `greatest(0, col + d)`. It returns `undefined` for an absent delta, which Drizzle's
    `.set()` skips.
  - `pool.adjust` → `least(poolMax, bump(...))`. The cap is recomputed from the character count on each action.
  - Mob damage → `least(mobStart, greatest(0, mob_count - wounds))`.
  - Spending Glory or Ruin (`spend` in `encounter.actions.ts`) → `col - 1 … WHERE col > 0`. Zero rows updated means
    `"No Glory to spend"` / `"No Ruin to spend"`.
  - `session.end` → `xp = xp + n`.
- Absolute sets are used only where the rules reset a value (`session.start`, `character.respite`).
- Check-then-act logic (turn order, "already acted", beat reorder) relies on the per-campaign queue (§4).

## 10. Tokens (`auth/`)

- **Issue:** `issueToken(tx, { campaignId, role, characterId })` → `randomBytes(24)` as base64url (32 chars). The GM token
  comes from `POST /api/campaigns`, player tokens from `token.issue`. The plaintext is returned once and shown as a
  link or QR code by the web app.
- **Store:** only `sha256(token)` hex, in `access_token.token_hash`.
- **Resolve:** `resolveToken` matches the hash with `revoked_at IS NULL` and returns `Ctx`.
- **Revoke:** `token.revoke` sets `revoked_at` on every live token of that character. `character.delete` removes them
  by cascade. Both kick the player's live sockets. A reconnect then fails with `unauthorized`, and `/api/join` returns
  `401`. There's no action to revoke a GM token.
- **Cookie** (set by `POST /api/join`): `wg_token`, `httpOnly`, `sameSite: "lax"`, `secure` only when
  `COOKIE_SECURE === "true"`, `maxAge` 365 days, `path: "/"`. The web `/join/<token>` route forwards the `Set-Cookie`
  ([frontend.md](frontend.md)).

## 11. Scripts (`apps/api/scripts/`)

Both run against a **running api**, not the DB. Run them from `apps/api` so Bun loads `.env`.

| Script | Does | Env | Output |
|---|---|---|---|
| `bun run create-campaign "<name>" [tier]` | `POST /api/campaigns` (tier defaults to 1) | `ADMIN_KEY`, `API_URL` (else `http://localhost:$PORT`, PORT default 4000), `WEB_ORIGIN` for the link | `GM link: <WEB_ORIGIN>/join/<gmToken>`. Throws on a non-2xx |
| `bun run seed <pack>` | `loadPack(pack)` (zod-parsed, [data.md](data.md)). Creates the campaign, connects a socket with `auth.token`, then sends normal actions in order: `campaign.update` (framework, patron), factions, locations (parent refs), NPCs (faction refs), handouts, adventures with their beats (location, NPC and handout refs), `character.create` per pack character. Pack `key`s map to returned ids | as above | A count summary and the GM link. The first failed action throws with its error. No player tokens are issued |

Because seeding goes through the socket, it gets the same validation, scoping and broadcasts as live play.

## 12. Testing

`apps/api/test/smoke.test.ts`: end-to-end over HTTP and Socket.IO against a running api and Postgres (`node:test` run by
`bun test`). Each run creates a fresh campaign "Smoke" and leaves it in the DB.

```bash
bun run dev:db && bun run dev:api   # in another shell
bun run test:smoke                  # needs ADMIN_KEY (from apps/api/.env); API_URL / PORT optional
```

It covers:

- **REST:** admin-key `401`, `201` create, `/join` cookie (HttpOnly) and `401` on a bad token, `/api/threats` `200` for
  the GM and `403` for a player, and a malformed cookie giving `401` on `/api/me` and `unauthorized` on the socket without
  crashing the api.
- **Redaction:** threat stats hidden until `revealed`, `maxWounds` visible, and the player codex shows revealed NPCs only,
  without `gmNotes`.
- **Mobs:** Wounds remove members, healing is capped at `mobStart`.
- **Player permissions:** own `character.adjust` passes and clamps at 0. Glory is allowed, Ruin is `"GM only"`,
  `combatant.remove` is `"GM only"`, another character is `"Not your character"`, and an invalid payload is refused.
- **Turns:** alternation, "End the current turn first", "Already acted this round", Seize refusal and cost, auto new
  Round, GM Seize at Round start.
- **Ambush:** blocked in Round 1, then `combatant.aware`.
- **Sessions:** `session.start` resets and `session.end` awards XP.
- **Pools:** caps.
- **Revoke:** `token.revoke` kicks the socket and kills the link.

Pure rules functions are unit-tested in `packages/shared` (`bun run test`), see [game-logic.md](game-logic.md).

## 13. How-to

### Add an action

Worked example: a hypothetical `character.clearConditions` that a player may send for their own character.

1. **Schema.** In `packages/shared/src/actions.ts`, add a member to the discriminated union:
   ```ts
   z.object({ type: z.literal("character.clearConditions"), id }),
   ```
2. **Handler.** In the owning feature's `*.actions.ts`, add a case. `CharacterAction` already matches `character.*`.
   Scope to `ctx.campaignId` and `fail()` if nothing matched:
   ```ts
   case "character.clearConditions": {
     const r = await tx.update(character).set({ conditions: [] }).where(inCampaign(a.id)).returning({ id: character.id });
     return r.length ? { ok: true } : fail("Character not found");
   }
   ```
3. **Dispatch.** Add the `case` to the character group in `applyAction` (`table/table.dispatch.ts`). A missing case is a
   type error.
4. **`touches()`.** Only needed if the action changes codex tables. This one changes `state`, which is the default.
5. **Players.** Add the type to `PLAYER_ACTIONS` and extend the ownership check in `authorize()` (the
   `a.id !== ctx.characterId` line). Skip this for GM-only actions.

Then add a success and a refusal assertion to `smoke.test.ts` (required by the style guide), and add a page cite if it's a
rule. A new counter is a delta through `bump`, never an absolute value. If the action should kick sockets, extend `kicks()`.

### Add a table or column

1. Edit (or create) `src/<feature>/<feature>.schema.ts`. A new file must match `*.schema.ts` and be spread into
   `schema` in `core/db.ts`. Use `owned()` for campaign-owned rows, `.$type<>()` from a shared `z.enum` for closed sets,
   and `$type<>` for jsonb with a zod schema that parses it on read.
2. `cd apps/api && bun run db:generate` writes a migration to `apps/api/drizzle/`. Restart the api, and `runMigrations`
   applies it on boot.
3. **Pre-release shortcut** (only while there's no real campaign data): delete `apps/api/drizzle/`, run `db:generate`
   to regenerate the single migration, then `docker compose down -v` (this wipes the DB volume) and `bun run dev:db`.
   Once real data exists, always add migrations and never rewrite them.
4. If players see it: add it to `loadState` / `loadCodex` and the shared `LiveState` / `Codex` types, and decide its
   redaction in `toPlayerView` / `toPlayerCodex`. If it's editable codex data: add it to `CodexInput`.

### Add a REST endpoint

REST is for things that can't be socket actions: setup, login, GM-only reads. **Game mutations are actions** (the one
mutation path).

1. Add a method to `CampaignController`, or add a new `@Controller()` to `AppModule.controllers`. The `api` prefix is
   global. Dev rewrites and Caddy already forward `/api/*`.
2. Parse the body with a zod schema. `parse()` in `campaign.controller.ts` turns a failure into a `400`.
3. Resolve the caller with `callerOf(req)` (`401` if there's no valid cookie). Check `ctx.role` and throw
   `ForbiddenException` for the wrong role. `parse` and `callerOf` are module-private, so move them to `auth/` if a
   second controller needs them.
4. Put the logic in a `*.service.ts` function with no Nest imports, scoped to `ctx.campaignId`.
5. Never return book content or GM-only data to a player role.

## 14. Environment (`apps/api/.env.example`)

Bun loads `apps/api/.env` automatically.

| Var | Example | Effect |
|---|---|---|
| `DATABASE_URL` | `postgres://wg:wg@localhost:5434/wg` | Postgres connection. Required: `core/db.ts` throws at import if it's unset. Port 5434 matches `docker-compose.yml` |
| `ADMIN_KEY` | `change-me` | Secret for `POST /api/campaigns` (`x-admin-key`). If unset, campaign creation is always `401`. Also read by the scripts and the smoke test |
| `WEB_ORIGIN` | `http://localhost:3000` | Socket.IO CORS origin (CORS is disabled if unset). The scripts use it to print join links |
| `COOKIE_SECURE` | `false` | `"true"` adds `Secure` to the login cookie. Set it behind HTTPS |
| `PORT` | `4000` | Listen port (default 4000). The scripts and test use it to find the api when `API_URL` is unset |

`API_URL` isn't in the example. Only the scripts and the smoke test read it, to target a non-local api.
