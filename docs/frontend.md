# Frontend: `apps/web`

How the web app works and how to change it safely. The system picture is in [architecture.md](architecture.md), the
api in [backend.md](backend.md), the rules functions in [game-logic.md](game-logic.md), and setup and commands in
[development.md](development.md). The binding style rules are in
[`.claude/frontend-code-style.md`](../.claude/frontend-code-style.md).

Stack: Next.js 16 (App Router), React 19, Clerk through `@wg/auth`, `socket.io-client`, `qrcode`, `lucide-react` (icons), and plain CSS in
`app/globals.css`. There is no UI framework, no client-side data reads and no client router beyond tab state. `/` is the
lobby, and one table page (`/c/<campaignId>`) renders either the GM app or the player app, depending on the caller's
seat.

---

## 1. Routes and entry

| Path | File | Kind | Job |
|---|---|---|---|
| `/` | `app/page.tsx` | Server Component | The lobby for a signed-in user, a redirect to a returning guest's table, or a sign-in landing |
| `/c/<campaignId>` | `app/c/[campaignId]/page.tsx` | Server Component | Asks `/api/campaigns/:id/me` for the caller's seat, and renders `GmApp`, `PlayerApp` or a `StatusScreen` |
| `/invite/<code>` | `app/invite/[code]/page.tsx` | Server Component | Previews an invite and renders `InviteAccept` |
| `/sign-in`, `/sign-up` | `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx` | Server Component | Clerk's `<SignIn />` and `<SignUp />` |
| `/library/<characterId>` | `app/library/[characterId]/page.tsx` | Server Component | The builder on a character in the signed-in user's own library (issue #14): no campaign, no seat |
| `/join/<token>` | `app/join/[token]/route.ts` | Route handler (`GET`) | Swaps a guest token for the guest cookie, then redirects to its table with a 303 |
| `/manifest.webmanifest` | `app/manifest.ts` | Metadata route | "Add to home screen": `display: standalone`, `start_url: /`, colours from `TOKENS.bg` |
| `/api/*`, `/socket.io/*` | `next.config.ts` | Rewrites (dev only) | Proxied to the api |

