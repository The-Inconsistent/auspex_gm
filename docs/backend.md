# Backend: `apps/api`

How the NestJS api works and how to change it safely. For the system overview see [architecture.md](architecture.md).
For the client side of the socket see [frontend.md](frontend.md). For the rules functions in `packages/shared` see
[game-logic.md](game-logic.md). Threat JSON and content packs are covered in [data.md](data.md), and running things
locally in [development.md](development.md). Code style is binding: `.claude/backend-code-style.md`.

NestJS 12 on Bun, run from source (`bun --watch src/main.ts`) with no build step. Drizzle ORM on Postgres 17. One
Socket.IO gateway carries every mutation; REST exists only for setup, login, the lobby, invites
and the bestiary.

---

## 1. Boot

`src/main.ts`:

1. `runMigrations()` (`core/db.ts`) applies `apps/api/drizzle/` before Nest starts. A failed migration stops the process.
2. `NestFactory.create(AppModule)`. `AppModule` wires two controllers (`CampaignController`, `LibraryController`) and one
   provider (`TableGateway`). There's no DI beyond that: feature code is plain functions that take a `tx`.
3. Global prefix `api`, so REST lives under `/api/*`. Socket.IO keeps its default path `/socket.io/`.
4. Two in-process rate limiters (`core/rate-limit.ts`, fixed windows): 60/min **per IP** on the unauthenticated door
   (`/api/join`, `/api/guest`, `/api/invites`), and 120/min **per caller** on the library routes (`/api/library`,
   `/api/creation`, `/api/rules`), keyed by a hash of their session token and falling back to the IP when there is
   none — a whole table building together sits behind one NAT, and the builder autosaves, so one shared bucket would cut
   them off. Over either, a `429`.
5. `enableShutdownHooks()`, then listen on `PORT` (default 4000).

`@wg/data` loads and zod-parses every threat JSON at import time, so a malformed file fails at startup ([data.md](data.md)).

REST has no CORS enabled: browsers reach it same-origin through the Next rewrites (dev and prod). The gateway sets
`cors: { origin: <WEB_ORIGIN split on commas> ?? false, credentials: true }`, the same list Clerk verification uses for
`authorizedParties` (§10).

## 2. Module map