`app/layout.tsx` loads the fonts, sets `metadata` and `viewport` (`themeColor: TOKENS.bg`), imports `globals.css`, and
wraps the body in `<AuthProvider>` (`@wg/auth/react`: `ClerkProvider` with `signInUrl="/sign-in" signUpUrl="/sign-up"`). Without
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` every page answers 500 with "Missing publishableKey" (see
[development.md](development.md#clerk)).

### Identity: `proxy.ts` and `app/server-api.ts`

- **`proxy.ts`** (Next 16's middleware file) runs `authMiddleware()` (`@wg/auth/next`, Clerk's `clerkMiddleware`) so Clerk can keep its session fresh. It protects
  nothing: each page decides whether it needs a signed-in user, because guests join without an account. Its matcher
  excludes `/api`, `/socket.io`, `_next` and static files; the api checks the Clerk token itself.
- **`loadRulesSignedIn()`** and **`loadCreationFor(homebrew)`** are the library's loaders, hitting the seatless
  `/api/rules` and `/api/creation`.
- **`apiGet(path)`** calls the api directly at `API_ORIGIN` (`app/constants.ts`, env `API_ORIGIN`, default
  `http://localhost:4000`) with `cache: "no-store"`. It sends the Clerk session as `Authorization: Bearer
  <sessionToken()>` (`@wg/auth/next`), and forwards the guest cookie (`TOKEN_COOKIE` = `wg_token`), which is httpOnly, so only the
  server can read it.
- **The browser** reaches the api through the rewrites, so the Clerk `__session` cookie and the guest cookie ride along
  on its own requests (NEW GAME, accepting an invite, the socket handshake).

### `/`: `app/page.tsx`

The checks run in this order, and the first one that matches decides what renders:

| Condition | Renders |
|---|---|
| `?join=invalid` or `?join=nosignal` (checked **before** anything else) | `JOIN_ERRORS[join]` |
| Signed out, and `/api/guest` finds a guest cookie's table | a redirect to `/c/<campaignId>` |
| Signed out | The sign-in landing: AUSPEX, SIGN IN (to `/sign-in`), and a hint that guests scan the GM's QR code |
| Signed in, `/api/lobby` fails, errors or doesn't parse as `Lobby` | `JOIN_ERRORS.nosignal` |
| Signed in | `<LobbyView lobby={…} />` |

**`LobbyView`** (`components/lobby/lobby-view/lobby-view.tsx`) has Clerk's `<UserButton />` in the header and four
sections:

- **YOUR GAMES** (`lobby.mine`): a card per seat with a GM or PLAYER chip and OPEN (to `/c/<id>`).
- **YOUR CHARACTERS** (`lobby.characters`, issue #14): the caller's own library — the Tier, the archetype once the build
  resolves, ready or in progress, and a homebrew mark. OPEN goes to `/library/<id>`; DELETE asks once (the button turns
  to CONFIRM), because no GM owns these, then `router.refresh()`. NEW CHARACTER posts an empty row and opens its
  builder, with the count beside it, and is disabled at `LIBRARY_CAP`.
- **RUNNING NOW**: games with a session in progress where the caller has no seat (`running` filtered to `role: null`).
  They're cards only, with no OPEN: joining needs an invite.
- **NEW GAME**, only when `lobby.canCreate` (the Clerk creator role): a name and a Tier from `TIERS`. CREATE AS GM POSTs
  to `/api/campaigns` from the browser, then pushes to `/c/<campaignId>`. Setup is REST, not a table action. A refusal
  shows inline.

### `/c/<campaignId>`: `app/c/[campaignId]/page.tsx`

| Condition | Renders |
|---|---|
| `/api/campaigns/:id/me` returns 400 (bad id) or 401 (no seat) | NO ACCESS |
| Any other non-2xx, or the body fails `Me.safeParse` | `JOIN_ERRORS.nosignal` |
| The fetch throws (api down) | `JOIN_ERRORS.nosignal` |
| `role: "gm"` | `<GmApp campaignId={…} bestiary={…} />` |
| A player with no `characterId` (their character was deleted) | `NO CHARACTER YET. ASK YOUR GM.` |
| A player | `<PlayerApp campaignId={…} characterId={…} />` |

The messages (`app/constants.ts`):

| Key | Text |
|---|---|
| `NO_ACCESS` | `NO ACCESS. ASK YOUR GM FOR AN INVITE.` |
| `JOIN_ERRORS.invalid` | `LINK INVALID OR REVOKED. ASK YOUR GM FOR A NEW QR CODE.` |
| `JOIN_ERRORS.nosignal` | `NO SIGNAL. CHECK THE CONNECTION AND RETRY.` |

For the GM, `loadBestiary` fetches `/api/campaigns/:id/threats` on the server, parses it with `Threat.array()` and sorts
it by name. Any failure gives `[]`, so the add-threat pickers are simply empty. The bestiary is passed down as a prop;
the client never fetches it. `loadScenePresets` does the same for `/api/campaigns/:id/scene-presets` (the scene editor's sample DNs, event tables
and Ruin and Glory lists; failure gives none). `loadWargear` does the same for `/api/campaigns/:id/wargear` (the requisition form's
catalogue), fetched in parallel; failure gives `[]` and the form takes typed entries. `loadRules` fetches
`/api/campaigns/:id/rules` for every seat (a player's lacks the `gm` entries) and passes it to both apps' RULES tab (`components/ui/rules-ref`: search over
name, gist and text, a kind filter, one `<details>` per entry: the gist on the collapsed row, the verbatim text inside); failure gives `[]` and the tab says the archive is unreachable. Both apps also wrap their screens in
`RulesProvider` with the same rules, so a weapon trait or Condition shown anywhere opens its entry in place (§5,
`RuleLink`). Nothing new is fetched and the book text stays behind the seat check.

### `/c/<campaignId>/build/<characterId>`: `app/c/[campaignId]/build/[characterId]/page.tsx`

The character builder (issue #9). `<characterId>` is `new` (`NEW_CHARACTER`) for a character not made yet, GM only; a
player may open only their own. The page checks the seat, fetches `/api/campaigns/:id/creation` (parsed with
`CreationPayload`) and renders `Builder` (`components/builder/`):
- **Draft:** the choices so far (`Draft`: a `CharacterBuildInput` with the archetype optional, plus the name and
  `savedAt`), kept in `localStorage` per table and character (`draftKey`). It starts from the newer of that and the
  draft sent to the table (`character.draft`, `Character.draft`), else the saved `character.build`, else blank. A
  table's draft records the save it was opened on (`Draft.builtAt`, from `Character.builtAt`); once the character has
  been built again since, from another device or by a script (the issue #18 and #27 migrations), the draft is stale and
  dropped, detail and all, with no clocks compared. START OVER drops the local one.
- **SEND TO GM** (players, on REVIEW): puts the draft on the table. PARTY then shows OPEN DRAFT for that character; the
  GM ticks what only the GM judges and saves, which clears the draft.
- **Live preview:** every change runs `resolveBuild` from `@wg/shared` (`useMemo`); the screens read its sheet,
  ledger, `pending`, `choices` (every grant choice with its picker kind and answer) and `problems`. `BuilderContext`
  (`useBuilder()`) carries the draft, the result and the catalogue lookups.
- **Screens** (`StepNav`, one tab per Core p.17 step, "N LEFT" per tab): TIER (budget; the GM's HOMEBREW switch, which
  reloads the page), ARCHETYPE, CUSTOMISE (ratings, USE SUGGESTIONS, Talents, powers for a PSYKER, Advancement
  Packages), FACTION (placeholder fills, Background and its one bonus, option groups), ASCENSION (only below the
  campaign's Tier), DETAIL (name, languages, Wealth), REVIEW (the sheet as the play sheet will show it; for the GM, the
  ticks and this character's rulings: species, keywords, gear swaps). Grant choices render as `ChoiceCard`s.
- **Ledger:** a side panel from 900px (`XpLedger`), a fixed bottom bar on a phone (`XpBar`). Its IN PLAY section groups
  the purchases by the session they were bought in, latest first (`LedgerRow.session`, §11.69); anything the server has
  not dated — not saved yet, or bought before the app recorded it — sits last under NOT RECORDED YET.
- **Save:** `character.build`; the server re-resolves and refuses anything not ready. Then, for the GM, a
  `character.update { overrides }` with the Traits REVIEW changed merged over the live ones (`mergeOverrides`): they
  live on the character, not in the build or the draft. A new character's id is kept, so a retry doesn't add another. Success clears the draft and goes back to the table.
- **Weapon lines** show the profile as the table plays it: the fitted upgrades (`withUpgrades`), then the standing
  weapon effects at the Rank the XP earned gives (`withWeaponEffects`, rules-flow.md §11.68), with "with Bolter
  Discipline" naming what changed it and the notes (re-rolls, bonus dice, GM calls) under it, each cited. The api
  applies both for the live sheet (`toCharacter`), the builder for its REVIEW preview.
- **GM part** (REVIEW, GM only): ticks, species and keywords by ruling, gear swaps, BONUSES BY RULING (`gm.mods`, added
  to a Trait) and OVERRIDES (pin a Trait, `character.overrides`). DETAIL has the portrait (`detail.portrait`).
- **SAVE DETAILS ONLY** (the GM, on a character that exists): `character.update` with the name, detail and the
  overrides changed here (`mergeOverrides`), leaving the build and the sheet as they are. It's how a hand-made sheet
  (PARTY's ADD, LOAD STATS) is renamed and ruled on without a build; its Attributes, Skills and lists change through
  LOAD STATS or a build (issue #18 dropped the inline editor). REVIEW offers it even before an archetype is chosen.
- Long catalogue lists (`RecordList`) show `LIST_LIMIT` matches and ask for a narrower search instead of virtualising.

- **ADVANCE** (issue #9 step 5), once the character is made: the Customise screen for `advancement`, spending the XP
  earned in play (`character.xp`) with Rank from it, Advancement Packages and languages. The ledger and the XP bar
  switch to that XP. A player's made character shows only ADVANCE and REVIEW (plus ASCENSION while the group has
  Ascended); the GM sees every screen. `?step=<screen>` opens the builder on one screen, which is how the sheet's
  LEVEL UP badge lands on ADVANCE.
- **ASCENSION in play** (issue #15 step 6): after the group Ascends, the one Ascension Package for that Ascension
  (Core p.148, §11.55) **or** Archetype Ascension (Core p.155, §11.67 — the archetypes of the same Faction at the Tier
  Ascended to). The screen states the Rank 3, GM-agreement and equal-or-exceed conditions and disables nothing:
  `resolveBuild` decides and the screen shows its problems. A waived package says one may still be taken.
- **The sheet's XP line** (issue #15 step 5): XP earned, XP to spend (`xp − xpSpent`) and Rank (`rankOf`), with a
  LEVEL UP badge onto ADVANCE while there is XP to spend. PARTY prints the same per character.
- **ASCEND on PARTY** (issue #15 step 6): who has 100+ XP in the current Tier, then Experience Ascension (enabled only
  when every character does) or Milestone Ascension (always the GM's, with the waive-the-package tick). Two taps, since
  it changes every character's Tier.

Entry points: EDIT (OPEN DRAFT when a player sent one) per character and NEW FROM BUILDER in PARTY, the one editor
for a character (issue #18); CHARACTER BUILDER (SPEND XP once made) on
the player SHEET.

### `/library/<characterId>`: the builder without a campaign

Issue #14. The same builder on a character the signed-in user owns and no table does. Everything the two differ in sits
in one `Bench` (`components/builder/builder.tsx`): the Tier and who picks it, the books, where the draft is kept, how it
saves, whether it can import, and the strip along the top. `TableBench` builds one from the socket, `LibraryBuilder`
from the library row, and the `Workshop` below is the same screen either way.

In library mode:

- **No `useTable`:** no socket, no live state. The page loads the row (`/api/library/:id` → `LibraryEntry`), then the
  catalogue for that row's own `homebrew` and the rules reference.
- **The owner picks the Tier** (`TIERS`, with each Tier's starting XP) and the homebrew books per character; the switch
  saves and calls `router.refresh()`, because the catalogue is served already filtered.
- **Drafts autosave** to the library `AUTOSAVE_MS` (1.5 s) after the last change, keyed `wg-build:library:<id>` on the
  device. A failed save shows in the top strip; the draft is still on the device. Which draft an open starts from is
  `pickDraft` (`components/builder/utils.ts`, unit-tested): the newer of this device's and the row's, except that a build
  finished on another device after this device wrote its draft wins, because that draft is a stale half-build. Opening a
  character never autosaves (the first render only writes the device's copy), and SAVE and START OVER drop a pending one
  (`cancelAutosave`), so a debounced draft can't land on a row that was just finished.
- **No GM part:** `role: "player"`, so no `GmPart`, no archetype GM notes, and no SEND TO GM — a library character has
  no GM to send to. `made` is false and there's no `play`: advancement belongs to the campaign copy.
- **NEW CHARACTER** posts an empty row from the lobby and pushes to it, so the builder has somewhere to autosave. It's a
  POST rather than a link on purpose: the session cookie is `SameSite=Lax`, so a plain GET that writes would let a
  cross-site navigation create characters in someone's library. At `LIBRARY_CAP` the button is disabled, and the api
  refuses anyway.
- The lobby's **YOUR CHARACTERS** (`LobbyView`, from `Lobby.characters`) lists them with OPEN, a confirm-once DELETE,
  and NEW CHARACTER with the count, disabled at the cap.

**IMPORT FROM LIBRARY** (`components/builder/components/import-library/`) runs the other way, on a *campaign* builder's
TIER step (`importable`: a table, and not a player's locked character). It lists the caller's library, copies the chosen
build into this draft with `gm` cleared, and jumps to REVIEW; the existing flow then saves it (a player sends it to the
GM, the GM ticks and saves). The picker refuses a character built at another Tier, one needing homebrew this campaign
doesn't allow, and one still in progress — each row says which — so a mismatch never reaches the server, which refuses
it anyway. The import is a copy: later library edits don't change the campaign character. A guest on a QR code has no
account, so the picker says so instead of showing an empty list.

### `/invite/<code>`: `app/invite/[code]/page.tsx`

The room QR and per-character invite links point here. The page fetches `/api/invites/:code` with `apiGet`:

- A 400 (expired, revoked or used up) shows the api's message, upper-cased, or `JOIN_ERRORS.invalid`.
- Anything else that doesn't parse as `InvitePreview`, or a throw, shows `JOIN_ERRORS.nosignal`.
- Otherwise it renders **`InviteAccept`** (`components/invite/invite-accept/invite-accept.tsx`):
  - Already a member: YOU'RE SEATED · OPEN TABLE.
  - Signed out: SIGN IN TO JOIN (to `/sign-in?redirect_url=/invite/<code>`), plus a note that guests may join below, or
    that the table needs an account when `allowGuests` is false.
  - A character invite: PLAY <NAME> (or PLAY <NAME> AS GUEST), and SHEET.
  - A room invite: PICK YOUR AGENT from `openCharacters` (portrait, name, archetype, PLAY and SHEET), or a NEW AGENT
    NAME form.
  - SHEET is `SheetDialog` without `table`: the play sheet, read-only, so a player can compare Agents before choosing.
  - Each choice POSTs to `/api/invites/:code/accept` from the browser, with `asGuest` set when signed out, then pushes
    to `/c/<campaignId>`. A refusal (such as "That character is already taken") shows inline.

### `/join/<token>`: `app/join/[token]/route.ts`

The GUEST QR codes point here. `GET` awaits `params` (a Promise in Next 16), then POSTs `{ token }` to
`${API_ORIGIN}/api/join`.

| api result | Response |
|---|---|
| 2xx | 303 to `/c/<campaignId>` from the response body (or `/` if it has none), with every `Set-Cookie` from the api copied across (`getSetCookie()`) |
| 400 or 401 (a rejected token) | 303 to `/?join=invalid` |
| Any other status (5xx: the link may still be fine) | 303 to `/?join=nosignal` |
| The fetch throws | 303 to `/?join=nosignal` |

The `Location` header is relative, so the redirect stays on whatever host the phone used (`auspex.ydothien.work` in prod,
`:3000` in dev). The error keys are the `JoinError` type from `JOIN_ERRORS` in `app/constants.ts`.

### `next.config.ts`

- `transpilePackages: ["@wg/shared"]`: shared is imported as TypeScript source.
- `output: "standalone"`.
- Rewrites send `/api/:path*`, `/socket.io/` and `/socket.io/:path*` to `API_ORIGIN`, so in dev the browser sees one
  origin: the cookie is first-party and there's no CORS. Prod uses the same rewrites, websockets included ([deploy.md](deploy.md)).
- `skipTrailingSlashRedirect: true`: socket.io's path is `/socket.io/`. Without this, Next answers it with a 308 to
  strip the slash and the handshake breaks. The explicit `/socket.io/` rewrite sits beside `/socket.io/:path*`
  because, per `CLAUDE.md`, the handshake gets a 308 or a 404 without both. Keep both rules and the flag together.

---

## 2. `hooks/use-table/use-table.ts`

`useTable(campaignId)` is the only link to live state. Both apps call it once at the top with their `campaignId` prop
and pass `state`, `codex` and `send` down as props.

```ts
const { state, codex, online, send } = useTable(campaignId);
```

| Returns | Type | Meaning |
|---|---|---|
| `state` | `LiveState \| null` | The latest `state` snapshot (campaign, pools, characters, encounter). `null` until the first one arrives |
| `codex` | `Codex \| null` | The latest `codex` snapshot. `null` until the first one arrives |
| `online` | `boolean` | Set by socket `connect` / `disconnect` |
| `send` | `Send = (a: ActionInput) => Promise<ActionResult>` | The only way to change anything |

- **One socket per tab, for one table:** `io({ withCredentials: true, auth: { campaignId } })`, same origin. The
  browser sends Clerk's `__session` cookie, or a guest's httpOnly `wg_token` cookie, on the handshake, and the server
  resolves the seat at that campaign. The server pushes a full snapshot on connect and after every change, and the hook replaces its state
  wholesale (`s.on("state", setState)`, `s.on("codex", setCodex)`). A reconnect needs no special logic. The players
  room gets the filtered views; see [architecture.md](architecture.md).
- **Snapshots are never cleared on disconnect.** The last state stays on screen under the offline badge.
- **`connect_error`:**
  - If `s.active` is true, it was a transport error and socket.io is already reconnecting, so the hook does nothing.
  - If the server's auth middleware refused with `"unauthorized"` (a revoked token, a removed seat, a signed-out
    session), it calls
    `location.reload()`, and the reload lands on the NO ACCESS screen.
  - Any other refusal (a DB blip) retries `s.connect()` after `REFUSED_RETRY_MS` (3 s). socket.io doesn't retry
    middleware refusals on its own.
- **`send(action)`:**
  - If the socket isn't connected, it returns `{ ok: false, error: "No signal" }` without sending.
  - Otherwise it calls `emitWithAck("action", a)` with `ACK_TIMEOUT_MS` (5 s) and returns the server's
    `ActionResult`: `{ ok: true, id?, token? }` or `{ ok: false, error }`. `id` is the new row for creates;
    `token` is the guest token from `token.issue`, or the invite code from `invite.create`.
  - On timeout it returns `{ ok: false, error: "No reply from server. Check before retrying" }`. The action may
    still have been applied, and counters are deltas, so tapping again could double it.
  - `send` never throws. Callers check `r.ok` and show `r.error`.
  - **Tap feedback:** `send` marks the button that triggered it: the focused button, or the last one pressed within
    1 s (a capture `pointerdown` listener, because iOS doesn't focus tapped buttons). The button gets `aria-busy` until
    the reply, then `data-sent="ok"` or `"no"` for 600 ms. `globals.css` dims a busy button in a slow pulse and rings
    a sent one once: in its own text colour when applied, crimson when refused. Every button also darkens while
    pressed (a `.btn` sinks slightly), since touch screens have no hover. A send without a recent tap, such as the
    command line's Enter, marks nothing.
- **Wake lock:** it requests `navigator.wakeLock.request("screen")` on mount and again on every `visibilitychange`
  back to visible, and releases it on unmount. A denial is swallowed on purpose: the screen may dim, and nothing else
  breaks.

---

## 3. GM app: `components/gm/`

`gm-app/gm-app.tsx` (`GmApp`) is the tablet shell. It shows `SYNCING COGITATOR…` until both snapshots arrive.

- **Header** (`.gm-head`):
  - `AUSPEX // <CAMPAIGN> // T<tier>`.
  - `RND nn` while an encounter is live.
  - One `.pool` per `Pool.options` (Glory, Ruin). Each shows `current/max`, with the cap from `poolMax(p, players)`,
    and has − / + buttons that send `pool.adjust` ±1. A refusal shows in the page's `Refusal` banner.