| Folder | Owns | Key exports |
|---|---|---|
| `core/` | DB client, error type, SQL helpers | `db.ts`: `db`, `Tx`, `Db` (either), `runMigrations`. `errors.ts`: `ActionError`, `fail(msg): never`. `sql.ts`: `bump` (clamped delta), column builders `conditions`, `createdAt`, `body` |
| `auth/` | Clerk users, seats, invites, guest tokens and the cookie | Clerk itself is in `@wg/auth/api` (`packages/auth/src/api.ts`): `SESSION_COOKIE` (`"__session"`), `AuthUser`, `verifySession`, `bearerOf`, `testSessionToken`. `auth.schema.ts`: `accessToken`, `appUser`, `membership`, `invite`. `auth.service.ts`: `COOKIE` (`"wg_token"`), `Ctx`, `hash`, `newSecret`, `issueToken`, `resolveGuest`, `readCookie`, `signedInUser`, `resolveCtx`. `invite.service.ts`: `previewInvite`, `acceptInvite`. `access.actions.ts`: `AccessAction`, `applyAccessAction` |
| `campaign/` | Campaign row, pools, sessions; the table's REST | `campaign.controller.ts`: `CampaignController`. `campaign.service.ts`: `isAdmin`, `createCampaign`, `lobby`, `listThreats`. `campaign.actions.ts`: `CampaignAction`, `applyCampaignAction`, `campaignTier`. `campaign.schema.ts`: `campaign`, `session`, `owned()` |
| `character/` | Characters and guest tokens; the creation catalogue every builder resolves against | `character.actions.ts`: `CharacterAction`, `applyCharacterAction`, `ownCharacter`. `character.schema.ts`: `character`. `creation.service.ts`: `buildCatalogue`, `creationPayload`, `buildRefusal` (why a resolved build can't be saved, in the words both `character.build` and the library use) |
| `library/` | Characters a signed-in user owns outside any campaign, and their REST (issue #14) | `library.controller.ts`: `LibraryController`. `library.service.ts`: `listLibrary`, `readLibrary`, `createLibraryCharacter`, `saveLibraryCharacter`, `deleteLibraryCharacter`. `library.schema.ts`: `libraryCharacter` |
| `encounter/` | Encounters, turns, combatants, starting a beat's fight | `encounter.actions.ts`: `EncounterAction`, `applyEncounterAction`. `encounter.schema.ts`: `encounter`, `combatant` |
| `codex/` | Factions, adventures, beats, locations, NPCs, handouts | `codex.actions.ts`: `CodexAction`, `applyCodexAction`. `codex.schema.ts`: the six tables |
| `table/` | The socket | `table.gateway.ts`: `TableGateway`. `table.dispatch.ts`: `applyAction`, `touches`, `kicks` (and private `authorize`). `table.state.ts`: `loadState`, `loadCodex` |

Rules:

- `*.actions.ts` and `*.service.ts` import no Nest symbols. Transports (controller, gateway) parse, resolve `Ctx` and call them.
- Each feature owns its tables in `<feature>.schema.ts`. `drizzle.config.ts` globs `src/**/*.schema.ts`, and `core/db.ts`
  spreads every schema module into the client.
- `Ctx = { campaignId, role, characterId, userId }` comes from a Clerk membership, a guest token or the admin key, and is
  the only source of campaign scope. `userId` is the Clerk user; it's null for guests and the admin.

## 3. REST endpoints

In `campaign/campaign.controller.ts` (a table's) and `library/library.controller.ts` (a signed-in user's own, outside any
table). Bodies and path params are zod-parsed by the local `parse()`, and a failure is a `400` with `z.prettifyError`
text.

- **Clerk** means a Clerk session token: `Authorization: Bearer …` (server-side Next) or the `__session` cookie (the
  browser, through the rewrites), verified by `signedInUser()` (§10). An invalid or missing one counts as signed out.
- **Seat** means `resolveCtx({ campaignId, headers })`: a signed-in member of that campaign first, else a `wg_token`
  guest cookie for that same campaign. No seat is a `401`.
- `refusing()` turns an `ActionError` from the invite service into a `400` with its message.

| Method, path | Auth | Body | Success | Errors |
|---|---|---|---|---|
| `POST /api/campaigns` | `x-admin-key` equal to `ADMIN_KEY` (constant-time, `isAdmin`), else Clerk with the creator role | `{ name: string 1–100, tier: 1–5 }` (`CreateGame`), plus `ownerUserId` with the admin key | `201 { campaignId }`. The creator, or `ownerUserId`, is seated as GM | `401` not signed in. `403 "Only creators can start a game"`. `400` bad body |
| `GET /api/lobby` | Clerk | none | `200 Lobby` (`packages/shared/src/access.ts`): `canCreate`, `mine`, `running`, `characters` (the caller's library, §3.1) | `401` |
| `GET /api/campaigns/:id/me` | Seat | none | `200` `Ctx` (`Me` in `packages/shared/src/state.ts`) | `400` bad id. `401` |
| `GET /api/campaigns/:id/threats` | Seat, GM only | none | `200 Threat[]`, the whole bestiary | `400` bad id. `401` no seat. `403` player |
| `GET /api/campaigns/:id/wargear` | Seat, GM only | none | `200 Wargear[]`, the whole catalogue | `400` bad id. `401` no seat. `403` player |
| `POST /api/campaigns/import` | Clerk with the creator role | `{ file: CampaignExport, fresh?: boolean }` (`packages/shared/src/export.ts`), up to 2 MB | `201 { campaignId }`: a new campaign, the caller as GM. `fresh` runs `freshStart` first | `401`. `403` not a creator. `400` bad file, unknown threat id, a repeated id, a handout audience naming an Agent not in the file |
| `GET /api/campaigns/:id/export` | Seat, GM only | none | `200 CampaignExport` as an attachment (`<name>.auspex.json`) | `400` bad id. `401` no seat. `403` player |
| `GET /api/campaigns/:id/rules` | Seat, any role | none | `200 RuleEntry[]`, the rules reference | `400` bad id. `401` no seat |
| `GET /api/campaigns/:id/creation` | Seat, any role | none | `200 CreationPayload`: the creation catalogue and the Wargear catalogue, without the homebrew books unless `campaign.homebrew`. Built and gzipped once per setting (about 220 KB, 440 KB with homebrew); `ETag` for a `304` | `400` bad id. `401` no seat |
| `GET /api/creation?homebrew=0\|1` | Clerk | none | `200 CreationPayload`, the same body and `ETag` as the campaign route, but the caller picks the books, because no campaign decides for them — so an account with no seat can read the homebrew books that a seated player at an official-only table can't | `401` |
| `GET /api/rules` | Clerk | none | `200 RuleEntry[]`, for the library builder's rule links | `401` |
| `GET /api/library` | Clerk | none | `200 LibraryCharacter[]`, the caller's own, newest first | `401` |
| `POST /api/library` | Clerk | `{ name?, homebrew? }` (`NewLibraryCharacter`) | `201 LibraryCharacter`, an empty row for the builder to autosave into | `400` at `LIBRARY_CAP` (20). `401` |
| `GET /api/library/:id` | Clerk, owner | none | `200 LibraryEntry`: the card plus `build`, `draft` and `detail` | `401`. `404` not the caller's |
| `PUT /api/library/:id` | Clerk, owner | `LibrarySave`: `name?`, `homebrew?`, `detail?`, `build?` (null drops it), `draft?` | `200 LibraryCharacter` | `400` with the build's refusal. `401`. `404` |
| `DELETE /api/library/:id` | Clerk, owner | none | `200 { ok: true }` | `401`. `404` |
| `POST /api/join` | the guest token in the body | `{ token: string 1–200 }` | `200` `Ctx`, and `Set-Cookie: wg_token` (flags in §10). The web uses `campaignId` to open the table | `400` bad body. `401 "Invalid or revoked link"` |
| `GET /api/guest` | `wg_token` cookie | none | `200` `Ctx` of the guest's table, so a returning guest lands back at it | `401` |
| `GET /api/invites/:code` | none; Clerk if present | none | `200 InvitePreview`: campaign name and Tier, `mode`, the invited character or the open ones as read-only `Character` sheets (objectives blanked, Ability and Talent text stripped: the preview needs no account, and book prose needs a seat or an account, §3.1), `allowGuests`, `signedIn`, `member` | `400` expired, revoked or used up |
| `POST /api/invites/:code/accept` | Clerk, or none with `asGuest` | `AcceptInvite`: `characterId?`, `newCharacterName?`, `asGuest` | `200 { campaignId }`. A guest also gets `Set-Cookie: wg_token` | `400` with the refusal (see §10) |

### 3.1 The character library: REST outside the action path (issue #14)

A signed-in user owns characters that belong to no campaign, built from the same builder without a seat. This is the
**documented exception to "one mutation path"** (§5, and the root `CLAUDE.md`): a library character is nobody's live
state, so there is no campaign room to broadcast to and no action to serialise. Plain REST, `db` without a transaction,
every read and write filtered by `owner_user_id`.

What still holds:

- **The server decides.** `PUT` with a `build` re-runs `resolveBuild` against `buildCatalogue(homebrew)` with no `play`
  and refuses anything not ready, through the same `buildRefusal` as `character.build`, so both refuse in the same words.
  One difference, `gmLater`: problems only a GM judges (`severity: "gm"`) don't block a library save, because there is
  no GM to tick them; they come back on the campaign's REVIEW after the import (`docs/rules-flow.md` §11.59).
- **Scope.** A row that isn't the caller's is a `404`, never a `403`: a `403` would tell them the id exists.
- **Book text needs an account.** `/api/creation` and `/api/rules` serve book content without a seat, so the account is
  the gate, and it holds because Clerk's Access mode is Invite-only (`docs/development.md` §Clerk, `CLAUDE.md`,
  Copyright). If sign-up ever opens, these need a role check —
  marked `// ponytail:` on the controller.
- **Bounded.** `LIBRARY_CAP` (20, `packages/shared/src/library.ts`) per account, and exactly: counting and inserting is a
  check-then-act, and REST doesn't run in the gateway's queue, so `createLibraryCharacter` locks the owner's `app_user`
  row (`select … for update`) for the transaction. Without it, concurrent posts all read the same count and all insert.
- **The draft is stored as the builder writes it**, so nothing downstream trusts its shape: `tierOf` parses the Tier
  (a bad one would break `Lobby`'s schema and take the lobby down with it), and the builder parses a draft it reads back
  (`StoredDraft`, `@wg/shared`).
- **The GM's part never travels.** A saved build is stored with `gm` cleared: rulings and ticks are made at a table,
  about that table's character.

Bringing one into a campaign adds no action: the campaign's builder copies the build into its draft (IMPORT FROM
LIBRARY), and the existing `character.draft` / `character.build` flow saves it. The copy is a snapshot, like a threat's
stat block joining an encounter, so later library edits don't change the campaign character, and advancement stays with
the campaign character. A Tier or homebrew mismatch is refused in the builder before it's sent, and by `campaignRules`
in `character.build` if it is.

`/api/me` and `/api/threats` no longer exist; both moved under `/api/campaigns/:id/`. `createCampaign` inserts the
campaign and the GM's `membership` in one transaction. The admin key's `ownerUserId` gets an `app_user` placeholder
named "GM" until they sign in. `lobby()` returns the caller's games (`mine`) and every game with a session in progress
(`running`, with `role` null where the caller has no seat); a card never opens a table. `/threats`, `/wargear` and `/rules`
are the REST routes that serve book content: the first two are GM-only, the rules reference needs any seat (see
CLAUDE.md, Copyright).

**Export and import** (`exportCampaign`, `importCampaign` in `campaign.service.ts`). An export is the `LiveState` and
the `Codex`, minus the seats (members, invites, guest tokens), the active encounter and builder drafts. It's GM-only,
because it carries GM notes, secrets and the book text in the sheets. Import doesn't replay actions, which would lose
counters, sessions and reveal times. It writes every row directly, inside `createCampaign`'s transaction (`fill`):
- each row gets a fresh id
- references are remapped through those new ids, and one pointing outside the file is dropped
- threat ids go through the same `checkThreats` as `codex.save`
- a handout audience must name Agents in the file, like `codex.save`: an empty audience means every player, so a
  dropped reader would leak a private handout
- each row's `createdAt` is its place in the file (one transaction shares one `now()`, and lists load in `createdAt`
  order)
- the 2 MB JSON parser is mounted on this route only, after its rate limit; every other route keeps Express's 100 kB
- builds are stored as exported, since a GM can already set any sheet with `character.update`

`fresh` (`freshStart`) keeps the sheets, builds and XP, because a build's XP ledger is spent against `xp`. It resets
the rest: sessions are dropped, the pools emptied, every reveal undone, every Agent rested, and adventures and beats
go back to `planned`.

## 4. Socket lifecycle (`table/table.gateway.ts`)

### Handshake: `afterInit` middleware

Runs before the connection is accepted, so no event can arrive without a `Ctx`.

`handshakeCtx` parses `io({ auth })` with the `Handshake` schema: `{ campaignId?, token?, clerkToken?, adminKey? }`.

| Caller | Sends | Resolves to |
|---|---|---|
| Browser | `{ campaignId }`; the Clerk `__session` or guest `wg_token` cookie rides on the handshake `Cookie` header | `resolveCtx`: the member's seat, else the guest cookie's seat at that campaign |
| Script or test, as a guest | `token` (with or without `campaignId`) | `resolveGuest(token)`, which must match `campaignId` if one is sent |
| Script or test, as a Clerk user | `clerkToken` plus `campaignId` | `resolveCtx` with it as a Bearer token |
| Script (seed) | `adminKey` plus `campaignId` | GM with `userId: null`, if the key matches and the campaign exists |

- A lookup throws (DB unreachable) → refused with `Error("unavailable")`. It's transient, and the web client retries.
- No seat (no, bad, expired or revoked credential, or not a member here) → refused with `Error("unauthorized")`. It's
  permanent, and the web client reloads into its no-access screen.
- Otherwise `socket.data = ctx`.

`readCookie` swallows a malformed `%` escape and returns "no token". Otherwise the throw would be an unhandled rejection in
the middleware and would take the process down. `smoke.test.ts` covers this.

### `handleConnection`

1. Joins one room: `c:<campaignId>:gm` for the GM, `c:<campaignId>:players` for players.
2. Loads `loadState` and `loadCodex` in parallel and emits `state` then `codex` to that socket only: the full versions for
   the GM, and `toPlayerView` / `toPlayerCodex` for players. `state` is skipped if the campaign row is gone.

### The `action` event (`onAction`)

Clients call `emitWithAck("action", ActionInput)` and receive an `ActionResult`:
`{ ok: true, id?, token?, notices? } | { ok: false, error }`. `notices` is one-off text for whoever sent the action,
for something no snapshot can show afterwards: `session.end` reports who crossed a Rank (it needs the XP from before
and after the award) and whether the group may now Ascend.

1. **Parse** `Action.safeParse(body)`. A failure acks `{ ok: false, error: <prettified zod error> }` at once, outside the queue.
2. **Queue** on `serial(ctx.campaignId, …)`.
3. **Transaction:** `db.transaction(tx => applyAction(tx, { ctx, action }))`. `applyAction` calls `authorize` first, so a
   refusal also happens inside the (then rolled back) transaction.
4. **Errors:**
   - An `ActionError` (thrown by `fail()`) rolls back and acks `{ ok: false, error: e.message }`. These messages are
     user-facing.
   - Anything else rolls back, is logged, and acks `{ ok: false, error: "Server error" }`. No stack reaches the client.
5. **After commit:** `kicks(action)` → disconnect the matching sockets. Then `broadcast(campaignId, touches(action))`.
   An error here is logged and **the committed result is still returned**. Reporting a failure would make the client
   retap and apply a delta twice; the next broadcast resyncs everyone.

### Per-campaign serial queue (`serial`)

`tails: Map<campaignId, Promise<void>>`. Each call awaits the previous tail for that campaign, runs, and becomes the new
tail. A rejected run doesn't break the chain. Different campaigns run concurrently.

This makes every check-then-act inside a handler safe, e.g. "no turn in progress" then "set current", or the full-set
check in `beat.reorder`. It's in-process, so it assumes **one api instance** (marked `ponytail:` in the file, and the
upgrade path is pg advisory locks). Direct SQL isn't covered by it.