- **Tabs:** `GM_TABS` in `gm-app/constants.ts` = TRACK, PREP, CODEX, PARTY. The selected tab is local state and
  starts on TRACK.

| Tab | Component | Files |
|---|---|---|
| TRACK | `Tracker` | `tracker/tracker.tsx`, `tracker/constants.ts`, `tracker/types.ts`, `tracker/components/add-combatants/add-combatants.tsx` |
| PREP | `Prep` | `prep/prep.tsx`, `prep/types.ts`, `prep/utils.ts`, `prep/components/beat-editor/{beat-editor.tsx,constants.ts}` |
| CODEX | `CodexView` | `codex/codex.tsx`, `codex/constants.ts`, `codex/types.ts`, `codex/components/codex-editor/{codex-editor.tsx,constants.ts}` |
| PARTY | `Party` | `party/party.tsx`, `party/constants.ts`, `party/components/qr-dialog/qr-dialog.tsx` |

### 3.1 TRACK: live combat tracker

With no encounter live, the tab shows NO ACTIVE ENCOUNTER and a START ENCOUNTER button (`encounter.start`). A beat's
prepared encounter can also be started from PREP.

**Status strip** (top panel):
- The turn state: `▶ <NAME> ACTING`, `AWAITING: <SIDE> PICK` (from `sideUpNext(state)`), or `ROUND COMPLETE`.
- `NEXT: <side>` and `<SIDE> SEIZED`, when they apply.
- The round, plus how many of each side have acted, as `AGENTS acted/total · THREATS acted/total`.

**Rows** are grouped by `Side.options` (agents, then threats). Each row is a `<button>` with `aria-pressed` set while it's
selected, and tapping one toggles `selected`.

| Column | Content |
|---|---|
| STATE | A word, never colour alone: `▶ ACTING`, `DONE`, `AMBUSHED` (Round 1 only), `READY` |
| DESIGNATION | The name, with a marker swatch for threats that have a marker |
| CLASS | `AGENT`, or `THREAT_CLASS_LABEL[threatClass]` (TROOP / ELITE / ADVERSARY / MONSTROUS) |
| WOUNDS | A `Bar` of Wounds left (red once damaged). Mobs show `×count OF start` instead |
| SHOCK | A `Bar`, or `—` when max Shock is `null` |
| DEF / RES | PCs: from `deriveStats`. Threats: from the snapshotted `stats` |
| STATUS | `StatusChips` from `pcStatus` / `threatStatus`, plus Condition chips |
| PLAYERS | What the phones see (`VISIBILITY_LABEL`): `FULL`, or in red `BAR ONLY` / `HIDDEN` (not sent at all) |

Row CSS classes: `.now` is the one acting (highlighted background), `.sel` is selected (fg border), and `.done` has
acted (dimmed). Below 900px, the columns marked `.hide-sm` (CLASS, SHOCK, DEF, RES, PLAYERS) are hidden.

**Key bar** (`.keys`). Which buttons show depends on the encounter and the selection:

| Button | Shown when | Sends |
|---|---|---|
| END TURN | Someone is acting | `turn.end` |
| START TURN | Nobody is acting and `canAct(state, sel)` (so never for a Slain threat or a Dead PC) | `turn.start` |
| SEIZE · 1 GLORY / 1 RUIN | As START TURN, and also `canSeize(state, side)` (hidden when that side is up next anyway) | `turn.seize` |
| DMG / HEAL / SHOCK / RECOVER | A row is selected | Opens the amount pad |
| ±COND select | A row is selected | Toggles one of `CONDITIONS` (`character.update` or `combatant.update` with the full list) |
| PLAYERS: select (`VisibilitySelect`) | A threat is selected | `combatant.update { visibility }`: HIDDEN, BAR ONLY or FULL (rules-flow §11.56) |
| AMBUSH / AWARE · cost | Round 1, and the selected row hasn't acted | `combatant.update { ambushed: true }` / `combatant.aware` |
| REMOVE | A row is selected | `combatant.remove`, then clears the selection |
| NEW ROUND, END ENC | Always | `encounter.newRound`, `encounter.end` |

The Seize and Aware cost label is `1 GLORY` when the selected combatant is an agent, and `1 RUIN` otherwise. The
server charges the cost; see [game-logic.md](game-logic.md).

**Amount pad.** DMG, HEAL, SHOCK and RECOVER set `amountFor` to a `CounterAction` key. The key bar is then replaced by
`AMOUNTS` (1 2 3 4 5 6 8 10) and CANCEL. A tap sends one delta built by `counterAction`:

- PCs send `character.adjust` on the character.
- Threats send `combatant.adjust` on the row.
- `COUNTER_ACTIONS` (`lib/command/constants.ts`, shared with the command line) maps each key to a `field` and a `sign`. Wounds count up, so HEAL is a negative Wounds delta.

**Side panel** (`.tracker-side`):
- A selected threat shows its class rule chips (`THREAT_CLASS_RULES`, pp.323–324), then its snapshotted `StatBlock`.
  If the stat block has Personal Ruin, the panel also has a counter with SPEND (−1) and +1
  (`combatant.adjust { personalRuin }`).
- A selected PC shows archetype and keywords; DEF, RES, Determination and Resolve; Wrath; Traumatic `n/max` with a
  +TRAUMATIC button (`character.adjust { traumatic: 1 }`); ANNIHILATED with a RESTORE button when set; and weapon
  lines.
- Below either one sits the **vox log**.

**Vox log and undo.**
- `run(action, text)` (the `Run` type in `tracker/types.ts`) wraps `send`. On success it pushes a `LogEntry` to the
  top of the log, capped at `LOG_LIMIT` (40). On refusal it sets the tracker's error line.
- Each entry carries `undo` and a `note` from `preview({ action, state })`, read against the state at tap time. For
  `character.adjust` and `combatant.adjust` it runs the same rules as the api (`pcHit`, `exhaustedShock`, the Mob
  member count) and the undo is the exact difference, sent back as `raw: true` (GM only; the api skips the rules).
  `pool.adjust` negates its delta.
  - The note tells the GM when a tap didn't do what it said: `→ MORTAL WOUNDS (p.199)`, `→ TRAUMATIC INJURY (p.193)`,
    `→ ANNIHILATED (p.194)`. An Annihilation's undo is `character.update { annihilated: false }`; the side panel also has
    a RESTORE button for it.
- Turns, Conditions, reveals and adds get no UNDO button.
- UNDO sends the inverse and logs `UNDO: …`. It drops the original entry only if the undo went through; a refused undo
  keeps its button.
- The undo doesn't take back an automatic Prone, and a tap that raced another client's diffs the older state (a
  `ponytail:` note in `tracker.tsx`). The log is client-only: it's per tab and lost on reload.

**Condition reminders.** After a successful START TURN or SEIZE, `remind()` checks the combatant's Conditions against
`TURN_START_REMINDERS`. After END TURN, it checks the combatant that was acting against `TURN_END_REMINDERS`. Each
match is pushed to the log as an amber (`warn`) entry. START TURN also lists the timed Conditions (`isTimed`) that the
api will remove at the end of this Turn. When END TURN ends the Round (no one left `canAct`) or the GM presses NEW
ROUND, `roundEndReminders` adds the Mob Resolve Tests. Typed `start`, `seize` and `end` commands go through the same
handlers (`runCommand`), so they fire the same reminders. What the reminders say is covered in
[game-logic.md](game-logic.md).

**Add combatants** (`AddCombatants`, under the command line):
- The `+ THREAT…` select lists the bestiary as `name (source p.N)`.
- `MOB #` accepts digits only. A value of 2 or more adds the threat as a mob of that size.
- An optional MARKER select.
- A `VisibilitySelect` (PLAYERS: BAR ONLY by default, kept between adds) so a held-back threat goes in hidden.
- ADD sends `combatant.addThreat`.
- `+ PARTY (n)` sends one `combatant.addCharacter` for each character not yet in the fight, in order.
- All of these go through `run`, so they are logged and their errors show on the tracker error line.

### 3.2 The command line: `lib/command/command.ts`

The `.cmd` form under the key bar. On submit, `parseCommand({ input, state, selected })` returns
`{ actions: ActionInput[] }` or `{ error }`:
- An error shows on the tracker error line, and the text stays in the box for editing.
- Otherwise each action runs through `runCommand`: turn actions use the button handlers, and everything else goes
  through `run` with the log text `> <COMMAND>`. The input clears only if every action succeeded.
- Matching is case-insensitive, and the input is split on whitespace.

**Globals.** These are checked first and need no target:

| Input | Action |
|---|---|
| `end` (the only word) | `turn.end` |
| `round` (the only word) | `encounter.newRound` |
| `glory <n>`, `ruin <n>` (`n` = `3`, `+1`, `-2`) | `pool.adjust { pool, delta: n }`; any later words are ignored |

**Verbs.** Aliases map to one canonical verb (`VERBS`). Only the first verb word counts; any later verb word is
treated as part of the target name.

| Verb | Aliases | PC target | Threat target | Amount |
|---|---|---|---|---|
| wounds | `dmg`, `d`, `wound`, `w` | `character.adjust { wounds: +n }` | `combatant.adjust { wounds: +n }` | default 1 |
| heal | `heal`, `h` | `character.adjust { wounds: −n }` | `combatant.adjust { wounds: −n }` | default 1 |
| shock | `shock`, `s` | `character.adjust { shock: +n }` | `combatant.adjust { shock: +n }` | default 1 |
| recover | `rec`, `recover`, `r` | `character.adjust { shock: −n }` | `combatant.adjust { shock: −n }` | default 1 |
| wrath | `wrath` | `character.adjust { wrath: n }` | error `Threats don't have Wrath` | default 1, signed (`wrath -1`) |
| start | `start`, `go` | `turn.start` | `turn.start` | none |
| seize | `seize` | `turn.seize` | `turn.seize` | none |
| aware | `aware` | `combatant.aware` | `combatant.aware` | none |
| ambush | `ambush` | `combatant.update { ambushed: true }` | same | none |
| hide / show / reveal | `hide`, `show`, `reveal` | `combatant.update { visibility }`: `hidden`, `bars`, `stats` | same | none |
| mob | `mob` | `combatant.update { mobCount: n }` | same | **required** (`mob needs a count: <name> mob 6`) |
| remove | `remove` | `combatant.remove` | same | none |

**Amounts:**
- A signed number **before** any verb is itself the verb: `+n` means wounds n and `-n` means heal n. For example,
  `+2` gives 2 Wounds to the selected row, and `-1 hollan` heals Hollan 1.
- A number (signed or not) **after** a verb is its amount: `dmg 3`, `dmg +3`, `wrath -1`.
- For the four counter verbs, the verb sets the direction and the amount's sign is ignored: `heal -2` still heals 2.
  For `wrath`, the sign counts: `wrath -1` lowers Wrath.
- An unsigned number before a verb is not an amount. It becomes part of the target name.

**Conditions.** A word `+<name>` or `-<name>` whose `<name>` matches one of `CONDITIONS` turns that Condition on or
off. The match is case-insensitive and ignores spaces, so `+onfire` means On Fire. The parser reads the target's
current list and sends the whole new list: `character.update { conditions }` for a PC, `combatant.update { conditions }`
for a threat. If a Condition word is present, it wins, and any verb in the same command is ignored.

**Target resolution** (`resolve`). The target is every word left over once globals, verbs, amounts and Conditions are
taken out:

| Remaining words | Result |
|---|---|
| None | The selected row, or the error `No target: select a row or type a name` |
| A query `q` (the words joined with spaces) that exactly one name **equals** | That combatant; an exact name wins before any prefix matching |
| Any other query `q` | Matches every combatant whose name **equals** `q`, **starts with** `q`, or has a **word** (split on spaces, `×` and parentheses) that starts with `q` |
| Exactly one match | That combatant. PCs route to their character, threats to their combatant row |
| Several matches | `Ambiguous: <names>` |
| No match | `No combatant matches "<words>"` |

The names come from `targetsOf(state)`: the character name for PCs and the combatant `label` for threats.

A command with neither a verb nor a Condition returns
`Unknown command. Try: <name> dmg 3 · <name> +2 · +Pinned <name> · end`.

**Examples:**