REST that changes a table goes through `mutate({ campaignId, fn })`: the same `serial` queue, then a `state` broadcast.
Accepting an invite uses it, so two players claiming the last open agent can't both win.

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
| `character.update`, `character.build`, `character.draft`, `character.supply`, `character.fitUpgrade`, `character.removeUpgrade` | `a.id === ctx.characterId` (so a player can't build a new character) | `"Not your character"` |
| `character.update` | no `overrides` field | `"Overrides are GM only"` |
| `character.update` | no `annihilated` field | `"GM only"` |
| `character.update` | no `stats` field | `"Stats are GM only"` |
| `character.update` | no `conditions` field | `"Conditions are the GM's"` |
| `character.supply` | no positive `wealth` or `ammo.delta` | `"Only the GM grants Wealth and Ammo"` (§11.57) |

A player may therefore edit their own character's `name` and `detail`, spend its Wealth and Ammo, and build it or save a builder draft. Nothing else:
Wounds, Shock, Wrath, Glory, Respite, Conditions, raw `stats` and granting Wealth or Ammo are the GM's.

### `touches(action)` → `{ state, codex }`

| Actions | state | codex |
|---|---|---|
| `codex.save`, `codex.delete`, `beat.reorder` | no | yes |
| `beat.startEncounter` (new encounter, and beat status → active), `session.*` (session list) | yes | yes |
| everything else | yes | no |

`token.*` rebroadcasts `state` even though tokens aren't in it. `invite.*` and `member.remove` change `state.access`.

### `kicks(action)` → `Kick` or null

| Action | Kick | Disconnects |
|---|---|---|
| `token.revoke` | `{ characterId, guestsOnly: true }` | guest sockets (`userId` null) playing that character. A member playing it keeps their seat |
| `character.delete` | `{ characterId: a.id, guestsOnly: false }` | every socket playing it. Its tokens and invites are cascade-deleted; a member's `character_id` is set null |
| `member.remove` | `{ userId }` | every socket of that user at this table |

The gateway checks the sockets in both rooms of the campaign.

### `applyAction` routing

A `switch` on `action.type` hands each action to the owning feature's `apply*Action(tx, { ctx, action })`. Each feature
narrows its slice with `Extract<Action, …>` (`CampaignAction`, `CharacterAction`, `EncounterAction`, `CodexAction`),
so a type missing from the switch is a compile error. `invite.*` and `member.remove` go to `applyAccessAction`
(`auth/access.actions.ts`, `AccessAction`).

## 6. Action catalogue

Schemas: `packages/shared/src/actions.ts`. "GM" means GM only. "Own" means a player on their own character, as in §5.
Snapshots: S = `state`, C = `codex`. Rule pages are printed Core pages; behaviour is in [game-logic.md](game-logic.md).

| Type | Who | What it does | Snap | Page |
|---|---|---|---|---|
| `campaign.update` | GM | Patch `name`, `tier`, `framework`, `patron`, `homebrew` (the builder may use Apocrypha and Necrontyr). Existing combatants keep the threat class they were added with. Raising `tier` by hand is still an Ascension to the rules, so it restarts the 100-XP window (every character's `xp_at_ascension` becomes its `xp`); `campaign.ascend` is the path that also awards and waives | S | |
| `campaign.ascend` | GM | Raises the Tier by 1 for the whole group (Core pp.147–148, §11.66). `kind: "experience"` needs every **living** character at 100+ XP in the current Tier (`xp − xpAtAscension`) and names who is short — a Dead character (`pcStatus`) has left the group (Core p.147), and a campaign with none alive is refused; `kind: "milestone"` is the GM's call and first awards every character 100 XP (step 1). Then the Tier moves (refused at Tier 5, and refused with no characters), every character's `xpAtAscension` becomes its post-award `xp`, and `ascensionPackageWaived` takes `waivePackage` — so a waiver is honoured and the next Ascension clears it. One transaction, delta SQL, no read-modify-write | S | Core pp.147–148 |
| `pool.adjust` | GM | `pool += delta`, clamped to `[0, poolMax(pool, #characters)]` | S | p.164, p.320 |
| `session.start` | GM | Every character Wrath → 2. Glory → 0. Ruin → number of characters. Closes any open session (no XP). Inserts session `number = count + 1`. Returns `id`, and a `notices` line naming the built characters with XP left to spend (`xp − xpSpent`, the first `NUDGE_NAMES` of them and then "N more", since the GM report is one line), because XP is spent between sessions (Core p.146, p.148; §11.69) | S C | p.162, p.164, p.320 |
| `session.end` | GM | Open session gets `endedAt`, `recap`, `xp`. Every character `xp += xp`. Acks `notices`: each character that crossed a Rank (Core p.146) and, when every one of them has 100+ XP in the current Tier, that the group may Ascend (Core p.147). Fails `"No session in progress"` | S C | p.321 |
| `character.create` | GM | Insert with `name`, `stats` (default `{}`). Returns `id` | S | |
| `character.build` | GM; Own | Re-runs `resolveBuild` on `build` with the campaign's homebrew setting, and for an existing character `play` (the campaign's Tier now, `character.xp` earned). A new build is at the campaign's Tier; a made one keeps the Tier it was made at, and a player may change only its `advancement` (and the choices under `advance/`): `"Only your GM changes a character's creation choices once it's made"`. Refuses `"Still to choose: …"` or the first problem. Writes the derived `stats`, the `build` and `built_at` (now: the builder drops device drafts older than it) and clears `build_draft`; a made character keeps what play changed (`keepPlay`: Wealth, Ammo, requisitions, gained weapons and gear) and gains only the weapons and gear the new build adds over the stored one (so a save with no changes changes nothing), a first build keeps `ammo` and `requisitioned`. A player's build keeps the stored `build.gm`. `keepSheet` (GM only, refused from a player as `"GM only"`): a first build over a hand-made sheet keeps its armour and gear lines and Wealth, as `keepPlay` would; its weapons are the build's, with their Talents applied on read (rules-flow.md §11.68). The seed uses it for the volkus pregens. No `id`: inserts a character (GM). Returns `id`. It also stamps the purchase history (§11.69): the client's `advancement.boughtIn` is replaced by the stored one, every advancement purchase the resolved ledger names that has no date yet takes the open session's number (else the last session played, else none), and a date whose purchase is gone is dropped. One extra query, and only when something new was bought | S | Core pp.17–38 |
| `character.draft` | GM; Own | Stores a builder draft (any JSON object up to `MAX_DRAFT_CHARS`, or null to clear) in `character.build_draft`, shown in LiveState as `draft`. A player's keeps the GM's part (`gm`) of the stored draft or build. `character.build` clears it | S | |
| `character.update` | GM; Own (`name`, `detail` only) | Patch `name`, `stats`, `overrides`, `conditions`. `stats` and `overrides` replace the whole jsonb value | S | |
| `character.adjust` | GM; Own (no `traumatic`) | Deltas on `wounds`, `shock`, `wrath`, `traumatic`, each floored at 0, no cap. Crossing into Dying adds `Prone` if missing. While Dying, a positive `wounds` delta adds 1 Traumatic Injury instead (one per hit), and a negative one sets Wounds to `least(maxWounds, wounds + delta)`, which ends Dying | S | p.193 |
| `character.supply` | GM; Own (negative deltas only) | Read-modify-write on `stats`: `wealth` delta floored at 0; `ammo: { kind, delta }` via `adjustAmmo` (floored at 0; −1 on an empty type removes it). Refused past `MAX_AMMO_TYPES` (12). No carry cap (§11.14) | S | p.206, p.229 |
| `character.requisition` | GM | Refused without an open session, when this session's slot (`wargear`, or `ammo` for ammo and grenades) is already used, with no Keyword in common (`requisitionTest`), when `spend` exceeds Wealth, or when Wealth is spent on a roll that already succeeded. Success (`icons + spend ≥ Value + Rarity`): with a `wargearId`, a catalogue weapon or grenade joins `weapons` once (`sheetWeapon`: thrown range = N × effective Strength) and other items become a `gearLine`; without one, wargear → `gear` as typed. Plus 1 `loadedWith` Ammo; ammo → +3 of that type; grenades → +5 − Rarity. Wealth −= `spend` (+1 on a Complication). With `fitTo` (a weapon's name) a successful **upgrade** goes straight onto that weapon instead of `gear`, through the same checks as `character.fitUpgrade`; the fit is checked **before** the session's Test is recorded, so a target that can't take it refuses the action and costs no Test. `fitTo` names a weapon only: an armour upgrade is requisitioned into `gear` and then fitted with `character.fitUpgrade`. Stats go through `saveStats` (schema-checked) | S | pp.205–206, p.229 |
| `character.fitUpgrade` | GM; Own | Fits a catalogue upgrade to one of the character's weapons by name, or to the armour they wear (`host: "armour"`, which needs no name: one suit at a time, Core p.231). `host` defaults to `"weapon"`, so an older client is unchanged. Checks the upgrade's `fits` against the host **as it stands** (upgrades already fitted included, so a Trait one added or removed counts), its kind (a weapon unless `fits.kinds` says otherwise, so a grenade is refused), the maximum of three (`exempt: "max"`, Distinction, doesn't count), one per `slot` — the slot being `slotOn[host] ?? slot` (§11.64), and `exempt: "slot"`, a T'au SUPPORT SYSTEM, doesn't take one — and an entry's own `copies` limit. Armour takes the same cap as a weapon (§11.65). A `gmOnly` entry (Matched Pair) is the GM's to fit. The id is written to `fitted` on the weapon or the suit and the upgrade's gear line is consumed; a player must own it, the GM need not (§11.57). An ambiguous name (120 catalogue names are shared by two books) is refused rather than guessed. `healthOf` derives from the upgraded sheet, so a fitted +1 AR counts toward Resilience the way the phones show it | S | Core pp.227–228 |
| `character.removeUpgrade` | GM; Own | Takes an upgrade off a weapon or off the armour (`host`) and back into `gear`. Only what is in `fitted`: an upgrade the build gives the host (§11.42) is changed in the builder, or the next rebuild would put it back. Refused when the gear list is full (60 lines) | S | Core p.227 |
| `character.respite` | GM | Wounds 0, Shock 0, Wrath 2. Refused while Dead or Dying (`pcStatus`, via `healthOf()`) | S | p.193, p.197 |
| `character.delete` | GM | Delete. Cascades to tokens and combatant rows. Kicks the player | S | |
| `token.issue` | GM | New guest token (the GUEST QR) for a character in this campaign. Returns `token` (plaintext, once) | S | |
| `token.revoke` | GM | Stamp `revokedAt` on all of the character's live guest tokens. Kicks guest sockets only | S | |
| `invite.create` | GM | New invite: `mode` `"room"` (no `characterId`) or `"character"` (needs one in this campaign, `maxUses` 1). `allowGuests` defaults to true, `hours` 1–720 (default 12). Returns `id` and the code in `token` (plaintext, once) | S | |
| `invite.revoke` | GM | Stamp `revokedAt` on one live invite. Anyone already seated keeps their seat | S | |
| `member.remove` | GM | Delete a user's `membership` here. Refuses yourself (`"You can't remove yourself"`). Kicks that user | S | |
| `encounter.start` | GM | Deactivate any active encounter, insert an empty one. Returns `id` | S | |
| `encounter.end` | GM | Deactivate all the campaign's encounters | S | |
| `encounter.newRound` | GM | Round + 1. Clear `acted`, `ambushed`, `currentId`, `lastSide`, `seizedSide` | S | p.176–177 |
| `turn.start` | GM | Set `currentId`. Refused if a turn is running, the combatant is out (`isOut`: `"Dead: no more Turns"` / `"Slain: no more Turns"`), already acted, is ambushed in Round 1, or its side isn't `sideUpNext` | S | p.177, p.193, p.324 |
| `turn.seize` | GM | As `turn.start`, but out of order. Needs `canSeize` (refused with `"No need to Seize: the <side> act next anyway"` when that side is up anyway), then spends 1 Glory (Agent) or 1 Ruin (Threat) and sets `seizedSide` | S | p.176–177, p.320 |
| `turn.end` | GM | Mark current `acted`, set `lastSide`, keep `seizedSide` only if the same side. Auto new Round when no combatant `canAct` (Slain and Dead ones don't hold it up) | S | p.176 |
| `combatant.addThreat` | GM | Add a threat from `@wg/data` to the active encounter. Snapshots its stat block and its class at the campaign Tier. `mobCount` makes it a Mob (`mobStart` = `mobCount`). `visibility` defaults to `bars` (rules-flow §11.56). Returns `id` | S | |
| `combatant.addCharacter` | GM | Add a campaign character as a PC combatant. Refuses one already in (`"Already in this encounter"`). Returns `id` | S | |
| `combatant.update` | GM | `ambushed` on any combatant. `label`, `mobCount`, `conditions`, `visibility`, `marker` on threat combatants only. `mobCount` also sets `mobStart = greatest(coalesce(mobStart, 0), mobCount)`; `null` makes it a single Threat again and nulls `mobStart` | S | p.325 |
| `combatant.adjust` | GM | Threat combatants only. Deltas on `wounds`, `shock`, `personalRuin`, floored at 0. On a Mob, `wounds` removes members (clamped `[0, mobStart]`) instead, and one hit of `shock` above the members' max Shock removes one member (a smaller hit does nothing; a Mob keeps no Shock track). Refuses Shock for a threat whose Shock is "–" | S | p.324, p.325 |
| `combatant.aware` | GM | Ambushed combatant pays 1 Glory or Ruin by side, then `ambushed = false` | S | p.177 |
| `combatant.remove` | GM | Delete from the active encounter. `currentId` is nulled by the FK | S | |
| `codex.save` | GM | Insert (no `id`) or full replace (`id`) of one codex row. `data` is validated per `kind` by `CodexInput`. Every referenced id must be in the campaign (`checkRefs()`, `"<What> not found"`): a beat's `adventureId`, `locationId`, `npcIds` and `handoutIds`, an NPC's `factionId`, a location's `parentId` (which can't be itself). A beat's encounter `threatId`s and a bestiary NPC's `statSource.threatId` must exist (`checkThreats()`, `'Unknown threat "x"'`). Handouts stamp `revealedAt` on first reveal and clear it on unreveal. Returns `id` | C | |
| `codex.delete` | GM | Delete one codex row by `kind` and `id` (FK effects in §7). Deleting an NPC or handout also `array_remove`s its id from every beat's `npcIds` / `handoutIds` | C | |
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
`defaultRandom()`, except `app_user.id`, which is the Clerk user id. Timestamps are `timestamptz`. The only unique
constraints beyond primary keys are `invite.code_hash` and `membership (campaign_id, user_id)`.
Campaign-owned rows share `owned()` from `campaign.schema.ts` (`id`, `campaign_id` → campaign **cascade**, `created_at`).
No action or endpoint deletes a campaign; the cascades apply to manual cleanup.

| Table (file) | Purpose | Key columns | FKs (on delete) |
|---|---|---|---|
| `campaign` (`campaign.schema.ts`) | The root. Party Glory and GM Ruin live here | `name`, `tier`, `glory`, `ruin`, `framework`, `patron` | none |
| `session` (`campaign.schema.ts`) | Play sessions and recaps | `number`, `started_at`, `ended_at` (null = in progress), `recap`, `xp` | campaign cascade |
| `access_token` (`auth.schema.ts`) | Guest tokens | `token_hash` (PK, SHA-256 hex), `role` (always `player` now), `character_id`, `revoked_at` | campaign cascade. character cascade |
| `app_user` (`auth.schema.ts`) | Clerk users seen by the api | `id` (Clerk user id), `name` (refreshed from the session token on each request), `updated_at` | none |
| `membership` (`auth.schema.ts`) | A signed-in user's seat at one table | `user_id`, `role`, `character_id` | campaign cascade. app_user cascade. character **set null** |
| `invite` (`auth.schema.ts`) | Invite links | `code_hash`, `mode`, `character_id`, `allow_guests`, `expires_at`, `max_uses` (null = until it expires), `uses`, `revoked_at` | campaign cascade. character cascade |
| `library_character` (`library.schema.ts`) | A character a signed-in user owns outside any campaign (§3.1) | `owner_user_id`, `name`, `build` (null until finished), `draft`, `homebrew`, `detail`, `updated_at`; indexed on the owner | app_user cascade |
| `character` (`character.schema.ts`) | Player characters | `name`, `wounds` (taken, not remaining), `shock`, `wrath`, `traumatic`, `xp`, `xp_spent` (what advancement has spent, from `resolveBuild`), `xp_at_ascension` (the `xp` at the last Ascension, so "100 XP in this Tier" is `xp − xp_at_ascension`), `ascension_package_waived` (Core p.148 step 2), `conditions text[]` | campaign cascade |
| `encounter` (`encounter.schema.ts`) | A fight. At most one `active` per campaign, enforced in code, not by a constraint. Ended ones stay as inactive rows | `active`, `round`, `current_id`, `last_side`, `seized_side` | campaign cascade. `current_id` → combatant **set null** |
| `combatant` (`encounter.schema.ts`) | One PC or threat (or Mob) in an encounter | `order` (display only), `acted`, `ambushed`, `kind`. PC: `character_id`. Threat: `threat_id` (text, no FK: static data), `threat_class`, `label`, `marker`, `mob_count`, `mob_start`, `personal_ruin`, `wounds`, `shock`, `conditions`, `visibility` (`hidden` / `bars` / `stats`, default `bars`) | encounter cascade. character cascade |
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
| `character.dod_raw` | nothing: no code reads or writes it. The Doctors of Doom import it was for is replaced by the planned character builder, so the column can go in a later migration | none |
| `combatant.stat_snapshot` | `Threat`, copied at add time so a data fix doesn't change a running fight | Parsed at startup by `@wg/data`, and cast on read |
| `beat.encounter` | `EncounterEntry[]`, at most `MAX_ENCOUNTER_ROWS` rows once expanded | On write by `CodexInput.beat`. Re-parsed by `beat.startEncounter`, and cast in `loadCodex` |
| `npc.stat_source` | `StatSource` | On write by `CodexInput.npc`, cast in `loadCodex` |

The id arrays have no FK, so `codex.delete` of an NPC or handout clears its id from `beat.npc_ids` / `beat.handout_ids` itself.

## 8. Snapshots (`table/table.state.ts`)

Both loaders read with the top-level `db` after the commit. `loadState` also takes an optional `conn: Db`, so the turn actions can read the live state inside their own transaction (`liveTable()` in `encounter.actions.ts`) and apply the shared `isOut` / `canAct` / `sideUpNext` / `canSeize`.

**`loadState(campaignId, conn = db): LiveState | null`**, where null means no such campaign:

- `campaign`: `id`, `name`, `tier`, `glory`, `ruin`, `framework`, `patron`.
- `access`: `members` (each `membership` joined to `app_user` for the name, by `created_at`) and `invites` (live ones
  only: not revoked, not expired, uses left). No code or hash is ever included.
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
| `toPlayerView` (`state.ts`) | `access.invites` → `[]`. `encounter.upNext` ← `sideUpNext` of the full state; `currentId` → `UNSEEN_ID` while a hidden threat acts. Threat combatants with `visibility: "hidden"` are dropped; with `"bars"`: `stats` → null, `threatId` → `""`, `personalRuin` → 0. Every other character's `objectives` → `[]` | Everything else, including `access.members`, threat label, class, Wounds, Shock, `maxWounds` / `maxShock`, conditions, and every character's full sheet |
| `toPlayerCodex` (`codex.ts`) | All factions and all adventures (so all beats). Unrevealed locations, NPCs and handouts. Location `gmNotes`, `hazards`. NPC `gmNotes`, `secrets`, `statSource` (→ `{ kind: "none" }`), `factionId` (→ null). A location's `parentId` (→ null) unless the parent is revealed. A handout whose `audience` is set and excludes the viewer; `audience` → the viewer's own id only | Revealed locations, NPCs and handouts otherwise whole. All sessions with recaps |

Both take the viewer's `characterId`; the gateway emits one view per character. A new field is visible to players unless one of these functions drops it. Decide when you add it.

## 9. Concurrency and counters

- One action = one transaction. Handlers only write through `tx`.
- Counters change by **delta in SQL**, so two phones tapping `+1 Wound` at once both land. A read-modify-write in app
  code would let the last write win and would also break the "retap after commit" guarantee (§4).
  - `bump(col, d)` (`core/sql.ts`) → `greatest(0, col + d)`. It returns `undefined` for an absent delta, which Drizzle's
    `.set()` skips.
  - `pool.adjust` → `least(poolMax, bump(...))`. The cap is recomputed from the character count on each action.
  - Mob damage → `least(mobStart, greatest(0, mob_count - loss))`, where `loss` = Wounds, plus 1 for a hit of Shock over max.
  - Spending Glory or Ruin (`spend` in `encounter.actions.ts`) → `col - 1 … WHERE col > 0`. Zero rows updated means
    `"No Glory to spend"` / `"No Ruin to spend"`.
  - `session.end` → `xp = xp + n`.
- Absolute sets are used only where the rules reset a value (`session.start`, `character.respite`). `character.adjust`
  reads the row first to know whether the character is Dying; the per-campaign queue (§4) keeps that safe.
- Check-then-act logic (turn order, "already acted", beat reorder) relies on the per-campaign queue (§4).

## 10. Access (`auth/`)

Signed-in users hold a seat through `membership` (gm or player, plus a character). Guests hold a per-character player
token in `access_token`. The admin key is for scripts only. There are no GM tokens: the GM is always a member.

### Clerk (`@wg/auth/api`, `packages/auth/src/api.ts`)

- **Verify:** `verifySession(token)` calls `@clerk/backend`'s `verifyToken` with `jwtKey: CLERK_JWT_KEY` (no network
  call; `CLERK_SECRET_KEY` is the fallback) and `authorizedParties` from `WEB_ORIGIN`, split on commas. An expired,
  forged or wrong-origin token returns null, which reads as signed out.