| Command | Result |
|---|---|
| `hollan dmg 3` | Preacher Hollan takes 3 Wounds |
| `+2` | The selected row takes 2 Wounds |
| `-1 hollan` / `hollan heal 1` | Hollan heals 1 Wound |
| `iskra shock 2` | `character.adjust { shock: 2 }` on Iskra's character |
| `iskra wrath -1` | Iskra spends 1 Wrath |
| `+pinned iskra` / `hollan -prone` | Toggles a Condition |
| `seize hollan` / `go iskra` | Seize, or start a turn, with the same reminders as the buttons |
| `boyz mob 6` | Sets the mob to 6 members |
| `ruin +1` / `glory -1` | Moves a pool |
| `end` / `round` | Ends the turn, or starts a new round |
| `kommando dmg 1` | Kommando takes 1 Wound, even with Kommando ×6 and Kommando Nob in the fight (exact name wins) |
| `komm dmg 1` | `Ambiguous: Kommando ×6, Kommando Nob, Kommando` |

The tests are in `lib/command/command.test.ts`.

### 3.3 PREP: adventures and scenes (beats)

`Prep`. The data model is in [campaign-model.md](campaign-model.md). Every visible string says SCENE; the code keeps
`beat`.

- **Adventures** show as a row of buttons. Picking one closes any open editor. The inline NEW ADVENTURE form sends
  `codex.save { kind: "adventure" }` and switches to the new adventure using `r.id`.
- **Each beat in the list** shows:
  - its number (`sceneNumber`), title, type chip and status chip (amber when active)
  - its GOAL, read-aloud text and GM notes (closed on a plate)
  - its EXITS: each label, then `→ 04 · THE DEAL` for a target in this adventure, or `→ NO SCENE YET`
  - its TESTS (`components/scene-tests/scene-tests.tsx`): the DN TABLE, SHIFTING and FAIL FORWARD rule links, then one
    `<details>` per Test whose summary is what rolls (`testTitle`), the DN (`dnLabel`: NO DN on an Opposed Test, DN · GM SETS on one without a DN yet, §11.75), EACH, the Shift count and, on a
    Fear or Corruption Test, the Ruin reminder (`ruinOnFailure`, Core p.320); inside are the purpose, SHIFT 1, 2… and
    both outcomes
  - its RUIN & GLORY (`components/scene-pools/scene-pools.tsx`, issue #40): the RUIN, GLORY, COMPLICATIONS and COMBAT
    COMPLICATIONS rule links, then each Ruin and Glory line with a +N button and each spend with SPEND N. A tap sends
    `pool.adjust` and reports in the message line, with what was lost at the pool's maximum (`poolMax`, Core pp.164,
    320). A spend the pool can't pay is disabled (`canSpend`): the server floors at 0 and would undercharge
  - a summary of its prepared encounter
- **Beat controls:**
  - ↑ / ↓ swap a beat with its neighbour and send the full `ids` order as `beat.reorder`.
  - EDIT opens the beat editor.
  - RUN SCENE, shown when the beat has a prepared encounter, sends `beat.startEncounter` and jumps to TRACK through
    `onRun`.
  - SET ACTIVE, shown when there is no prepared encounter, sets the status to active.
  - DONE and SKIP set the status to done or skipped.
  - Each status change is a `codex.save { kind: "beat" }` with `stripBeat(b)`: the beat without `id` and `order`,
    which the server owns.