- **Claims:** the name comes from `name`, else `username`, else `"Player"`. `creator` is `metadata.role === "creator"`.
  These are custom claims: the Clerk Dashboard's session-token template must include
  `{ "metadata": "{{user.public_metadata}}", "name": "{{user.full_name}}", "username": "{{user.username}}" }`
  ([development.md](development.md#clerk)). The creator role is set by hand in the user's public metadata. Both shapes
  are typed once, as Clerk's global `UserPublicMetadata` (`role?: "creator"`) and `CustomJwtSessionClaims`, in
  `packages/auth/type.d.ts`.
- **Where the token comes from:** `bearerOf(Authorization)` first, else the `__session` cookie. `signedInUser()` also
  upserts `app_user` so member lists and the lobby show a current name.
- **Test tokens:** with `CLERK_TEST_SECRET` set, `test.<secret>.<userId>.<creator|member>` is accepted without Clerk.
  `testSessionToken({ secret, userId, role })` builds one. It's for the smoke test only, and the api refuses to start if it's set with `NODE_ENV=production`.

### Invites (`invite.service.ts`, `access.actions.ts`)

- **Create:** `invite.create` stores `sha256(code)` of a `newSecret()` and returns the code once. The web app makes two
  kinds: a **room QR** (`mode: "room"`, 12 h, unlimited uses, guests allowed) and a **per-character link**
  (`mode: "character"`, 168 h, one use).
- **Live** means not revoked, not expired, and `uses < max_uses` (or no limit). Anything else refuses with "This invite
  has expired or was already used. Ask your GM for a new one".
- **Accept** (`acceptInvite`, inside `TableGateway.mutate`): a guest needs `allowGuests`; otherwise the caller must be
  signed in. A signed-in member is already seated, so nothing is used up. Then the character is the invited one, an
  open one the player picked, or a new one by `newCharacterName` (room invites). "Open" means no member plays it and no
  live guest token points at it; a taken one refuses with "That character is already taken". `uses` goes up by one,
  then a member gets a `membership` row (`player`), or a guest gets a new guest token and the `wg_token` cookie.
- **End:** `invite.revoke` ends a link; seats already taken stay. `member.remove` deletes a seat and kicks the user.

### Guest tokens (`auth.service.ts`)

- **Issue:** `issueToken(tx, { campaignId, characterId })` → `randomBytes(24)` as base64url (32 chars), role `player`.
  They come from `token.issue` (the GUEST QR) and from a guest accepting an invite. The plaintext is returned once.
- **Store:** only `sha256(token)` hex, in `access_token.token_hash`.
- **Resolve:** `resolveGuest` matches the hash with `revoked_at IS NULL` and returns `Ctx` with `userId: null`.
- **Revoke:** `token.revoke` sets `revoked_at` on every live guest token of that character. `character.delete` removes
  them by cascade. Both kick the guest's live sockets. A reconnect then fails with `unauthorized`, and `/api/join`
  returns `401`.
- **Cookie** (set by `POST /api/join` and a guest invite accept): `wg_token`, `httpOnly`, `sameSite: "lax"`, `secure`
  only when `COOKIE_SECURE === "true"`, `maxAge` 365 days, `path: "/"`. The web `/join/<token>` route forwards the
  `Set-Cookie` ([frontend.md](frontend.md)).

### Migration `0001`

`drizzle/0001_curly_network.sql` is additive: it creates `app_user`, `membership` and `invite`. Old GM tokens are still
rows in `access_token`, but nothing resolves a GM token any more, so they open nothing.

## 11. Scripts (`apps/api/scripts/`)

It runs against a **running api**, not the DB. Run it from `apps/api` so Bun loads `.env`. There's no
`create-campaign` script any more: creators start empty games in the lobby.

| Script | Does | Env | Output |
|---|---|---|---|
| `bun run seed <pack> --owner <clerk user id>` | `loadPack(pack)` (zod-parsed, [data.md](data.md)). `POST /api/campaigns` with the admin key and `ownerUserId`, which seats that Clerk user (Clerk Dashboard → Users) as GM. Connects a socket with `auth: { adminKey, campaignId }`, then sends normal actions in order: `campaign.update` (framework, patron), factions, locations (parent refs), NPCs (faction refs), handouts, adventures with their beats (location, NPC and handout refs), `character.create` per pack character. Pack `key`s map to returned ids | `ADMIN_KEY`, `API_URL` (else `http://localhost:$PORT`, PORT default 4000), `WEB_ORIGIN` (the first entry) for the link | A count summary and `<WEB_ORIGIN>/c/<campaignId>`. Without `--owner` it refuses to run. The first failed action throws with its error. No guest tokens or invites are issued |

Because seeding goes through the socket, it gets the same validation, scoping and broadcasts as live play.

## 12. Testing

`apps/api/test/smoke.test.ts`: end-to-end over HTTP and Socket.IO against a running api and Postgres (`node:test` run by
`bun test`). Each run creates fresh campaigns ("Smoke", "Edge" and "Elsewhere" for the edge cases, "Invites", "Builder",
"Import"…) and leaves them in the DB. Library rows outlive a run the way a campaign doesn't, so the library tests make a
fresh Clerk user id per run instead.

The api must run with `CLERK_TEST_SECRET` set (dev only), and the test must see the same value: it signs in as Clerk
users with test tokens (`test.<secret>.<userId>.<creator|member>`, §10), sent as `Bearer` headers and socket
`clerkToken`s.

```bash
bun run dev:db && bun run dev:api   # in another shell
bun run test:smoke                  # needs ADMIN_KEY and CLERK_TEST_SECRET (from apps/api/.env); API_URL / PORT optional
```

It covers:

- **REST:** creating a game is `401` signed out, `403` without the creator role, `201` for a creator. `/join` sets the
  HttpOnly cookie and returns the guest's `campaignId`, and a bad token is `401`. `/api/campaigns/:id/threats` is `200`
  for the GM, `403` for a guest player and `401` for someone with no seat. A malformed `wg_token` or `__session` cookie
  gives `401` on `/api/guest` and `/api/lobby` and `unauthorized` on the socket, without crashing the api.
- **Admin socket:** `auth: { adminKey, campaignId }` opens the table as the seed script does.
- **Redaction:** hidden threats not sent, threat stats withheld until `visibility: "stats"`, `maxWounds` visible, and the player codex shows revealed NPCs only,
  without `gmNotes`.
- **Mobs:** Wounds remove members, healing is capped at `mobStart`.
- **Player permissions:** own `character.adjust` passes and clamps at 0. Glory is allowed, Ruin is `"GM only"`,
  `combatant.remove` is `"GM only"`, another character is `"Not your character"`, and an invalid payload is refused.
- **Turns:** alternation, "End the current turn first", "Already acted this round", Seize refusal and cost, auto new
  Round, GM Seize at Round start.
- **Ambush:** blocked in Round 1, then `combatant.aware`.
- **Sessions:** `session.start` resets and `session.end` awards XP.
- **Pools:** caps, asserted against `poolMax`.
- **Revoke:** `token.revoke` kicks the guest socket and kills the link.
- **Accounts** (fourth test): a room invite's preview, claim refused signed out, claimed by a member, "already taken"
  for a second claim, a guest claim with a new character and the guest cookie opening the table. A member plays only
  their own character and can't create invites, and players see no invites. A character invite refuses a guest when
  accounts-only and is used up after one claim. The lobby's `canCreate`, `mine` and `running` (a card, not a seat).
  `invite.revoke` ends the link, `member.remove` kicks the member, and the GM can't remove themselves.
- **Rules edge cases** (third test):
  - `campaign.update`, `character.update` and `character.delete`.
  - Dying: falling Prone, a Wound becoming a Traumatic Injury, healing ending Dying.
  - Respite refused while Dying and while Dead.
  - A duplicate `combatant.addCharacter` is refused.
  - `turn.start` refused for a Dead Agent and a Slain Troop, and the Round rolls over past them.
  - A no-need Seize is refused.
  - `encounter.newRound`, `combatant.remove` and `encounter.end`.
  - Mob size set by hand (`mobStart` follows), and Mob Shock above and below max.
  - Players get no `threatId` or `personalRuin` for a bars-only Threat, none of a hidden one, and no NPC `factionId`.
  - Codex reference checks: another campaign's faction, an unknown threat.
  - `beat.reorder`, NPC delete clearing beats' `npcIds`, and `beat.startEncounter`.

- **The character library** (§3.1): `/library`, `/creation` and `/rules` are `401` signed out and for a guest cookie.
  The catalogue's `ETag` gives a `304`, and `?homebrew=1` brings the homebrew books in. CRUD as the owner, a `404` on
  every verb for another user, a build refused in the builder's words, `gm` cleared on the way in, `LIBRARY_CAP`
  enforced and freed by a delete, and the lobby carrying the same characters.
- **Import** (§3.1): a library build saved into a Tier 4 campaign through plain `character.build`, the campaign copy
  unchanged by later library edits, and a Tier 2 campaign refusing it ("This campaign is Tier 2; build for Tier 2").

Pure rules functions are unit-tested in `packages/shared` (`bun run test`), see [game-logic.md](game-logic.md).

## 13. How-to

### Add an action

Worked example: a hypothetical `character.clearConditions` that a player may send for their own character (today
Conditions are GM only, §11.57; the example only shows the steps).

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
   to regenerate the migrations, then `docker compose down -v` (this wipes the DB volume) and `bun run dev:db`.
   Once real data exists, always add migrations and never rewrite them.
4. If players see it: add it to `loadState` / `loadCodex` and the shared `LiveState` / `Codex` types, and decide its
   redaction in `toPlayerView` / `toPlayerCodex`. If it's editable codex data: add it to `CodexInput`.

### Add a REST endpoint

REST is for things that can't be socket actions: setup, login, GM-only reads. **Game mutations are actions** (the one
mutation path).

1. Add a method to `CampaignController`, or add a new `@Controller()` to `AppModule.controllers`. The `api` prefix is
   global. The Next rewrites already forward `/api/*`.
2. Parse the body with a zod schema. `parse()` in `campaign.controller.ts` turns a failure into a `400`.
3. Resolve the caller with `resolveCtx({ campaignId, headers: headersOf(req) })` for a table route (`401` if null), or
   `signedInUser(headersOf(req))` for a route outside any table. Check `ctx.role` and throw `ForbiddenException` for the
   wrong role. `parse`, `headersOf` and `refusing` are module-private, so move them to `auth/` if a second controller
   needs them. If the route changes who's at a table, run it through `TableGateway.mutate` so it's queued and
   broadcast.
4. Put the logic in a `*.service.ts` function with no Nest imports, scoped to `ctx.campaignId`.
5. Never return book content or GM-only data to a player role.

## 14. Environment (`apps/api/.env.example`)

Bun loads `apps/api/.env` automatically.

| Var | Example | Effect |
|---|---|---|
| `DATABASE_URL` | `postgres://wg:wg@localhost:5434/wg` | Postgres connection. Required: `core/db.ts` throws at import if it's unset. Port 5434 matches `docker-compose.yml` |
| `ADMIN_KEY` | `change-me` | Script-only secret: `POST /api/campaigns` with `x-admin-key` (and `ownerUserId`), and a socket with `auth: { adminKey, campaignId }`. If unset, only creators can create campaigns. Read by the seed script and the smoke test |
| `WEB_ORIGIN` | `http://localhost:3000` | Comma-separated web origins: list localhost and the LAN address. Socket.IO CORS origins (CORS is disabled if unset) and Clerk's `authorizedParties`. The seed script prints its first entry |
| `CLERK_SECRET_KEY` | (Clerk Dashboard → API keys) | Clerk backend key, the fallback for verifying sessions |
| `CLERK_JWT_KEY` | (Clerk Dashboard → API keys, PEM public key) | Verifies session tokens locally, with no network call |
| `CLERK_TEST_SECRET` | empty | **Dev/test only.** Enables the smoke test's fake Clerk tokens. The api refuses to start with it when `NODE_ENV=production` |
| `COOKIE_SECURE` | `false` | `"true"` adds `Secure` to the guest cookie. Set it behind HTTPS |
| `PORT` | `4000` | Listen port (default 4000). The scripts and test use it to find the api when `API_URL` is unset |

`API_URL` isn't in the example. Only the scripts and the smoke test read it, to target a non-local api.