- **`BeatEditor`** has these fields:
  - title
  - type (`BeatType.options`)
  - goal, read aloud, GM notes and outcome (`BEAT_TEXT_FIELDS`, each with its hint and page)
  - exits (`components/exits/exits.tsx`): a label and a scene select per row (this adventure's scenes, or —), up
    to `MAX_EXITS`; SAVE drops rows with neither
  - tests (`components/tests/tests.tsx`), between handouts and the prepared encounter. Per Test:
    - a KIND select (`retypeTest` keeps the pool, DN and Shifts that still fit)
    - a Skill and/or Attribute select by `TEST_POOL`
    - ONE / EACH, and PURPOSE
    - DN chips from `DN_TABLE` with their modifier inline, "5 CHALLENGING (+2)" (`CORRUPTION_DNS` for Corruption)
    - a DN field (`components/ui/number-input`): it keeps the text as typed while editing, counts a DN from 1 to 20 at
      once, and clamps on blur; emptied, it leaves the DN for the GM to set (§11.75)
    - the book's example for that Skill at that DN (`skillDns` from `GmApp`'s `presets`, Core pp.122–126)
    - a DN under 3 hint (Core p.122)
    - the Shift ladder, up to `MAX_SHIFTS`. Chips add the uses on pp.165–166, with +1 Glory only once per Test
      (p.166), and the Attitude step (p.168) when the Test names a social Skill (`SOCIAL_SKILLS`, p.167)
    - ON SUCCESS, and ON FAILURE with the p.319 chips
    - ↑ / ↓ / ×

    An Opposed Test shows a NO DN note and no Shift ladder: Shifting is defined against a DN (p.165). Up to
    `MAX_TESTS` Tests; SAVE drops blank Shift rungs
  - Ruin and Glory (`components/ruin-glory/ruin-glory.tsx`, issue #40): RUIN · WHAT EARNS IT HERE and GLORY · AWARDS,
    an amount (a `NumberInput` up to `MAX_POOL_STEP`) and a line each; SPENDS · PLANNED, a RUIN / GLORY toggle, a
    cost, a name and its effect. Up to `MAX_POOL_LINES` each. SAVE drops blank lines (`savedPools`), and holds the
    save while a line has no amount or a spend no cost. ADD FROM BOOK (`components/pool-picker`, shown when
    `presets.pools` has any) picks a book and one of its lists, shows its HOW TO USE THIS LIST notes, and ADD copies a
    row with `presetLine` into the right list (a cost the book doesn't print stays empty)
  - location
  - NPC and handout toggle chips (`aria-pressed`)
  - the prepared encounter entries: threat, count (at least 1), a MOB checkbox, a marker and a `VisibilitySelect` (hidden for ambushers and reinforcements)

  It also shows the Threat Assessment sizing guideline for the current party size and the current enemy count.
- **`ScenePicker`** (`components/scene-picker/scene-picker.tsx`, + SCENE FROM A TABLE beside + NEW SCENE, shown when
  `presets.tables` has any), issue #39:
  - The GM picks a book (`BOOKS[source].name`) and one of its tables. The cite, the dice and any printed default DN
    show, plus the table's `gm` notes behind HOW TO USE THIS TABLE.
  - ROLL rolls the table's dice (`roll`, prep only), and I ROLLED takes a number the dice can show (`results`). Either
    one highlights the event(s) it lands on (`rowsFor`): one, none in a printed gap, or two in a printed overlap. A d66
    roll also shows its tens and units, so the GM can read a printed Wrath Die rule.
  - Tapping an event previews it: its read-aloud, its GM notes with the cite, and its Tests as the scene will get
    them.
  - MAKE THIS SCENE sends `codex.save { kind: "beat" }` with `presetScene({ table, row })` and this adventure's id. The
    scene goes last, and PREP shows SCENE CREATED.
  SAVE SCENE creates or updates the beat, and DELETE sends `codex.delete`. A refusal keeps the editor open with the
  error shown inline.

### 3.4 CODEX: NPCs, locations, handouts, factions

`CodexView`.
- **Sub-tabs** come from `CODEX_KINDS`, each mapping a kind to its `Codex` collection: NPCS, LOCATIONS, HANDOUTS,
  FACTIONS.
- **List:** each entry shows its name or title and an EDIT button. Kinds that have a `revealed` field (every kind
  except factions) also get a REVEALED / HIDDEN button. It flips `revealed` with a `codex.save` of the whole entry;
  players get the entry the moment it's revealed.
- **`CodexEditor`** is generic, driven by `fieldsFor(kind, codex)`:

| Kind | Fields |
|---|---|
| npc | name, role, faction (select), attitude, description (players see it), GM notes, secrets, revealed |
| location | name, inside (parent location), description (players see it), hazards, GM notes, revealed |
| handout | title, text, sent to players |
| faction | name, keywords (comma-separated list), stance, notes, secrets |

  - The draft starts from the whole row, so fields that have no input in the editor (an NPC's `statSource`)
    survive a save.
  - On SAVE, an empty `…Id` select becomes `null`.
  - A refusal shows inline and keeps the editor open.
  - The page-level `Refusal` banner is used only for the reveal toggle.

### 3.5 PARTY: session, framework, table access, kill team

`Party`.
- **Session panel:**
  - While a session is open: pick XP from `XP_AWARDS` (8 / 10 / 12, `DEFAULT_XP` 10) or type a number, write the
    recap (players see it), then END SESSION (`session.end { xp, recap }`).
  - Otherwise: START SESSION n (`session.start`).
  - What the pools reset to is covered in [game-logic.md](game-logic.md).
- **Framework panel:** patron and framework text, saved with `campaign.update`. Players see both on INTEL.
- **TABLE ACCESS panel** (from `state.access`, which only the GM receives in full):
  - ROOM QR sends `invite.create { mode: "room", hours: ROOM_INVITE_HOURS }` (12) and shows `/invite/<code>` as a QR.
    Players scan it, sign in or join as a guest, and claim an agent.
  - The open invites: ROOM or the character's name, uses, ACCOUNTS ONLY when guests aren't allowed, the expiry, and
    REVOKE (`invite.revoke`). Anyone already seated keeps their seat.
  - SIGNED IN: each member's name and seat (GM, the character, or NO AGENT). Players have REMOVE (`member.remove`),
    which takes the seat away and disconnects them.
- **Kill team list:** for each character, the name, archetype, `pcStatus` chips, XP, PLAYED BY <member> or OPEN SEAT,
  and a line of derived stats. The per-character buttons:

| Button | Sends | Notes |
|---|---|---|
| INVITE | `invite.create { mode: "character", characterId, hours: CHARACTER_INVITE_HOURS }` (168) | A single-use link to `/invite/<code>` for that character, shown as a QR |
| GUEST QR | `token.issue` | A no-account guest QR to `/join/<token>` |
| LOAD STATS (JSON) | `character.update { stats }` | The pasted JSON goes through `CharacterStats.parse(JSON.parse(…))` in a `try`; a parse error shows on the message line |
| RESPITE | `character.respite` | |
| REQUISITION | `character.requisition` | Opens `RequisitionForm`: the ITEM field searches the catalogue (`<datalist>`); an exact name fills kind (`requisitionKindOf`), Value, Rarity and Keywords, shows the page and effect, and sends `wargearId`. Otherwise kind (WARGEAR / AMMO / GRENADES), item, Value, Rarity, item Keywords, a ranged weapon's ammo type. It shows the DN, the dice to roll (Influence + bonus dice), the matched Keywords, and refuses when there's no match or this session's Test is used. The GM enters the Icons, Wealth spent (only up to the shortfall) and a Complication, then RECORD |
| +1 WEALTH / −1 WEALTH | `character.supply { wealth: ±1 }` | The GM's award (Core p.206). The line above the buttons shows Wealth, Ammo and Conditions |
| +1 AMMO / −1 AMMO | `character.supply { ammo: { kind, delta: ±1 } }` | AMMO TYPE field with the `AMMO_TYPES` datalist; +1 starts a new type, −1 at 0 drops it (§11.57). The type stays filled for repeat taps |
| ±COND | `character.update { conditions }` | Toggles a Condition on the character, also outside a fight (the tracker reaches only combatants) |
| REVOKE GUEST QR | `token.revoke` | Revokes the character's guest tokens and kicks guest sockets; a signed-in member keeps their seat |

Every code (room, invite, guest) goes through `showCode`: it builds `${location.origin}/…` into a `QR_SIZE` (320px) PNG
with `qrcode`, using `TOKENS.bg` modules on `TOKENS.fg`, and shows it full-screen in `QrDialog` with the URL written
underneath. The code is returned only once, so a closed dialog can't be reopened; make a new one.

- **ADD AGENT** sends `character.create { name }`.

---

## 4. Player app: `components/player/player-app/`

`PlayerApp` is phone-first:
- `SYNCING…` until both snapshots arrive, and `CHARACTER NOT FOUND. ASK YOUR GM.` if `characterId` isn't in `state`.
- **Banner** (`.pl-banner`), one of:
  - `NO COMBAT · STANDING BY`
  - `▶ YOUR TURN`, on an amber background
  - `RND nn · <NAME> ACTING` or `<SIDE> PICK`, with `· YOU: DONE` added once the player has acted
- **Vibration:** when it becomes the player's turn, `navigator.vibrate(TURN_VIBRATION)` buzzes once. This is a
  `useEffect` on `myTurn`, with a ref so it fires only on the change.
- **Tabs** (`PLAYER_TABS`: SHEET, FIGHT, INTEL) sit in a sticky bar at the bottom.

| Tab | File | Shows | The player can change |
|---|---|---|---|
| SHEET | `components/sheet/sheet.tsx` (+ `components/vital/vital.tsx`) | Name; archetype, species and Tier; keywords; `pcStatus` chips; `Vital` cards for Wounds and Shock (`remaining`: what's left and a draining bar), Wrath and PARTY GLORY, all read-only; the GM's Ruin; derived traits (DEF RES RSLV CONV SPD INF PAS); Conditions, read-only (each name opens its rule); armament (`WeaponLine` with `effectiveStrength`, its traits open their rules) and armour, each with its `UpgradeRow` at a table (fit and remove, `host` weapon or armour) and the notes a fitted upgrade leaves to the GM; skill totals (`skillTotal`); abilities; talents; gear; SUPPLY (`SupplyRow` lines for Wealth and each Ammo type) | Spending their own Wealth and Ammo (−1, `character.supply`; × on an empty type removes it). Granting Wealth or Ammo, Conditions, Wounds, Shock, Wrath, Glory and RESPITE are GM only |
| FIGHT | `components/fight/fight.tsx` | Two tables, as on the tracker: one per `Side.options`, each under a `.tbar` (crimson AGENTS, iron THREATS) with its `acted/total ACTED`. Every combatant is a card (`div.item.agents` / `div.item.threats`, outlined in `--side-agents` blue or `--side-threats` orange): `▶` and a crimson ring on the one acting, dimmed once done, a Wounds bar that drains as they're hurt, with no number (mobs show `×count OF start`), threat status chips, and Conditions (each a `RuleLink`). A threat card's header is a `button.item-head` with `aria-expanded` that toggles its `StatBlock`, or `DATA RESTRICTED BY GM.` while it's `bars`; a hidden threat isn't there at all. A PC card's header is plain | Nothing |
| INTEL | `components/intel/intel.tsx` | MISSION (framework and patron), PREVIOUSLY (the latest session that has a recap), handouts (newest `revealedAt` first), known persons, known locations | Nothing |

**Hidden until the GM reveals it.** The filtering happens on the server (`toPlayerView` / `toPlayerCodex` in
`@wg/shared`), not in these components:
- A `hidden` threat isn't sent, and `currentId` is `UNSEEN_ID` on its Turn. The banner then reads `UNSEEN THREAT ACTING`
  and takes the side that's due from
  `encounter.upNext`, since `sideUpNext` on the filtered combatants would miss the hidden threat's Turn.
- A `bars` threat's `stats` is `null`, its `threatId` is `""` and its `personalRuin` is 0. Its bars, mob count and
  Conditions still come through.
- Factions and adventures (with their beats) are never sent.
- NPCs, locations and handouts are sent only once `revealed`. Even then, GM notes, secrets, hazards and an NPC's
  stat source are blanked, an NPC's `factionId` is null, and so is a location's `parentId` unless the parent is
  revealed.

The server's `authorize()` also limits which actions a player can send: only their own character's `name` and `detail`
(no `stats`, `overrides` or Conditions), spending Wealth and Ammo but never granting them, the builder, and nothing
else. The sheet shows every refusal in its `Refusal` banner. See
[backend.md](backend.md).

---

## 5. Shared UI and libs

### `components/ui/`

| Component | Props | Job |
|---|---|---|
| `bar/bar.tsx` `Bar` | `value`, `max: number \| null`, `danger?` | `value` is harm taken; shows a `Track` of what's left plus `left/max`, so the bar drains; `—` when `max` is `null`; crimson when `danger`, ink otherwise |
| `track/track.tsx` `Track` | `value`, `max`, `tone?: TrackTone` (`"harm"` or `"ink"`, `track/constants.ts`), `label?` | One framed bar filled to `value/max` in `blocks()` steps, crimson or ink. Harm callers pass what's left. Decorative (`aria-hidden`), so show the number beside it or in `.sr-only` text. The one exception is a threat on FIGHT, where players get the coarse bar and not the count: it passes `label` and reads out "Wounds: about 70% left" |
| `seal/seal.tsx` `Seal` | `value`, `pool: Pool`, `size?` | A party pool as a wax seal (brass Glory, crimson Ruin), `role="img"` labelled `<value> <pool>` |
| `theme-toggle/theme-toggle.tsx` `ThemeToggle` | `className?` | The day/night switch (§7): flips `data-theme` on `<html>` and stores it; `constants.ts` holds `THEME_KEY` and the pre-paint `THEME_SCRIPT` |
| `stat-block/stat-block.tsx` `StatBlock` | `t: Threat`, `tier?` | A threat stat block laid out as printed: an iron title bar with the page cite (`threatCite` from `@wg/shared`), the Tier/Threat grid with `tier` highlighted, keywords, attributes, DEF/WND/SHK/RES/SPD, skills, then BONUSES, ABILITIES (with weapons), DETERMINATION, Conviction/Resolve/Size, Personal Ruin and OPTIONS bands |
| `rule-item/rule-item.tsx` `RuleItem` | `r: RuleEntry`, `open?` | One rules entry as a `<details>`: name (a stat's `abbr` first), kind · cite, gist, and the book text inside. Used by the RULES tab, the stat legend and the rule dialog; `open` starts it expanded |
| `rules-provider/rules-provider.tsx` `RulesProvider`, `useRules()` | `rules: RuleEntry[]`, `children` | Wraps `GmApp` and `PlayerApp`. Builds a `ruleKey` → entries map once, over `LINKED_RULE_KINDS` only (Conditions, weapon and armour traits; not actions or stat block terms). It owns one native modal `<dialog>` that shows the entries as `RuleItem open` with CLOSE. Esc or a backdrop tap closes it, and focus returns to the tapped word. `useRules()` returns `{ find(name), open(entries) }` and throws outside the provider |
| `rule-link/rule-link.tsx` `RuleLink` | `name`, `children?` (defaults to `name`) | A trait or Condition as the data spells it (`Blast (6)`, `Inflicts (On Fire)`). If `find` resolves it, it's a `button.rule-link` (dotted underline, 32px hit area, `aria-label="Rule: <name>"`) that opens the dialog; otherwise it renders as plain text. `RuleIdLink` (`id`, `children`) does the same for an entry that isn't a trait, by id (the scene Tests' DN TABLE, SHIFTING, FAIL FORWARD). Needs a `RulesProvider` above it |
| `weapon-line/weapon-line.tsx` `WeaponLine` | `weapon`, `strength?` | `weaponProfile` (§`lib/`), then each trait as a `RuleLink`. Used by the sheet's ARMAMENT, the tracker's selected character and `StatBlock` (ability and option weapons) |
| `status-chips/status-chips.tsx` `StatusChips` | `items: string[]` | Upper-cased chips. Anything matching `Slain\|Dead\|Dying` is `.chip.bad` (red), everything else `.chip.warn` (crimson outline) |
| `status-screen/status-screen.tsx` `StatusScreen` | `text` | Full-screen centred status line (`.center` + `.display`) for loading, access and error states |
| `refusal/refusal.tsx` `Refusal` | `error: string \| null`, `onDismiss` | A `role="alert"` banner fixed to the bottom, showing `! <error>` with an OK button. Renders nothing when `error` is `null` |

### `lib/`

Each lib is a pure helper that takes an options object. Every one except `tokens` has a sibling `*.test.ts`, run
with `bun test lib`.

| Lib | Export | Job |
|---|---|---|
| `blocks/blocks.ts` | `blocks({ value, max })`, `MAX_CELLS` (10) | `{ filled, cells }` for a track scaled to at most 10 cells (drawn by `components/ui/track`). Any damage fills at least one cell, anything short of max leaves at least one empty, and overflow stays full |
| `weapon-line/weapon-line.ts` | `weaponProfile({ weapon, strength? })`, `weaponLine(…)` | `weaponProfile` is the one-line profile without traits: `dmg +ED ED · AP · R short/med/long · S salvo`. `addStrength` melee prints `S+X`, or a number when `strength` is given. A `salvo: null` prints `–`, and an absent salvo is omitted. `weaponLine` appends `· traits` as plain text, for places with no `RulesProvider`; inside one, use the `WeaponLine` component |
| `tokens/tokens.ts` | `TOKENS` (`bg`, `fg`) | Raw colours for places CSS variables can't reach: the QR canvas, the viewport `themeColor` and the manifest. It mirrors `:root`, so change both together |
| `command/command.ts` | `parseCommand`, `targetsOf`, `Parsed` | The tracker command line (§3.2) |

---

## 6. How errors reach the user

| Surface | Where | Looks like | Clears |
|---|---|---|---|
| Status screen | the `/`, `/c/<id>` and `/invite/<code>` pages, the apps before their first snapshot | A full-screen message (§1) | On navigation or reload |
| Offline badge `.badge-offline` | `GmApp` (`NO SIGNAL · RECONNECTING`), `PlayerApp` (`NO SIGNAL`) | A red badge fixed top-right while `!online`; the last state stays on screen | On reconnect |
| `Refusal` banner | `GmApp` (header pools), `CodexView` (the reveal toggle), `Sheet` (every player action) | A red alert bar fixed to the bottom, `! <error>`, with an OK button | On OK, or on the next success |
| Tracker error line | `Tracker` (`.red` above the key bar) | `! <error>` from command parse errors and from every `run` refusal (buttons, amount pad, add-combatants, undo) | On the next successful `run` |
| Prep / Party message line | `Prep`, `Party` (top of the tab) | Amber on success (`ENCOUNTER LIVE`, `SESSION STARTED · POOLS RESET`…), red on refusal (starts with `!`) | Replaced by the next message |
| Inline editor error | `BeatEditor`, `CodexEditor` | `! <error>` above the buttons; the editor stays open with the draft intact | On the next save |
| Inline form error | `LobbyView` (NEW GAME), `InviteAccept` | `! <error>` from the api's message, or `No signal` | On the next attempt |

The error text is either the server's `ActionError` message or one of the two client strings from `send`
(`No signal`, and `No reply from server. Check before retrying`).

---

## 7. Styling

The look is the "Imperial Manuscript", after the print design of the Wrath & Glory books: a vellum page with faint
stains and a vignette (the `radial-gradient`s on `body`), crimson Cinzel section heads over a double rule, iron bands
with bone text for headers and tabs, riveted-plate framing for GM-only content, and flat panels and tables so numbers
read at arm's length. None of it uses book art: everything is CSS, plus one SVG mask (the torn band edge). Mock-ups and
the design language: canvas `LRBEbp8GhgBAFeDk4pohVy`. Everything is plain CSS in `app/globals.css`, using short
utility and component classes plus inline `style` for one-offs.

**Themes.** `:root` is **vellum** (day). **Vigil** (night: charred page, bone ink, ember red) re-maps the same tokens
under `:root[data-theme="vigil"]`, and under `prefers-color-scheme: dark` unless `data-theme="vellum"` is set.
`ThemeToggle` (`components/ui/theme-toggle/`) stores the choice per device in `localStorage` (`THEME_KEY`), and
`THEME_SCRIPT`, inlined in `<head>` by `app/layout.tsx`, applies it before first paint (`<html suppressHydrationWarning>`).
The toggle shows a Lucide moon (to vigil) or sun (to vellum), swapped by CSS (`.theme-to-night` / `.theme-to-day`), so server and client markup match.

**Fonts** come from `next/font/google` in `app/layout.tsx` and are exposed as CSS variables on `<html>`:

| Variable | Font | Use |
|---|---|---|
| `--font-display` → `--display` | Cinzel (variable) | Heads, labels, buttons, tabs, chips: `.display`, `.label`, `.rule`, `.btn`, `.tab`, `.chip`. Stands in for the books' Priori Serif |
| `--font-serif` → `--serif` | Crimson Pro (variable, with italics) | Body text, the default for everything; counters use its lining tabular figures. Stands in for Caxton |
| `--font-mono` → `--mono` | IBM Plex Mono (400/500/700) | Only in-world print-outs and typed commands: `pre.text.slate` (handouts, data-slates) and `.cmd input` |

**Tokens** (`:root`, re-mapped for vigil):

| Token | Purpose |
|---|---|
| `--vellum` | Page background, and the inner frame of buttons (mirrored as `TOKENS.vellum`) |
| `--vellum-2` | Panels, list items, vitals, zebra rows, the tracker side panel |
| `--vellum-3` | The command bar and other recessed strips |
| `--ink`, `--ink-2`, `--ink-3` | Main text (mirrored as `TOKENS.ink`), secondary text and outlines, captions / `.dim` / done rows |
| `--line` | Default borders and dividers |
| `--red` | Crimson ink: section heads, `.accent`, errors, Wounds, "hidden from players", focus rings |
| `--red-fill`, `--red-2` | Crimson fills under bone text (primary buttons, the acting row, the active tab, your-turn banner) and their borders; `--red-fill` stays dark in vigil |
| `--red-tint` | Faint crimson wash (hover, `.chip.warn`, danger buttons) |
| `--red-on-iron` | Crimson that is legible on iron (the Ruin pool, the active tab's top stroke) |
| `--iron`, `--iron-2` | Bands, tabs (mirrored as `TOKENS.iron`, the browser theme colour); table and stat-block header rows |
| `--bone`, `--bone-2` | Text on iron and on crimson fills; secondary text on iron |
| `--brass` | Glory only |
| `--field` | Input background |
| `--stain-a`, `--stain-b`, `--vignette` | The page-ground texture |
| `--overlay` | Near-opaque backdrop for `.overlay` (the QR dialog) |
| `--marker-red`, `--marker-amber`, `--marker-green`, `--marker-blue`, `--marker-purple`, `--marker-white` | Threat marker swatches, always in an ink frame. They match the coloured tags on the physical minis, one per `Marker` value in `@wg/shared` |
| `--side-agents`, `--side-threats` | Blue and orange outlines on the player FIGHT cards (Agents, Threats). Orange, not crimson, so a threat never reads as "now" |
| `--serif`, `--display`, `--mono` | Font stacks |
| `--clerk-*` | Clerk's sign-in screens and `UserButton`, mapped from the tokens above (`--clerk-color-primary: var(--red-fill)`, `--clerk-color-background: var(--vellum)`, `--clerk-font-family: var(--serif)`, `--clerk-border-radius: 2px`…) |

**Class vocabulary:**
- Text: `.sr-only` (read by screen readers, not drawn), `.display`, `.dim`, `.accent` (crimson emphasis: the acting combatant, notices, success), `.red` (errors),
  `.label`, `.rule` (a section head; the double rule is drawn by `::after`), `.kw` (keywords in crimson small caps).
- Controls: `.btn` (ink outline with an inner double frame), with `.primary` (crimson fill), `.danger`, `.sm` (32px)
  and `.sq` (44px square); `.input`; `.field`.
- Chips: `.chip`, with `.warn` and `.bad`; `.now-chip` (the tracker's "▶ X ACTING").
- Tabs: `.tabs` / `.tab`, an iron strip; `[aria-selected="true"]` is crimson with a bright top stroke. `.tabs.rail` is
  the GM's right-edge chapter rail (the open tab on a torn crimson stroke, `data-n` numerals behind the rest; a top
  strip under 900px). `.tabs.sub` is an underlined in-screen strip (codex kinds, rule kinds) that scrolls sideways
  when it doesn't fit.
- Bands: `.band` (iron, bone text; `.btn`, `.dim` and `.label` inside it switch to their on-iron colours) and
  `.band.torn` (adds the ragged bottom edge). Used by `.gm-head`, `.pl-banner` and the lobby header.
- Book furniture: `.sb*` (the stat block: `.sb-title`, `.sb-grid`, `.sb-head` with `.cur` for the campaign Tier,
  `.sb-v`, `.sb-shade`, `.sb-band`, `.sb-body`), `.tbar` (a crimson table title bar; `.iron` for Threats), `.plate`
  (riveted plate: GM-only content, e.g. the codex editor's GM notes, secrets and hazards), `.handout` (a sealed
  slip), `.track` (framed wound/shock cells, `.harm` or `.ink`; `components/ui/track`), `.seal` (a pool as a wax seal;
  `components/ui/seal`).
- Layout: `.panel`, `.item` (`.now` for the acting card on FIGHT), `.item-head` (a card's full-width header row, 44px
  tall), `.list` (`.table` for a bordered, gap-less table), `.stack`, `.cols`, `.keys`, `.pad`, `.center`, `.overlay`,
  `pre.text` (long text with its line breaks, in the serif; `.slate` for in-world print-outs in Plex Mono).
- Shells: `.gm*` for the GM, `.tracker*`, `.turn-strip` and `.row*` for the tracker, `.cmd` for the command bar,
  `.pl*`, `.vitals`, `.vital` and `.traits` for the player app.

**Layout:**
- **GM:** tablet-first. `.gm` is a full-height grid: the header band and the scrolling body on the left, the
  112px chapter rail on the right. The tracker is a two-column grid: the main list, plus a 300px side panel.
- **`@media (max-width: 900px)`** is the only breakpoint:
  - The GM shell becomes one scrolling page instead of fixed-height panes, and the rail becomes a top tab strip.
  - The title takes a full line.
  - The pool controls shrink to 40px.
  - The tracker stacks, with the side panel below the list.
  - `.row` drops to 4 columns with no minimum widths, so a row fits a 390px phone, and `.hide-sm` cells are hidden.
- **Player:** phone-first single column. `.vitals` is 2 columns. `.cols` wraps at `minmax(280px, 1fr)`.
- **Grid cells** get `min-width: 0` (`.row > *`) so bars shrink instead of spilling into the next column.

---

## 8. Conventions (summary)

This section summarises the binding rules. The full text is in
[`.claude/frontend-code-style.md`](../.claude/frontend-code-style.md).

- **Folder layout:**
  - Every component gets a kebab-case folder named after it (`tracker/tracker.tsx`), and there are no `index.tsx`
    barrels.
  - Children used only by that component live in its `components/`. Its `constants.ts`, `types.ts` and `utils.ts`
    sit beside it.
  - Shared building blocks go in `components/ui/<name>/`, hooks in `hooks/<use-name>/`, and pure helpers in
    `lib/<name>/` with a test.
  - Closed UI value sets are `as const` objects or tuples in `constants.ts` (`GM_TABS`, `COUNTER_ACTIONS`,
    `CODEX_KINDS`). Domain sets (`Side`, `Pool`, `Marker`, `CONDITIONS`, `BeatType`) come from `@wg/shared`.
- **Mutations only through `send`:**
  - There are no Server Actions and no REST routes for game state.
  - Actions are built as `ActionInput`, and counters send deltas.
  - Every caller checks `r.ok` and shows `r.error`.
  - Rules numbers (derived traits, pool caps, death states) come from `@wg/shared` and are never computed in the
    UI.
- **`useEffect` only for external systems.** There are exactly three, and each is commented:
  - the socket
  - the wake lock
  - `navigator.vibrate`

  There's no client-side read. The only browser `fetch` calls are the two REST writes: NEW GAME and accepting an
  invite.
- **Server-side identity.** The guest cookie is httpOnly, and the Clerk token comes from `auth().getToken()`, so the
  lobby, seat (`/api/campaigns/:id/me`), bestiary and invite-preview reads and the `/join` exchange run on the server
  (the pages, `route.ts`, through `apiGet`). Client components get the results as props (`lobby`, `preview`,
  `bestiary`, `campaignId`, `characterId`).
- **Accessibility:**
  - Touch targets are at least 44px (`.btn`); dense secondary buttons (`.btn.sm`) are 32px.
  - Icon-only buttons have an `aria-label` naming the action and its target (`Decrease WOUNDS`, `Move <beat> up`).
  - Inputs have a `<label htmlFor>` or an `aria-label`, and chip groups use `role="group"`.
  - State is never shown by colour alone: row state is a word, tabs use weight plus `aria-selected`, the selected
    tracker row has `aria-pressed`, and marker swatches carry an `aria-label`.
  - Focus stays visible: `:focus-visible` draws a crimson ring, `.input:focus` switches the border to `--red`, and
    `.cmd:focus-within` rings the command bar.
  - The smallest text is 12px.
  - There's no hex in TSX; colours come from `var(--…)` or `TOKENS`.

---

## 9. Recipes

### Add a GM tab or screen

1. Add the name to `GM_TABS` in `components/gm/gm-app/constants.ts`. `GmTab` and the tab bar pick it up.
2. Create `components/gm/<name>/<name>.tsx`: a `"use client"` component with typed props. It takes what it needs
   from `state`, `codex` and `send`, and `bestiary` if it adds threats.
3. Render it in `GmApp`'s `<main>`: `{tab === "<NAME>" && <Name … />}`.
4. Show refusals with one of the patterns in §6. Use a message line for a form-heavy tab, and `Refusal` for a
   tab with only a few buttons.

The player app works the same way, through `PLAYER_TABS` in `components/player/player-app/constants.ts` and
`PlayerApp`. Anything a player sees must already be in the filtered snapshots. Revealing more data is a change to
`toPlayerView` / `toPlayerCodex` (see [backend.md](backend.md)), not to the component.

### Add a component

1. Decide where it belongs:
   - used by one parent: `<parent>/components/<name>/<name>.tsx`
   - used by both apps: `components/ui/<name>/<name>.tsx`
   - pure logic: `lib/<name>/<name>.ts` plus `<name>.test.ts`
2. Write it as a function component with an explicit `type <Name>Props`.
3. Put UI value sets and magic numbers in a `constants.ts` beside it.
4. Any handler with more than one statement is a named `const handleX` above `return`, with a one-line comment.
5. Use only token colours and existing classes. Add a class to `globals.css` only when a pattern repeats.
6. Import by file path. Order imports as external, then `@wg/*`, then `@/…`, then relative.

### Add a tracker command verb

1. **Alias:** add `alias: "canonical"` entries to `VERBS` in `lib/command/command.ts`.
2. **Counter verb** (a signed delta on a field the adjust actions already take): add it to `COUNTER_ACTIONS` in
   `lib/command/constants.ts`. The command line, the key bar button and the amount pad all pick it up.
   If the field is new, add its difference to `preview()` in `tracker.tsx` too, or UNDO won't reverse it.
3. **Any other verb:** add a `case` to the `switch` at the end of `parseCommand` that returns `{ actions: [...] }` or
   `{ error }`. Use `t.characterId` for character actions and `t.combatantId` for combatant actions.
4. **Turn verb:** route it through `runCommand` in `tracker.tsx`, so it fires the Condition reminders the buttons do.
5. **New server action:** if the verb needs one, follow "Adding an action" in `CLAUDE.md` first.
6. **Test:** add cases to `lib/command/command.test.ts`.
7. **Docs:** update the verb table in §3.2, and the input's `placeholder` or the `Unknown command` hint if it's a
   headline verb.
