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
| `/admin` | `app/admin/page.tsx` | Server Component | The admin page (USERS, GAMES, the latest admin events): asks `/api/admin/*` and sends a non-admin to `/` |
| `/c/new` | `app/c/new/page.tsx` | Server Component | CREATE NEW CAMPAIGN's steps before the campaign exists: asks `/api/frameworks` (a creator's only, so it is the gate too) and renders `NewCampaign` |
| `/c/<campaignId>` and every GM route under it | `app/c/[campaignId]/(table)/layout.tsx` | Server Component (layout) | Asks `/api/campaigns/:id/me` for the caller's seat, and renders `GmApp` (with the route as its children), `PlayerApp`, the table screen or a `StatusScreen`. The GM's URLs are in §1.1 |
| `/c/<campaignId>/start` | `app/c/[campaignId]/start/page.tsx` | Server Component | CREATE NEW CAMPAIGN's steps after CREATE, for the GM only: loads the places, faction presets and scene presets, and renders `CampaignSetup` |
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
  on its own requests (NEW CAMPAIGN, accepting an invite, the socket handshake).

### `/`: `app/page.tsx`

The checks run in this order, and the first one that matches decides what renders:

| Condition | Renders |
|---|---|
| `?join=invalid` or `?join=nosignal` (checked **before** anything else) | `JOIN_ERRORS[join]` |
| Signed out, and `/api/guest` finds a guest cookie's table | a redirect to `/c/<campaignId>` |
| Signed out | The sign-in landing: AUSPEX, SIGN IN (to `/sign-in`), and a hint that guests scan the GM's QR code |
| Signed in, `/api/lobby` fails, errors or doesn't parse as `Lobby` | `JOIN_ERRORS.nosignal` |
| Signed in | `<LobbyView lobby={…} />` |

**`LobbyView`** (`components/lobby/lobby-view/lobby-view.tsx`) has Clerk's `<UserButton />` in the header, then, in this
order (creating a game sits above the lists that grow):

- **YOUR GAMES** (`lobby.mine`): a card per seat with a GM or PLAYER chip and OPEN (a `next/link` to `/c/<id>`).
- **CREATE NEW CAMPAIGN**, only when `lobby.canCreate` (the Clerk creator role): a link to `/c/new`.
- **IMPORT GAME**, creators only: a campaign export as a new campaign, with FRESH START. A file over 100 MB
  (`IMPORT_MAX_BYTES`) is refused before it uploads, with a pointer to EXPORT WITHOUT PICTURES. When the api left
  pictures out (`droppedPictures`), the lobby says how many with an OPEN GAME button instead of opening it at once.
- **YOUR CHARACTERS** (`lobby.characters`, issue #14): the caller's own library — the Tier, the archetype once the build
  resolves, ready or in progress, and a homebrew mark. OPEN goes to `/library/<id>`; DELETE asks once (the button turns
  to CONFIRM), because no GM owns these, then `router.refresh()`. NEW CHARACTER posts an empty row and opens its
  builder, with the count beside it, and is disabled at `LIBRARY_CAP`.
- **RUNNING NOW**: games with a session in progress where the caller has no seat (`running` filtered to `role: null`).
  They're cards only, with no OPEN: joining needs an invite.
- **ADMIN** (a header link, only when `lobby.admin`) goes to `/admin`.
- **ARCHIVED** (`lobby.archived`, collapsed until SHOW ARCHIVED GAMES): the caller's archived games, with an ARCHIVED chip
  and OPEN. They're kept out of YOUR GAMES and RUNNING NOW.

Every button that posts (IMPORT AS GM, NEW CHARACTER, DELETE) pulses (`aria-busy`) from the tap until the next page is
up, through `useTransition`, and a second tap is ignored meanwhile. `app/loading.tsx` shows SYNCING COGITATOR… the
moment any link is tapped, since every page fetches from the api first.

### `/c/new`: `app/c/new/page.tsx`

`NewCampaign` (`components/new-campaign/`) holds four steps in state, in the builder's chrome (`.bld-head`, and the
`WizardSteps` strip from `components/ui/wizard-steps/`, which also shows the steps after CREATE greyed out):
1. **TIER**: radio cards, 1–5, with the starting XP (Core p.20).
2. **PREMISE**: the Framework, patron and Framework Bonus, with SETUP's `FrameworkPicker` (rules-flow §11.80).
3. **TABLE**: `TableTalk`, the kind of game and what to leave out (Core p.316, §11.79).
4. **NAME**: the name and a review of every step, each with EDIT.

CREATE NEW CAMPAIGN POSTs everything to `/api/campaigns` from the browser in one go, so leaving half-way stores
nothing, then replaces the page with `/c/<campaignId>/start`. A refusal shows inline.

### `/c/<campaignId>/start`: `app/c/[campaignId]/start/page.tsx`

`CampaignSetup` (`components/campaign-setup/`) opens the table socket (`useTable`) and walks the last three steps,
each saved as it goes through CODEX's and PARTY's own pieces:
5. **SETTING**: `PlacePicker` (open), `HulkGenerator`, or a typed name (`codex.save` kind `location`), with the
   campaign's places as a tree underneath.
6. **FACTIONS**: `FactionPicker` (open), or a typed name (`codex.save` kind `faction`).
7. **PLAYERS**: `RoomInvite`, PARTY's ROOM QR.

OPEN THE CAMPAIGN pushes `/c/<campaignId>/setup`, the SETUP tab, where the checklist lists what's left.

### `/c/<campaignId>`: `app/c/[campaignId]/(table)/layout.tsx`

A layout, not a page: it runs once when the table opens, and every GM route under it reuses its seat check, its
catalogues and the shell's socket (layouts don't re-render on navigation). `build/` and `start/` sit outside the
`(table)` group, so they get neither; each opens its own socket, as before.

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

### 1.1 The GM's URLs: `app/c/[campaignId]/(table)/`

Every GM tab, entry and editor has its own URL, so a refresh, Back or a bookmark lands where the GM was. Links and
pushes go through `gmPath` (`lib/gm-path`), never a hand-built string.

| URL under `/c/<id>` | Opens |
|---|---|
| (none) | SCENE while a session is open (its fight while one is live), else STORY. `?tab=<tab>` from an old link opens that tab (`asGmTab`: `track` → SCENE, `prep` → STORY) |
| `scene`, `scene/fight` | The play home, or its FIGHT layer |
| `story` | The board of the scene being played's adventure, else the first adventure's |
| `story/<adventure>`, `story/<adventure>/<scene>` | An adventure's BOARD, a scene's PAGE |
| `story/<adventure>/<scene>/edit`, `…/edit/<section>` | The scene editor, whole or one `BEAT_SECTIONS` part (`goal`, `tests`, `cast`, `fight`…): a STORY pencil |
| `story/<adventure>/new`, `story/<adventure>/from-table` | + NEW SCENE, + SCENE FROM A TABLE |
| `codex`, `codex/<kinds>` | A kind's list (`npcs`, `locations`, `handouts`, `factions`, `items`; `CODEX_SEGMENTS`), NPCs by default |
| `codex/<kinds>/<entry>` | That row opened and scrolled to: a peek's GO TO lands here, and so does SAVE |
| `codex/<kinds>/<entry>/edit`, `codex/<kinds>/new` | The entry's editor, a new entry |
| `codex/threats`, `codex/threats/<slug>/edit` | Custom threats, one being edited. A new one (CLONE, BLANK, QUICK) starts from a draft only the tablet holds, so it has no URL |
| `party`, `party/respite` | The roster, RESPITE's sheet |
| `party/<character>`, `party/<character>/<tab>` | An Agent's dossier on STATUS, or on `gear`, `advance`, `seat` (a tab tap replaces the URL, so Back closes the sheet) |
| `rules`, `books`, `setup` | Those tabs. SETUP's GO TO adds the panel as a `#anchor` (`/party#ascend`): the shell opens its fold and scrolls to it |

- **A tab's layout draws it.** `scene/`, `story/`, `codex/` and `party/` each have a client `layout.tsx` that renders the
  tab's component from `useParams()` and `useSelectedLayoutSegments()`; their `page.tsx` files only give a URL its shape
  and return `null`. So the tab stays mounted across its own routes: the tracker keeps its selection across the FIGHT
  switch, CODEX its search and PRINT ticks across an editor, PARTY's line of news reaches the open dossier.
- **Unknown names are a 404, unknown ids fall back.** A bad section, kind or dossier tab is `notFound()` in its page. An
  id the live codex doesn't hold (a deleted scene, NPC or Agent) replaces the URL with the list or board above it.
- **What has no URL:** SCENE's read-only preview of another scene, the codex search, PRINT ticks, the tracker's
  selection, MORE's disclosure. They are passing states, not places to come back to.
- **Leaving an editor drops its draft**, by Back or by a rail tap alike. A rail tap opens the tab's own URL, so it also
  leaves a CODEX sub-tab, a STORY page or a dossier for the tab's start.
- **Closing replaces, opening pushes.** An editor's SAVE, CANCEL or DELETE, a sheet's CLOSE and a dossier tab replace the
  URL, so Back goes to where the GM was before opening it, never back into what they just closed.

### `/c/<campaignId>/build/<characterId>`: `app/c/[campaignId]/build/[characterId]/page.tsx`

The character builder (issue #9). `<characterId>` is `new` (`NEW_CHARACTER`) for a character not made yet, GM only; a
player may open only their own. The page checks the seat, fetches `/api/campaigns/:id/creation` (parsed with
`CreationPayload`) and renders `Builder` (`components/builder/`):
- **Draft:** the choices so far (`Draft`: a `CharacterBuildInput`, which names neither `archetypeId` nor `advanced`
  until one is chosen, plus the name and `savedAt`), kept in `localStorage` per table and character (`draftKey`). It starts from the newer of that and the
  draft sent to the table (`character.draft`, `Character.draft`), else the saved `character.build`, else blank. A
  table's draft records the save it was opened on (`Draft.builtAt`, from `Character.builtAt`); once the character has
  been built again since, from another device or by a script (the issue #18 and #27 migrations), the draft is stale and
  dropped, detail and all, with no clocks compared. START OVER drops the local one.
- **SEND TO GM** (players, on REVIEW): puts the draft on the table. PARTY then shows OPEN DRAFT for that character; the
  GM ticks what only the GM judges and saves, which clears the draft.
- **Live preview:** every change runs `resolveBuild` from `@wg/shared` (`useMemo`); the screens read its sheet,
  ledger, `pending`, `choices` (every grant choice with its picker kind and answer), `problems` and `who` (for
  `outOfReach`). `BuilderContext`
  (`useBuilder()`) carries the draft, the result and the catalogue lookups.
- **Screens** (`StepNav`, one tab per Core p.17 step, "N LEFT" per tab): TIER (budget; the GM's HOMEBREW switch, which
  reloads the page), ARCHETYPE (or ADVANCED CREATION, Core pp.38–39: a species, an Archetype Ability the GM agrees to
  and the Wargear kit, §11.126–132, each list without the homebrew books unless allowed), CUSTOMISE (ratings, USE SUGGESTIONS, Talents, powers for a PSYKER, Advancement
  Packages), FACTION (placeholder fills, Background and its one bonus, option groups; an Advanced build picks its optional
  Faction here, §11.140, and a placeholder no record fills, `[ANY]`, takes a write-in the GM ticks), ASCENSION (below
  the campaign's Tier, and always for an Advanced build, whose one package is the GM's, §11.132), DETAIL (name, languages, Wealth), REVIEW (the sheet as the play sheet will show it; for the GM, the
  ticks and this character's rulings: species, keywords, gear swaps). Grant choices render as `ChoiceCard`s.
  The Talent, power and package lists leave out what `outOfReach` says no purchase can open (a species, archetype or
  keyword nothing buyable gives); a power or package already taken stays, so it can be untaken.
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
  - A character invite: that Agent's card, with PLAY <NAME> (or PLAY <NAME> AS GUEST).
  - A room invite: PICK YOUR AGENT from `openCharacters`, one card each, or a NEW AGENT NAME form.
  - A card (`components/agent-card/`) is made to skim: the portrait only if there is one, name, archetype · species,
    Keywords, the seven Attributes as the book's table, the three best Skills as dice badges (`lib/sheet-pools`), and the
    weapons by name; PLAY, and READ. A reserve Agent with no sheet yet shows only "No sheet yet" and PLAY.
  - READ opens a modal: the Agent's BACKGROUND first (the player-written appearance, past and personality, folded as
    `DetailView` does), since a new player chooses by story before the numbers mean anything; then the book's
    character sheet as the DOSSIER draws it (Core p.40), read-only, under HOW TO READ THIS SHEET: Personal Details,
    ATTRIBUTES, SKILLS, the Traits, WARGEAR and TALENTS & ABILITIES; PLAY at its foot.
    Every term opens its meaning (`ui/term`); the JOIN page is served no rules, so there is no FULL RULE there. Each
    Skill opens what it's for (`SKILL_TERMS`, Core pp.121–127) and each Ability or Talent its text (`Pop`): the preview
    keeps that text for a signed-in visitor and strips it for a guest, who reads "Its full text shows once you sign in
    or take a seat". Each Keyword opens the book's full text of it (`ui/keyword-pop`, `@wg/data/keyword-texts`: the
    publisher approved faction Keyword text for anyone); a Chapter or other filled bracket reads its bracket's text
    ("DARK ANGELS: a Chapter", [CHAPTER] Core p.377), and a Keyword no book in the data names stays plain. A Keyword
    the books name but never describe may carry our own HOUSE text in `keyword-texts.ts`, shown with no page
    (DEATHWATCH, written after the Warhammer 40k Wiki and Warhammer Community's Kill Team: Tomb World preview; the
    sources are named in the code).
    The preview has stripped Ability and Talent text already (book prose needs a seat), so only names and cites show.
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

`gm-app/gm-app.tsx` (`GmApp`) is the tablet shell. It shows `SYNCING COGITATOR…` until both snapshots arrive. The GM
plays from the scene (the scene-first shell, [campaign-model.md](campaign-model.md)): SCENE is the play home, STORY is
prep, and the fight is a layer inside SCENE.

- **Header** (`.gm-head`; the pieces are in `header/`), left to right:
  - `AUSPEX · <CAMPAIGN> · T<tier>`.
  - `RND nn` while an encounter is live.
  - `SpendBadge`: `n SPEND ASKED`, only while players have asked. It opens the request list (`SpendRequests`: ACCEPT or
    DENY each, rules-flow §11.122).
  - `CallTestButton`: CALL A TEST opens the call form (§3.0). While a call is open it reads TEST CALLED and is
    disabled.
  - Two `SealButton`s, one per `Pool.options` (Glory, Ruin): the `Seal` and `/max` (the cap from `poolMax(p, players)`).
    A tap opens a pad: −1, `GLORY n / max`, +1 (each `pool.adjust` ±1, disabled at 0 and at the cap), then PLANNED HERE,
    the current scene's planned spends from that pool (`currentScene(codex).beat.spends`): SPEND n · NAME sends
    `pool.adjust` −cost, disabled while `canSpend` fails. Book spends are picked while building the scene, so no others
    are offered. A refusal shows in the page's `Refusal` banner.
  - The ADMIN chip when `me.admin` (§3.4b), `ThemeToggle` and `UserButton`.
- The spend badge, CALL A TEST and the seals are `Popover`s (`header/popover`): the panel opens under the button, Escape or a tap outside
  closes it, focus moves into the panel and back to the button on close. There are no −/+ pool buttons any more.
- **Under the header** the `TestCall` tally renders while a call is open (`state.testCall`), and nothing otherwise. The
  spend requests are no longer an always-on bar.
- **Tabs** (`.tabs.rail`): `GM_TABS` in `gm-app/constants.ts` = SCENE, STORY, CODEX, PARTY, RULES, BOOKS, SETUP. SETUP is
  `.tab.foot` at the rail's foot: it is used before a campaign, not during one. `TAB_NUMERALS` draws I to VI behind the
  first six. Each tab is a `Link` to its URL (§1.1), and the open one has `aria-current="page"`
  (`useSelectedLayoutSegment`). SCENE links to its fight while one is live.
- **`useGm()`** (`gm-app/gm-context.ts`): what the routes read from the shell: the synced `state` and `codex`, `send`,
  the catalogues the layout loaded, `bookServer`, and `begun` (the last scene begin, so STORY's RUN keeps its UNDO on
  SCENE).
- **GO TO** (issue #198) pushes the entry's URL: a scene's PAGE in STORY, or the row in CODEX. SCENE's EDIT pushes the
  scene's PAGE.

| Tab | Component | Files |
|---|---|---|
| SCENE | `Scene` | `scene/scene.tsx`, `scene/constants.ts`, `scene/types.ts`, `scene/components/{no-scene,scene-strip,scene-preview,scene-page,test-rows,in-this-scene (with `reveal-row`),where-next,begun-notice}`, `lib/scene/scene.ts` (`currentScene`), `lib/scene-reveal` |
| (FIGHT, a layer of SCENE) | `Tracker` | `tracker/tracker.tsx`, `tracker/constants.ts`, `tracker/types.ts`, `tracker/components/{key-bar,delta-pad,fight-row,add-combatants,crit-perils}`, `lib/fight-delta` |
| STORY | `Story` | `story/story.tsx`, `story/constants.ts`, `story/types.ts`, `story/components/{adventure-bar,import-adventure,scene-board,scene-page,story-section}`, `lib/story-scenes`; reused from the retired PREP: `prep/types.ts`, `prep/utils.ts`, `prep/components/beat-editor/{beat-editor.tsx,constants.ts}`, `prep/components/scene-picker`, `prep/components/scene-tests` (with `call-test`), `prep/components/scene-pools`, `prep/components/scene-hazards` (a scene's picked hazards with SPOTTED, issue #49), `prep/components/hazard-chips` (a hazard's Tests, Conditions and Threats, shared with CODEX), `lib/hazards`; the scene editor's ITEMS TO FIND chips and the page's items with `item-give` (issue #51) |

### 3.0 A called Test: `components/gm/test-call/` (issue #191)

CALL A TEST is a header button (`CallTestButton`, above): its popover is the call form (kind, Skill or Attribute, DN,
FEAR on a Resolve Test, HIDE DN, which seated Agents). With a call open, the button reads TEST CALLED and the tally
renders under the header, on every tab: one row per Agent asked, PENDING / PASSED / FAILED as the phones report, SET
PASSED / SET FAILED for a phone that's out, and on a failure the offer the book gives (rules-flow §11.145): **GAIN n
CORRUPTION · +1 RUIN** (`character.corrupt` with the phone's roll) or **+1 RUIN** (`pool.adjust`), each gone once taken.
CLOSE ends the call. SCENE's TESTS rows (§3.0a) and STORY's planned Tests (**CALL TO THE PHONES**,
`prep/components/scene-tests/components/call-test`) call a prepared Test: all seated Agents for an EACH Test, one for the
rest.

### 3.0b WHISPER: `components/gm/whisper/` (rules-flow §11.164)

WHISPER is a header button (`header/whisper-button`) and a button under each PARTY card (that Agent picked). Its popover
(`WhisperPanel`) picks Agents, takes up to 500 characters, and lists this session's whispers with each Agent's reply and
a ✕ to take one back. The header button lights with a count of replies this tablet hasn't seen (`useUnreadReplies`, kept
in localStorage by `hooks/use-stored-set`). On the phone, `player/whisper-sheet` pops the oldest unread whisper up as a
bottom sheet with a buzz, once no Test is called; CLOSE or a reply (`whisper-reply`) marks it read. INTEL's INBOX lists
the session's whispers to reread and answer.

### 3.0a SCENE: the play home

`Scene` (`components/gm/scene/`). One scene is played at a time: the active beat, which `currentScene(codex)`
(`lib/scene`) finds (its adventure, the beat and its index). The scene being played is made by `beat.begin`
([backend.md](backend.md), [campaign-model.md](campaign-model.md)); SCENE never edits one, EDIT leaves for STORY.

- **Message line** (`role="status"`): amber on success (`CALLED · <TEST>`, `SCENE BEGUN, TAKEN BACK`, a hazard's or a
  Test's notice), red with `!` on a refusal.
- **No scene** (`NoScene`): NO SCENE IS BEING PLAYED, then each adventure's first `planned` scene (the running
  adventures first) with a BEGIN button (`beat.begin`), or "No scene is planned. Write one in STORY, or start a fight."
  START A FIGHT sends `encounter.start`.
- **Scene strip** (`SceneStrip`, with a scene): this adventure's scenes as numbered tabs, the current one crimson, played
  ones ticked. A tap on another scene previews it (`ScenePreview`: PREVIEW · SCENE nn · TYPE · STATUS, its GOAL and READ
  ALOUD, nothing else); BEGIN THIS SCENE begins it, BACK or a tap on the current tab leaves. Nothing changes until BEGIN.
- **Layer switch** (`.scene-layers`, only while an encounter is live): THE SCENE | FIGHT · ROUND n. Each is a URL
  (`scene`, `scene/fight`); the rail, `/c/<id>` and STORY's RUN open on FIGHT while a fight is live, and START FIGHT
  moves there. When the fight ends the scene shows again, whatever the
  switch said. The FIGHT layer is the `Tracker` (§3.1).
- **THE SCENE** is two columns (`.scene-cols`, stacked under 860px):
  - `ScenePage`, as the book prints a scene, in order: `SCENE nn · TYPE · PLACE` with EDIT, the title, GOAL, READ ALOUD,
    GM NOTES (closed on a plate), HAZARDS (`SceneHazards`, when the scene has a place), TESTS and RUIN & GLORY
    (`ScenePools`, when it has any lines). Outcome, exits and the fight are not on the page.
  - TESTS (`TestRows`): a tap on a row calls that Test to the phones (`test.call` with the Test, `who` and `fear`, which
    replaces an open call). An EACH Test, or any Test with one seated Agent, calls the seated Agents; a ONE Test asks WHO with a chip
    per Agent. A Resolve Test has a FEAR toggle (Terror earns no Ruin, Core p.199). Only what it rolls is sent: Shifts and
    outcomes stay with the GM (§11.143). With no seated Agent the rows are disabled.
  - **IN THIS SCENE** (`InThisScene`, `aside`): PLACE, CAST, HANDOUTS and ITEMS the scene links. A name opens its peek
    (§5 `MentionsProvider`). Each `RevealRow` has one toggle, SHOWN (eye) or SEALED (lock), whose accessible name says the
    action: a whole-entry `codex.save` with `revealed` flipped (`revealAction`, `lib/scene-reveal`: the way CODEX's
    REVEALED does), so a phone gets it at once. A private handout carries `<NAMES> ONLY`. An item has no toggle: the holder
    and `ItemGive` (GIVE TO or TAKE BACK). Under them FIGHT: "A fight is under way", `n Threats prepared` or "none
    prepared", and START FIGHT (or START A FIGHT with none prepared) while no fight is live: `beat.startEncounter` for a scene with prepared
    entries (which also begins the scene), else `encounter.start`; then the FIGHT layer shows.
- **WHERE NEXT** (`WhereNext`, below the columns): one button per exit, its label in italic and `→ nn TITLE`, which ends
  this scene and begins that one (`beat.begin`); an exit with no scene is disabled and reads NO SCENE YET. OTHER SCENE…
  lists the adventure's other scenes, each a preview.
- **SCENE BEGUN** (`BegunNotice`, one line under the strip, after any begin here or STORY's RUN): `SCENE BEGUN · shown on
  entry: <names>` (or that nothing was ticked), UNDO and ×. `GmApp` holds it (`begun`, a `Begun` from `lib/scene-reveal`),
  so a begin from STORY arrives on SCENE with its UNDO. UNDO sends, in order, and stops at the first refusal: with a scene
  before it, `beat.begin { id: <that scene>, leave: "planned", reveal: false }` (it is current again, nothing revealed),
  then a `codex.save` putting the begun scene back to the status it had when that wasn't planned; with none, a
  `codex.save` of the begun beat with that status; then, for each entry the begin revealed (the ack's `revealed`), a
  whole-entry `codex.save` with `revealed: false` (`undoBegin`). On success the notice goes and the line says
  `SCENE BEGUN, TAKEN BACK`. The notice is client-only: a reload drops it, another begin replaces it.

### 3.1 FIGHT: the live combat tracker

The FIGHT layer of SCENE (§3.0a): `Tracker` mounts only while an encounter is live. With none, SCENE offers START FIGHT
(`beat.startEncounter` or `encounter.start`). A scene's prepared encounter can also be started from SCENE's IN THIS SCENE.

**Status strip** (`.turn-strip`):
- The turn state: `▶ <NAME> ACTING`, `AWAITING: <SIDE> PICK` (from `sideUpNext(state)`), or `ROUND COMPLETE`.
- `Next: the <side> pick` and `<SIDE> SEIZED`, when they apply.
- The round, plus how many of each side have acted, as `RND n · AGENTS acted/total · THREATS acted/total`.

**Rows** are grouped by `Side.options` (agents, then threats) under a `.tbar` with `acted/total ACTED`. A `FightRow` is a
grid of cells for the eye, with a select button under them (`aria-pressed`, its label reads the whole row); the WOUNDS
number, the SHOCK number and a threat's visibility chip are buttons over it. A tap on the row toggles `selected` and closes
the delta pad.

| Column | Content |
|---|---|
| STATE | A word, never colour alone: `▶ ACTING`, `DONE`, `AMBUSHED` (Round 1 only), `READY` |
| DESIGNATION | A portrait slot (only when some combatant has one), the marker swatch of a threat that has one, the name, and the class (`AGENT`, or `THREAT_CLASS_LABEL[threatClass]`) |
| WOUNDS | A `Track` of what's left and the number as `left/max`, a button that opens the delta pad. A Mob has no track and reads `×count/start` |
| SHOCK | `left/max`, a button that opens the pad, or `—` when max Shock is `null` |
| DEF / RES | PCs: from `deriveStats`. Threats: from the snapshotted `stats` |
| STATUS | `StatusChips` from `pcStatus` / `threatStatus`, plus a chip per Condition |
| PLAYERS SEE | Threat rows only: the visibility chip (below) |

Row CSS classes: `.now` is the one acting (highlighted background), `.sel` is selected (fg border), and `.done` has
acted (dimmed). The rows answer to the width `.tracker-main` actually gets (`@container tracker`): under 802px the `.hide-sm` cells (the
class tag, DEF, RES, the portrait) go, and under 600px STATUS and PLAYERS SEE drop to a second line under the name.

**Key bar** (`KeyBar`, `.fight-keys`): at most four controls, so the tablet never shows a wall of buttons. The tracker keys
it by the selected row, so a new selection starts with both panels folded.

| Control | Shown when | Sends |
|---|---|---|
| The turn button | One at a time. `END TURN` when someone is acting; `START <NAME>'S TURN` when nobody is and `canAct(state, sel)` (so never for a Slain threat or a Dead PC); `NEW ROUND` when nobody `canAct`; else none | `turn.end` / `turn.start` / `encounter.newRound` |
| `SEIZE · 1 GLORY` / `1 RUIN` | As START, and also `canSeize(state, side)` (hidden when that side is up next anyway) | `turn.seize` |
| `+ CONDITION` | A row is selected | Opens CONDITIONS · NAME: a toggle chip per `CONDITIONS` entry, ticked when on (`character.update` or `combatant.update` with the full list) |
| `MORE` | Always | Opens the panel below; its accessible name lists what's inside |

MORE holds, in this order:
- `AMBUSH` / `AWARE · cost`, in Round 1 when the selected row hasn't acted (`combatant.update { ambushed: true }` /
  `combatant.aware`).
- PLAYERS SEE, a HIDDEN / BAR ONLY / FULL segment, when a threat is selected (`combatant.update { visibility }`,
  rules-flow §11.56).
- `NEW ROUND` (`encounter.newRound`), unless it is already the turn button.
- `REMOVE`, when a row is selected: `combatant.remove`, then clears the selection.
- `END FIGHT` (`encounter.end`), always.

Each panel has its own CLOSE, one is open at a time, Escape closes it, and a tap on a control inside runs it and folds the
panel. The Seize and Aware cost label is `1 GLORY` when the selected combatant is an agent, and `1 RUIN` otherwise. The
server charges the cost; see [game-logic.md](game-logic.md).

**Visibility chip.** Each threat row ends with a chip of what the phones see (`VISIBILITY_WORD`): `FULL`, or in a `.warn` chip
`BARS` / `HIDDEN` (not sent at all). A tap cycles HIDDEN → BARS → FULL (`Visibility.options`) with one
`combatant.update { visibility }`; its label says what a player sees.

**Delta pad** (`DeltaPad`, `lib/fight-delta`). A tap on a row's WOUNDS or SHOCK number selects that row and opens one pad
under it on that track (a second tap on the same number closes it). It holds:
- a WOUNDS | SHOCK segment (SHOCK is disabled where the row has no Shock track) and a DEAL + | HEAL − segment (RECOVER −
  for Shock; Wounds and Shock both count up, so DEAL is +);
- the amounts `AMOUNTS` (1 2 3 4 5 6 8 10): one tap sends one delta;
- a typed number: `-3` heals or recovers 3, `+2` deals 2, a bare `2` follows the DEAL | HEAL segment (`parseDelta`: whole
  numbers 1–99, else "A whole number, 1 to 99."); Enter applies it;
- CLOSE (Escape too), and a foot line `APPLIES TO: <NAME> · WOUNDS 13/18 LEFT`.

A delta goes through `counterAction` and `run`, so the vox log, its notes and UNDO apply, and the pad closes. Log text is
`<NAME> +3 WOUNDS`, worded by `COUNTER_ACTIONS` (`lib/command/constants.ts`, shared with the command line), which maps each
key to a `field` and a `sign` (`counterKey`):
- PCs send `character.adjust` on the character.
- Threats send `combatant.adjust` on the row.

**Kept as it was:** the side panel, the vox log and undo, the Condition reminders, `AddCombatants` and the command line
(§3.2). Only the old key bar moved: DMG / HEAL / SHOCK / RECOVER and the amount pad are the delta pad, ±COND is
+ CONDITION, and the PLAYERS select, AMBUSH / AWARE, REMOVE, NEW ROUND and END ENC are in MORE (END ENC is END FIGHT) or
on the row.

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
- `+ THREAT…` opens the shared `ThreatPicker` (§5) over the bestiary, classed at the campaign's Tier.
- `MOB #` accepts digits only. A value of 2 or more adds the threat as a mob of that size.
- An optional MARKER select.
- A `VisibilitySelect` (PLAYERS: BAR ONLY by default, kept between adds) so a held-back threat goes in hidden.
- ADD sends `combatant.addThreat`.
- `+ PARTY (n)` sends one `combatant.addCharacter` for each character not yet in the fight, in order.
- All of these go through `run`, so they are logged and their errors show on the tracker error line.
- Under the add row, once the fight holds anything, `BudgetLines` (§5) checks it against the same guideline STORY uses
  (Threat Assessment p.8). The classes are the ones snapshotted when each threat joined (`threatClass`), a Mob counts as
  one tracked combatant with its surviving `mobCount` as models, and anything `isOut` (a slain threat, a dead Agent)
  leaves the tally even while its row waits to be removed. The budget is sized for the Agents in the fight, falling back
  to the seated ones before + PARTY.

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

### 3.3 STORY: adventures and scenes (beats)

`Story`, which replaced PREP. The data model is in [campaign-model.md](campaign-model.md). Every visible string says
SCENE; the code keeps `beat`. STORY is prep as a storyboard: you flip scene by scene, and a scene is played from SCENE
(§3.0a).

- **Adventure bar** (`components/adventure-bar`): one button, the open adventure's title with ▾ (the redesign's
  Flow-StoryBoard); the page under it keeps only the BRIEF, the PREMISE on a closed plate and the linked missions. The
  button opens the ADVENTURES dialog (PARTY's `PartyDialog`): the adventures to switch to (picking one closes it and
  goes to its BOARD), NEW ADVENTURE (`codex.save { kind: "adventure" }`, then switches using `r.id`), IMPORT
  ADVENTURE, and the open adventure's form: title, BRIEF, PREMISE / GM NOTES, mission status, SHOWN TO THE PARTY (the
  mission log, issue #196), SAVE, and DELETE ADVENTURE (`codex.delete`, behind a confirm: its scenes go with it, linked
  missions stay unlinked, §11.163).
- **IMPORT ADVENTURE** (`components/import-adventure`), in the ADVENTURES dialog: pick a campaign file, tick its adventures, and
  only their slice (`sliceAdventures`) is posted to `/api/campaigns/:id/import-adventures`. The result line in STORY's
  message says what came in, what was already here and how many pictures were left out; the codex arrives with the
  rebroadcast.
- **Views** (`STORY_VIEWS`): a BOARD | PAGE toggle beside `<ADVENTURE> · SCENES`. The URL says which (§1.1): PAGE when
  it names a scene, so a peek's GO TO or SCENE's EDIT opens that scene's page.
- **BOARD** (`components/scene-board`): the scenes in story order hung on an iron spine (`ol.story-spine`), with the
  selected scene's glance panel beside it (`SceneGlance`, sticky; under the spine at 900px and narrower). A card is one
  button that SELECTS its scene (`aria-pressed`, a crimson outline and a SELECTED chip; the selection is the scene PAGE
  would open, else the first): number, title, a tagline (`tagline`: type, the cast, `FIGHT:` and the entries), a
  readiness chip (`readiness`: `READY ✓` or `n TO FIX`, the fixes in its title: `NO GOAL`, `NO READ-ALOUD`, `n EXITS WITH
  NO SCENE`, from `sceneFixes`) and a status chip unless planned (amber when active). Its exits sit beside it as tags,
  `→ 04`, or `→ NO SCENE YET` in crimson. The glance panel: `SCENE nn · TYPE · PLACE`, the title, GOAL, counts with
  dotted leaders (CAST, HANDOUTS with `m PRIVATE`, ITEMS, TESTS, FIGHT IF IT BREAKS OUT, EXITS), SHOWN ON ENTRY (the
  `onEntry` names, or nothing ticked), READY FOR THE TABLE (`READY ✓` or a crimson ✕ line per fix), then OPEN SCENE nn
  (the PAGE) and ▶ RUN FROM HERE (as RUN THIS SCENE; BEING PLAYED for the active scene). Under the board, + NEW SCENE, and
  + SCENE FROM A TABLE when `presets.tables` has any.
- **PAGE** (`components/scene-page`): one scene as a book spread. ‹ › and a numbered tab per scene flip between scenes.
  The left leaf is what you say and what is going on: the label line (`SCENE nn · TYPE · PLACE`, or NO PLACE YET), the
  title, the status and readiness chips with the fixes, GOAL, READ ALOUD, GM NOTES (closed on a plate), OUTCOME. The right
  leaf is who and what is in it: PLACE, CAST, HANDOUTS, ITEMS, TESTS, RUIN & GLORY, HAZARDS (only for a scene with a place
  and picks), FIGHT (`entryLine`: an entry's name, count, Profiles and "scaled", never the id) and EXITS (`→ 04 · THE
  DEAL`, or `→ NO SCENE YET`). Each part is a `StorySection` with a ✎ pencil that opens the `BeatEditor` scrolled to
  that part, and a part with nothing yet still shows, so it can be started from the page. The pencils: GOAL, READ ALOUD, GM
  NOTES, OUTCOME, EXITS, TESTS, RUIN & GLORY, FIGHT; PLACE and HAZARDS open `place`, and CAST, HANDOUTS and ITEMS open
  `cast`.
  - **ON ENTRY**: the place, each NPC and each handout shows a `REVEALED` / `HIDDEN` chip and an ON ENTRY tick. A tick
    saves the scene at once (`codex.save { kind: "beat" }` with `onEntry` toggled, `stripBeat`), and `beat.begin` shows
    the ticked entries to the phones when the scene begins ([backend.md](backend.md)). Items have no tick: `ItemGive` (GIVE
    TO an Agent or TAKE BACK) sits on the row.
  - HAZARDS (`components/scene-hazards/scene-hazards.tsx`, issue #49), closed on a plate: the hazards the scene picked from
    its location (rules-flow §11.95), each through `hazardView` and `HazardChips` (Tests as chips with `testTitle` and
    `dnLabel`, a DN of the Tier plus n worked out from the campaign's Tier, Conditions as rule links, Threats with their
    stat block in a fold, the book's notes, the printed text in a fold). SPOTTED saves the beat (`stripBeat`, `hazards`
    with the flag flipped) and adds the "lower the DN" reminder: the app applies no number (§11.92)
  - TESTS (`components/scene-tests/scene-tests.tsx`): the DN TABLE, SHIFTING and FAIL FORWARD rule links, then one
    `<details>` per Test whose summary is what rolls (`testTitle`), the DN (`dnLabel`: NO DN on an Opposed Test, DN · GM
    SETS on one without a DN yet, §11.75), EACH, the Shift count and, on a Fear or Corruption Test, the Ruin reminder
    (`ruinOnFailure`, Core p.320); inside are the purpose, SHIFT 1, 2… and both outcomes, and CALL TO THE PHONES (§3.0)
  - RUIN & GLORY (`components/scene-pools/scene-pools.tsx`, issue #40): the RUIN, GLORY, COMPLICATIONS and COMBAT
    COMPLICATIONS rule links, then each Ruin and Glory line with a +N button and each spend with SPEND N. A tap sends
    `pool.adjust` and reports in the message line, with what was lost at the pool's maximum (`poolMax`, Core pp.164,
    320). A spend the pool can't pay is disabled (`canSpend`): the server floors at 0 and would undercharge
- **Controls** under the spread:
  - ▶ RUN THIS SCENE (▶ BACK TO THIS SCENE once it is the active one) sends `beat.begin`, reports
    `<TITLE> BEGUN · n REVEALED`, and on success `onRun(begun)` hands the begin to the shell (`useGm().setBegun`, from
    STORY's layout) and opens SCENE with its SCENE BEGUN notice and UNDO (none when the scene was already being played).
  - EDIT opens the whole `BeatEditor`.
  - ↑ / ↓ swap the scene with its neighbour and send the full `ids` order as `beat.reorder`.
  - DONE and SKIP set the status to done or skipped. Only `beat.begin` makes a scene active.
  - PRINT CARDS (§5.1) prints tents for the fielded Agents (`fieldedAgentIds`) and every prepared combatant, a Threat
    card per encounter row, and the scene's items. PRINT HANDOUTS, shown when the scene has handouts, prints them as
    props, one to a page (issue #204).
  - Each status change is a `codex.save { kind: "beat" }` with `stripBeat(b)`: the beat without `id` and `order`,
    which the server owns.
- **Moved from PREP.** RUN SCENE (start the prepared encounter, then the tracker) is now START FIGHT in SCENE's IN THIS
  SCENE. SET ACTIVE is RUN THIS SCENE, or BEGIN on SCENE. The scene list is the BOARD. Hazards and the Ruin & Glory taps are
  also on SCENE's page, and Tests are called from its TESTS rows.
- **`BeatEditor`** (canvas row "The scene editor, streamlined", Flow-Editor*) is one page you scroll, reached from EDIT
  (at the top) or a pencil, which passes `section` (`BEAT_SECTIONS`): the editor opens scrolled to that part
  (`SECTION_GROUP`; a text field's own `b-<key>`), and `Story` remounts it per scene and section.
  - **Frame:** a sticky jump strip (`EDITOR_GROUPS`: STORY · PEOPLE & PROPS · TESTS · RUIN & GLORY · FIGHT · EXITS,
    each with its count) that marks the part whose heading has passed under it, and a sticky save bar: the state
    (`n UNSAVED CHANGES`, counted per changed field, `SET n AMOUNTS OR COSTS TO SAVE`, or the custom-threat wait), CANCEL
    and SAVE SCENE (disabled while an amount or cost is unset or a stat block is open). DELETE SCENE is a red link at
    the form's end. Styles: `app/css/editor.css`.
  - **STORY:** TITLE and TYPE on one row; goal, read aloud, GM notes (on a plate) and outcome (`BEAT_TEXT_FIELDS`).
    When the goal, read aloud or GM notes name codex entries (a token, or a plain name `useMentions().link` finds) the
    scene doesn't hold, one line lists them with `+ ADD` / `+ ADD BOTH` / `+ ADD ALL n` (a place only when there is none).
  - **PEOPLE & PROPS** (`components/people-props`): PLACE (one), NPCS, HANDOUTS and ITEMS as lists of what the scene
    holds: the name (opens its quick-edit sheet, `useMentions().edit`), a handout's reach chip, an ON ENTRY tick (not
    items) and ×, which also drops the ON ENTRY tick. Under each, a `FindField` (`components/ui/find-field`) finds an
    entry the scene doesn't hold, or `+ NEW <KIND> “x”` saves a bare codex entry, adds it and opens its sheet. A new
    place replaces the old, its ON ENTRY tick and hazard picks; HAZARDS AT THIS PLACE stays under PLACE (issue #49).
  - **TESTS** (`components/tests`): one row per Test (`DN 5 · <testTitle> · <purpose>`, ONE/EACH), one open at a time,
    dragged by its handle (`hooks/use-reorder`). The open row keeps every field: KIND (`retypeTest`), the Skill or
    Attribute by `TEST_POOL`, WHO ROLLS, PURPOSE, the DN ladder (`DN_TABLE` numbers, `CORRUPTION_DNS` for Corruption, the
    name and modifier in the label) with a `NumberInput` for any other DN (§11.75), the book's example (`skillDns`, Core
    pp.122–126), the DN under 3 hint (p.122), the Shift ladder (one field per Shift and a blank one that adds the next, up
    to `MAX_SHIFTS`; the use chips of pp.165–166, +1 Glory once, the Attitude step for a social Skill, p.168), ON
    SUCCESS, ON FAILURE with the p.319 chips, and REMOVE. An Opposed Test shows a NO DN note and no Shift ladder (p.165).
    `+ Find a Skill…` adds a Test at DN 3 and opens it, up to `MAX_TESTS`; SAVE drops blank Shifts.
  - **RUIN & GLORY** (`components/ruin-glory`, issue #40): RUIN · WHAT EARNS IT HERE and GLORY · AWARDS as rows of an
    amount (`NumberInput` up to `MAX_POOL_STEP`) and a line; SPENDS · PLANNED as rows that open one at a time (POOL,
    COST, NAME, WHAT IT DOES, the cite, REMOVE), dragged by their handle. Each list ends in a `FindField` over the
    books' rows of that kind (`presetLine`, which leaves a cost the book doesn't print empty) or a line of the GM's own.
    HOW TO USE THE BOOKS' LISTS keeps the tables' `gm` notes. Up to `MAX_POOL_LINES` each; SAVE drops blank lines
    (`savedPools`) and waits for every amount and cost.
  - **FIGHT** (`components/fight-entries`): `BudgetPanel` (`BudgetLines` for the prepared roster, sized for the Agents a
    fight would add, `agentsInFight(state)`, with the campaign's Tier and a FORTIFIED toggle that doubles every target,
    Threat Assessment p.8, rules-flow §11.82; FORTIFIED is editor state), then one row per entry (count, name, chips),
    one open at a time and dragged by its handle: the threat (`ThreatPicker`), a count stepper (at least 1), AS A MOB,
    WHAT PLAYERS SEE, the marker colours, `ThreatScale` and REMOVE. `+ Find a threat…` searches the bestiary, and
    `+ NEW CUSTOM THREAT “x”` opens `ThreatStarts` then `ThreatBuilder` in place: on CREATE the stat block joins
    CODEX › THREATS and this fight, and the scene's unsaved changes stay. Not past `CUSTOM_THREAT_CAP`.
  - **EXITS** (`components/exits`): an `If they…` field and a target per row (this adventure's scenes by number, or
    `→ NEW SCENE “<label>”`, which saves a scene by that title now and points the exit at it), one blank row waiting at
    the end, up to `MAX_EXITS`. SAVE drops rows with neither text nor target, and a target deleted meanwhile.
- **`ScenePicker`** (`components/scene-picker/scene-picker.tsx`, + SCENE FROM A TABLE beside + NEW SCENE, shown when
  `presets.tables` has any), issue #39:
  - The GM picks a book (`BOOKS[source].name`) and one of its tables. The cite, the dice and any printed default DN
    show, plus the table's `gm` notes behind HOW TO USE THIS TABLE.
  - ROLL rolls the table's dice (`roll`, prep only), and I ROLLED takes a number the dice can show (`results`), both
    through `components/ui/table-roll`, which the location's hazard list shares. Either
    one highlights the event(s) it lands on (`rowsFor`): one, none in a printed gap, or two in a printed overlap. A d66
    roll also shows its tens and units, so the GM can read a printed Wrath Die rule.
  - Tapping an event previews it: its read-aloud, its GM notes with the cite, and its Tests as the scene will get
    them.
  - MAKE THIS SCENE sends `codex.save { kind: "beat" }` with `presetScene({ table, row })` and this adventure's id. The
    scene goes last, and STORY shows `SCENE CREATED: <NAME>`.
  SAVE SCENE creates or updates the beat, and DELETE sends `codex.delete`. A refusal keeps the editor open with the
  error shown inline.

### 3.4 CODEX: NPCs, locations, handouts, factions

`CodexView`.
- **Sub-tabs** come from `CODEX_KINDS`, each mapping a kind to its `Codex` collection: NPCS, LOCATIONS, HANDOUTS,
  FACTIONS.
- **List:** each entry shows its name or title and an EDIT button. Kinds that have a `revealed` field (every kind
  except factions) also get a REVEALED / HIDDEN button. It flips `revealed` with a `codex.save` of the whole entry;
  players get the entry the moment it's revealed.
- **PICTURES** (issue #199): a nice addition, never in the way. NPCs, places and handouts end their editor with a
  PICTURE (OPTIONAL) fold, closed until the entry has one, holding PICTURE (`ImageField`) and PICTURE SHOWN TO
  PLAYERS. ADD PICTURE opens the file picker. The pick is shrunk in the browser (`shrink`, `lib/codex-image`: at most
  1024 px on the long side, WebP, or JPEG where Safari can't encode WebP) and uploaded at once. SAVE then puts the id
  on the entry, and REMOVE clears it; a picture that has gone meanwhile saves as none instead of refusing the edit. An
  opened row shows a 96 px thumbnail (it opens full size), dimmed while held back, with a PICTURE SHOWN / PICTURE HELD
  BACK toggle that flips `imageRevealed` the way REVEALED flips `revealed`. A handout draws its picture inside the
  prop, larger (240 px).
- **HANDOUTS are props** (issue #204). The editor has STYLE (`HandoutStyle`: PLAIN, DATA-SLATE, ADMINISTRATUM
  FORM, VOX TRANSCRIPT, DECREE) and HEADER (one line; empty prints the style's own, `DEFAULT_HEADER`), and a PREVIEW
  of the draft as `HandoutDoc` draws it. An opened handout row shows the same prop instead of its plain text. A
  `PrintPick` tick on each row and PRINT N print the ticked ones (§5.1).
- **LOCATIONS is a tree** (issue #50). `placeTree` nests each place under its `parentId`, and the rows indent with a
  dotted rule (`.place-branch`). A place with places inside gets an "N INSIDE" button that folds them, counting
  everything below it, and EXPAND ALL and COLLAPSE ALL appear once anything nests. A loop saved before the guard shows
  as a root, so no place disappears. Every place select lists in tree order, indented (`placeOptions`, `lib/places`).
  INSIDE leaves out the place and everything under it. A location's DELETE asks a second tap when places are inside
  (rules-flow §11.96).
- **ADD FROM BOOK** (`PlacePicker`, LOCATIONS only, issue #50) lists the books' places from `/places` (names and
  nesting only), each book a fold with its tree, or flat matches for a name search. Picking one shows its cite, its
  parent, "COPIES X + N INSIDE" and what goes into GM NOTES; ADD TO CODEX sends `codex.addPlaces` with the INSIDE
  chosen. A place holding 60 or more is refused, so a system goes in world by world. A copied place opens its GM NOTES
  with the cite, which the opened row shows as a `PageCite` link.
- **SPACE HULK GENERATOR** (`HulkGenerator`, LOCATIONS only, issue #50 step 8) runs RR1 pp.6–11 from `/scene-presets`'
  `spaceHulk` and its Hazards Table. Each stage is ROLL / I ROLLED (`TableRoll`) or a row picked from a fold: Origin
  (up to five, §11.101), Occupants, Objective, Rooms and Features & Hazards; origins, rooms and hazards collect as
  chips with ×. NEW HULK names it and picks INSIDE (top level by default); ROOMS FOR A PLACE rolls only rooms into a
  place already here (§11.102). WRITE TO CODEX sends `codex.addHulk` with row ids, then clears the picks.
- **`CodexEditor`** is generic, driven by `fieldsFor(kind, codex)`:

| Kind | Fields |
|---|---|
| npc | name, role, faction (select), attitude, description (players see it), GM notes, secrets, revealed |
| location | name, inside (parent location), description (players see it), HAZARDS · GM ONLY (`HazardList`), HAZARDS · YOUR NOTES (the free text), GM notes, revealed |
| handout | title, text, sent to players |
| faction | name, keywords (`KeywordPicker`: chips, a search over the books' Keywords, Enter for exactly what was typed), stance, notes, secrets |

`HazardList` (`codex/components/hazard-list/hazard-list.tsx`, issue #49) edits a location's `hazardList` in the
draft; SAVE sends it with the rest. ON THIS PLACE lists each entry through `hazardView` and `HazardChips`, with × and,
for a Core Rulebook hazard, LIGHT / MODERATE / INTENSE chips (rules-flow §11.94). ADD FROM A BOOK TABLE picks a book and
one of its `presets.hazards` tables; the GM taps a row, or ROLLs / types I ROLLED (`TableRoll`), then + ADD. ×TIER ·
n adds one rolled row per Tier, rolling again on a printed gap (`rollHazards`, §11.93). YOUR OWN HAZARD takes a name, a
Skill or Attribute and a DN (`NumberInput`), and what happens. A book entry stores only its row id.

  - The draft starts from the whole row, so fields that have no input in the editor (an NPC's `statSource`)
    survive a save.
  - On SAVE, an empty `…Id` select becomes `null`.
  - A refusal shows inline and keeps the editor open.
  - The page-level `Refusal` banner is used only for the reveal toggle.

### 3.4b ARCHIVE, the ARCHIVED banner and the ADMIN marker

- **`state.campaign.archived`:** `GmApp` and `PlayerApp` show `ArchivedBanner` (`ui/archived-banner`, first in the body) when
  it's set. The server refuses every action but `campaign.unarchive` and `campaign.delete` ("This game is archived"), so
  the banner says why before anyone taps. The GM's has OPEN SETUP.
- **SETUP › ARCHIVE** (`setup/components/archive-panel`): ARCHIVE GAME (`campaign.archive`, `ConfirmAction`). Once archived
  the panel is UNARCHIVE (`campaign.unarchive`), EXPORT and DELETE GAME (`ui/delete-game`: EXPORT FIRST, then type the
  game's name, then DELETE FOREVER, `campaign.delete { name }`). A deleted game's ack makes `GmApp` show `GAME DELETED`
  and `router.push("/")`, which closes the socket before the server kicks the room (about 200 ms later), so the
  disconnect never shows as NO SIGNAL.
- **PARTY › session band › NEXT SESSION** (`party/components/next-session`, issue #197): a dialog with a native
  `datetime-local` (this tablet's zone, sent as UTC by `fromLocalInput`) and PLACE, SAVE and CLEAR (the date only), all
  `campaign.update`. The band keys it on the stored date and place, so a change from elsewhere (START SESSION clears the
  date) resets the form; a saved date closes it.
  Members' lobby cards show the date too, drawn only in the browser (`useSyncExternalStore`), since the server's zone
  isn't the viewer's.
- **PARTY › session band** (§3.5): an optional TITLE beside START SESSION names the session as it starts (`session.start {
  title }`, checked with `SessionTitle`, issue #175). END SESSION WITHOUT XP (`session.abandon`, confirmed) is in END SESSION…'s
  dialog, and `session-history`, under SESSION JOURNAL · n at the foot of PARTY, is the session journal (issue #195): every session, newest first, each with EDIT for its TITLE (issue #175, shown as
  `SESSION 3 · THE FORD` here, in the running session's line and on INTEL), its RECAP (once ended) and the GM's NOTES (`session.edit`, checked with `SessionJournal`; notes closed on a plate), and DELETE LAST
  SESSION (`session.delete`, confirmed; the server's notice, that the XP it awarded stays, is shown).
- **ADMIN chip** in the GM header, after the seals, when `me.admin` (`GmApp`'s `admin` prop, from `/api/campaigns/:id/me`): a Clerk admin
  acting as GM at a table where they hold no seat.
- `ui/confirm-action` is the app's confirm for these: the button turns into the question with CONFIRM and CANCEL.

### 3.4c `/admin`: `components/admin/admin-view/`

`app/admin/page.tsx` reads `/api/admin/users`, `/campaigns` and `/events` on the server (`apiGet`) and sends a signed-out
caller, or a 401 or 403 (not an admin), to `/`. `AdminView` has two tabs, USERS and GAMES, and the ADMIN LOG under them.
- **USERS** (`users-tab`): name, role chip (ADMIN, CREATOR, NO ROLE; Clerk stays the source), last seen, the seats held;
  OPEN CLERK DASHBOARD for role changes; REMOVE FROM ALL GAMES (confirmed; not offered for yourself).
- **GAMES** (`games-tab/components/game-card`): OPEN AS ADMIN (`/c/<id>`), EXPORT, ARCHIVE (confirmed) or UNARCHIVE, END
  SESSION (`session.abandon`, confirmed), the GMs with REMOVE (`member.remove`, confirmed), ADD GM (a user picker,
  `member.seat`) and DELETE GAME (`DeleteGame`).
- **Calls** (`lib/admin`, `useAdminCall`): the browser POSTs `/api/admin/campaigns/:id/action` through the `/api` rewrite
  with the Clerk cookie. A refusal comes back as HTTP 200 `{ ok: false, error }`, so `toResult` turns every shape into
  an `ActionResult`; the line (with the server's notices) shows above the tabs, and a success runs `router.refresh()`.
- Times are shown in UTC (`stamp`): the page renders on the server and in the browser, and two zones would differ.

### 3.4a SETUP: the set-up checklist, framework and export

`Setup`.
- **SETUP checklist** (`SetupPanel`): the Core Rulebook's eleven set-up steps, each ticked from the campaign
  (`lib/setup`, nothing stored). GO TO opens the tab a step is done in (CODEX on the right kind, STORY for scenes, PARTY for ASCEND,
  AGENTS and SESSION) and scrolls to its panel.
- **NAME panel:** the campaign's name, RENAME sends `campaign.update { name }` (checked with `CampaignName`, issue
  #175). Every seat's header follows the state broadcast; DELETE FOREVER then asks for the new name.
- **Framework panel:** patron, framework, Framework Bonus, and the kind of game and limits (`TableTalk`), saved
  together with `campaign.update`; START FROM A FRAMEWORK opens `FrameworkPicker`. Players see all of it on INTEL.
- **EXPORT:** the whole campaign as a file, for a backup or the lobby's IMPORT GAME. It carries the pictures, so
  "Includes N pictures" sits beside it once the codex has any, with WITHOUT PICTURES (`?pictures=0`) for a small file
  when they'd make one too big to import.
- **ARCHIVE:** shelves the game, or deletes an archived one (§3.4b).

### 3.5 PARTY: session, kill team, table access

`Party`: the session band, the Agents as one-button cards, and one dossier sheet for the Agent tapped. What PARTY does
rarely sits behind MORE. A message line at the top (`role="status"`, amber, red with `!` on a refusal) reports what each
control did, with the server's `notices` (who crossed a Rank on `session.end`, whether the group may Ascend, Core pp.146–147).

- **Session band** (`session-band`, `#session`), one wrapping row:
  - `SESSION n · LIVE · <TITLE>`, or NO SESSION RUNNING with the reset reminder (Wrath → 2, Glory → 0, Ruin → the number of
    players, p.162) and, until one starts, an optional TITLE field (`session.start { title }`, `SessionTitle`, issue #175).
  - NEXT: `<date · place>` or NEXT SESSION: SET DATE, a quiet button that opens `next-session` in a dialog (§3.4b).
  - The one primary. No session: START SESSION n (`session.start`). Open: END SESSION… opens a dialog with XP EACH from
    `XP_AWARDS` (8 / 10 / 12, `DEFAULT_XP` 10) or typed, the RECAP (players see it), END SESSION (`session.end { xp, recap }`)
    and END SESSION WITHOUT XP (confirmed, `session.abandon`).
  - What the pools reset to is covered in [game-logic.md](game-logic.md).
- **ACTIVE AGENTS · n** (`.party-head`) has three buttons:
  - ROOM QR (`RoomInvite compact`, also on NEW CAMPAIGN's PLAYERS step) sends `invite.create { mode: "room", hours:
    ROOM_INVITE_HOURS }` (12) and shows `/invite/<code>` as a QR. Players scan it, sign in or join as a guest, and claim an
    agent.
  - RESPITE… (`respite-sheet`, Core p.197): every active Agent ticked, and APPLY · n AGENTS sends one `character.respite`
    for each tick. The sheet closes only when every one was accepted; a refusal (a Dying Agent) names who.
  - MORE (`more-panel`, with its own CLOSE): ADD AGENT (`character.create { name }`) and NEW FROM BUILDER; PRINT TENTS, with
    ACTIVE · n and IN RESERVE · n (§5.1); TABLE SCREEN (SCREEN QR: `screen.issue`, a read-only guest seat for the screen in
    the middle of the table; REVOKE SCREENS: `screen.revoke`); and TABLE ACCESS (a fold, below).
- **TABLE ACCESS** (`table-access`, from `state.access`, which only the GM receives in full):
  - The open invites: ROOM or the character's name, uses, ACCOUNTS ONLY when guests aren't allowed, the expiry, and
    REVOKE (`invite.revoke`). Anyone already seated keeps their seat.
  - SIGNED IN: each member's name and seat (GM, the character, or NO AGENT). Players have REMOVE (`member.remove`),
    which takes the seat away and disconnects them.
- **Roster:** the active Agents as a grid of `AgentCard`s, IN RESERVE · n as a fold (open when nobody is active), the
  ASCENSION fold (`AscendPanel`, always on the page: SETUP's Tier step scrolls to `#ascend` and opens the fold) and the
  SESSION JOURNAL · n fold (§3.4b).
- **Agent card** (`agent-card`): one button (`<NAME>, open dossier`) and nothing inside it is interactive. It shows the
  portrait, name, archetype, the seat (`seatLine`: SEATED · ACCOUNT, SEATED · GUEST QR or OPEN SEAT), Wounds and Shock as
  draining `Track`s with what's left `n/max` (as the tracker), WRATH, CORRUPTION, WEALTH, XP, a chip per Condition, the `pcStatus` chips and
  `n OBJECTIVES · m DONE` (`lib/party-view`).
- **Dossier** (`dossier`, a side sheet from the right edge through `PartyDialog`, a native modal `<dialog>`): the archetype,
  seat and RANK, then four tabs whose labels carry a value (`STATUS`, `GEAR · WEALTH n`, `ADVANCE · n XP`, `SEAT`). It is
  keyed by the Agent, so another one opens on STATUS. A refusal shows at the top of the sheet. Every control the old card
  had is in a tab:

| Tab | Control | Sends | Notes |
|---|---|---|---|
| STATUS | WOUNDS, SHOCK, WRATH | `character.adjust { wounds \| shock \| wrath: ±n }` | A tapped value (`TapValue`): Wounds and Shock show what's left, as on the card and the tracker. A tap opens a pad under it with two steps (`PAD_STEPS`: HEAL 1 / DEAL 1, RECOVER 1 / DEAL 1 for Shock, −1 / +1 for the rest) and a signed number (`+3` deals, `-2` heals; a bare number adds), APPLY and DONE. It stays open for repeat taps. The same damage rules as the tracker's taps (pp.193–199) |
| STATUS | CORRUPTION | `character.corrupt { delta }` | The GM's plain change (Core p.286), a tapped value |
| STATUS | CONDITIONS chips (× removes), + CONDITION | `character.update { conditions }` | Toggles a Condition on the character, also outside a fight |
| STATUS | OBJECTIVES | `character.objectives` | The GM's private list for this Agent: the whole list is sent each time |
| STATUS | CORRUPTION TEST | `character.corrupt` through `CorruptionTest` | A failed Test's Icons, the server adds the level modifier, the gain and +1 Ruin |
| STATUS | RESPITE | `character.respite` | This Agent only |
| GEAR | WEALTH | `character.supply { wealth: ±n }` | A tapped value: the GM's award (Core p.206) |
| GEAR | AMMO TYPE field, +1 AMMO / −1 AMMO | `character.supply { ammo: { kind, delta: ±1 } }` | The `AMMO_TYPES` datalist; +1 starts a new type, −1 at 0 drops it (§11.57). The type stays filled for repeat taps. The line above lists what the Agent has |
| GEAR | REQUISITION | `character.requisition` | Opens `RequisitionForm`: the ITEM field searches the catalogue (`<datalist>`); an exact name fills kind (`requisitionKindOf`), Value, Rarity and Keywords, shows the page and effect, and sends `wargearId`. Otherwise kind (WARGEAR / AMMO / GRENADES), item, Value, Rarity, item Keywords, a ranged weapon's ammo type. It shows the DN, the dice to roll (Influence + bonus dice), the matched Keywords, and refuses when there's no match or this session's Test is used. The GM enters the Icons, Wealth spent (only up to the shortfall) and a Complication, then RECORD |
| GEAR | CARRIED | none | The gear list as written |
| ADVANCE | XP, RANK, `n XP TO SPEND` | none | Rank follows this character's own XP (Core p.146); XP to spend is what advancement hasn't bought yet, shown once a build exists |
| ADVANCE | MUTATIONS | `character.mutate` / `character.unmutate` | `MutationRoll` over the Mutation tables (`presets.mutations`) |
| ADVANCE | EDIT (OPEN DRAFT when a player sent one) | a link to `/c/<id>/build/<characterId>` | The one editor (issue #18) |
| ADVANCE | SHEET | `SheetDialog` | The book's character sheet (`ui/book-sheet`) as the player's DOSSIER draws it, live, without SPEND WRATH (the GM spends from PARTY) |
| SEAT | INVITE | `invite.create { mode: "character", characterId, hours: CHARACTER_INVITE_HOURS }` (168) | A single-use link to `/invite/<code>` for that character, shown as a QR |
| SEAT | GUEST QR | `token.issue` | A no-account guest QR to `/join/<token>` |
| SEAT | REVOKE GUEST QR | `token.revoke` | Revokes the character's guest tokens and kicks guest sockets; a signed-in member keeps their seat |
| SEAT | LOAD STATS (JSON) | `character.update { stats }` | The pasted JSON goes through `CharacterStats.parse(JSON.parse(…))` in a `try`; a parse error shows on the message line |

Every code (room, invite, guest, screen) becomes a `QR_SIZE` (320px) PNG through `qrImage` (`lib/qr`), built from
`shareOrigin` with `qrcode`, using `TOKENS.ink` modules on `TOKENS.vellum`, and shows it full-screen in `QrDialog` with the
URL written underneath (inside the dossier for SEAT's, since its modal covers the page). The code is returned only once, so
a closed dialog can't be reopened; make a new one.

---

## 4. Player app: `components/player/player-app/`

`PlayerApp` is phone-first, laid out after the canvas page "Player phone, rebound (Oct 2026)" (canvas
`LRBEbp8GhgBAFeDk4pohVy`):
- `SYNCING…` until both snapshots arrive, and `CHARACTER NOT FOUND. ASK YOUR GM.` if `characterId` isn't in `state`.
- **Header** (`.pl-head`, sticky on every tab): an iron band with the campaign name and a mono status line, one of:
  - `NO COMBAT · STANDING BY`
  - `▶ RND nn · YOUR TURN`: the band turns crimson and a big `YOUR TURN` sits under it
  - `RND nn · <NAME> ACTING` or `<SIDE> PICK`, with `· YOU: DONE` added once the player has acted

  The lobby link and the account button (signed in only) and a `⋮` menu (a native `popover`: theme, LEAVE) sit on it.
- **Vitals strip** (`components/vitals-strip/`), under the band on every tab: what's left of Wounds and Shock, Wrath and
  the party's Glory (each a `RequestSpend` trigger, §11.122), `pcStatus` chips and the Conditions (each opens its rule).
  Each counter's label opens its rule too (`STRIP_RULES`: Wounds and Shock Core p.37, Wrath and Glory p.164), standing in
  for the long sheet's WRATH line and Legend.
  Tapping the name opens SHEET. Under it, on every tab, the pending spend requests (`PendingSpends`: yours with
  CANCEL, the others' read-only, §11.123), since a spend can be asked from the strip or FIGHT. Once the page scrolls past a marker 160 px down (`.pl-fold-mark`, an
  IntersectionObserver on a callback ref) it folds to one mono line.
- **Vibration:** when it becomes the player's turn, `navigator.vibrate(TURN_VIBRATION)` buzzes once. This is a
  `useEffect` on `myTurn`, with a ref so it fires only on the change.
- **Tabs** (`PLAYER_TABS`: SHEET, FIGHT, INTEL, RULES) sit in a sticky bar at the bottom, each with a Lucide icon. The
  open tab is in the address (`?tab=fight`, `TAB_PARAM`), set with `history.replaceState` so a refresh keeps it without
  a server round trip. FIGHT carries a lit square while a fight is on; INTEL a count of what's new.
- **NEW** (`hooks/use-seen`, `lib/seen`): the count on INTEL and a `NEW` tag on each new item.
  - **What counts:** a handout, known person or known location in this phone's own snapshot (so only what the GM has
    revealed) whose key (`handout:<id>`, `npc:<id>`, `location:<id>`) the phone hasn't seen. Its picture has its own key
    (`picture:<imageId>`), so a picture the GM shows later on an entry already seen makes it new again; an entry with a new
    picture counts once.
  - **Memory:** the keys seen, per campaign, in `localStorage` (`wg:seen:<campaignId>`), read through
    `useSyncExternalStore` so a second tab follows. Every read and write is guarded: with no storage the badge stays off.
  - **First visit:** a device with no record of the campaign stores everything already revealed as seen (the baseline,
    `shownKeys`), so a new phone isn't flooded.
  - **Marked seen** when the player leaves INTEL for another tab (`markSeen` in `handleTab`), or taps MARK ALL READ.
- **A called Test** (`components/player/test-prompt/test-prompt.tsx`, issue #191): a bottom sheet over every tab, above
  the tab strip, while the GM's call names this Agent. It shows the Test and its DN (unless hidden; a Corruption DN with this Agent's level
  modifier), the pool from `testPool` as a big number, the Icon, Wrath Die and Wrath reroll reminders as `RuleIdLink`s
  (and Fear's or Corruption's cost), then PASSED / FAILED (`test.report`; the pressed one is what the GM has, and a
  re-tap changes it). FAILED on a Corruption Test first asks for ICONS ROLLED, COMPLICATION, WRATH CRITICAL and SPENT 1
  WRATH. HIDE folds it to a bar; it starts folded once this Agent has answered.

| Tab | File | Shows | The player can change |
|---|---|---|---|
| SHEET | `components/player/player-sheet/player-sheet.tsx` | Two views, each opening with HOW TO READ THIS SHEET (`ui/sheet-guide`, folded) and every term a tap away from its meaning (`ui/term`, `lib/sheet-terms`: our own one-line wording with its Core page, plus FULL RULE when the seat is served it). AT A GLANCE: the Traits row, ARMAMENT (each weapon with its pool, `lib/sheet-pools`, and a key to the line), the five highest skill totals. DOSSIER: the Agent as the book's character sheet (Core pp.40–41), its two pages as two iron-framed sheets (`.bs-sheet`), each box (`ui/book-sheet/components/book-box`) titled over a quill rule, in the book's order. Page 1: Personal Details (our name bar and TIER · SPECIES · XP strip, then RANK, ARCHETYPE, KEYWORDS), ATTRIBUTES as RATING / BONUS / TOTAL (`attributeTotals`: mutations and Powered, §11.160), SKILLS in two columns of nine (Attribute in grey, Rating, the Total as the dice badge), WRATH (SPEND WRATH and USES FOR WRATH in our words), CONVICTION · RESOLVE · SPEED, SURVIVAL (Defence; Resilience as Base + Armour = Total; max Wounds, max Shock, Determination), each number with the book's grey formula as a caption and any bonus after it, then WARGEAR: the Kill Team-style datacard (`ui/book-sheet/components/wargear`: a ranged or melee icon, the name with its range, Salvo and traits, DICE, DMG +ED, AP), armour, `UpgradeRow`, gear, and SUPPLY (Ammo, Wealth) beside INFLUENCE. Page 2: TALENTS & ABILITIES folded (Talents stamped TALENT), INJURIES & CORRUPTION (Traumatic against the maximum, mutations, Corruption as five rows of five circles named by level), NOTES (WHO YOU ARE, then the GM's ORDERS folded), and PASSIVE AWARENESS · XP EARNED · CURRENT XP with LEVEL UP. A box the app has no data for (Objective, Faith, Memorable Injuries, Psychic Powers, Stealth, Size, Faction, Background) isn't drawn. The JOIN page's READ shows page 1 read-only (Personal Details to WARGEAR, `Wargear` without `live`) and TALENTS & ABILITIES. The sheet itself is one component, `ui/book-sheet` (`BookSheet`), drawn by the DOSSIER, GM PARTY's SHEET and the JOIN page's READ, so a change there reaches all three | Their own detail (WHO YOU ARE); spending their own Wealth and Ammo (−1, `character.supply`); fitting upgrades; asking for a spend. Granting Wealth or Ammo, Conditions, Wounds, Shock, Wrath, Glory and RESPITE are GM only |
| FIGHT | `components/fight/fight.tsx` | No fight: one line. Your turn: THIS TURN (`TurnActions`, Core pp.178–180), STRIKE (your weapons with their pools), SPEND (a Wrath and a Glory `RequestSpend`), and who picks after you. Otherwise a NOW ACTING plate (`Unseen threat` for `UNSEEN_ID`) and UP NEXT. Under either, both sides as lists (outlined in `--side-agents` / `--side-threats`): acted counts, a Wounds track with no number (mobs `×count of start`), the turn word, Conditions as `RuleLink`s, your own row marked YOU; a threat row toggles its `StatBlock`, or `Data restricted by the GM.` while it's `bars`; a hidden threat isn't there at all | Asking for a spend |
| INTEL | `components/intel/intel.tsx` | INBOX: what's new as transmission cards (handouts, then persons, then places; READ, SHOW THE TABLE), MARK ALL READ, then THE MISSION, NEXT SESSION (`lib/next-session`, ADD TO CALENDAR to `next.ics`; issue #197) and the MISSION LOG (issue #196). ARCHIVE: the codex search (`ui/codex-search`, issue #198), whose hits replace the list, then PERSONS · PLACES (nested by `placeTree`) · HANDOUTS · MISSIONS · RECAPS (issue #195). A row opens the entry sheet (a modal `<dialog>`: the entry, its picture only once the GM shows it, issue #199). SHOW THE TABLE puts a handout or a picture full screen (the Fullscreen API, else a fixed overlay) to hold up at the table | Nothing |
| RULES | `components/ui/rules-ref/rules-ref.tsx` | The rules reference, shared with the GM's RULES tab | Nothing |

**Hidden until the GM reveals it.** The filtering happens on the server (`toPlayerView` / `toPlayerCodex` in
`@wg/shared`), not in these components:
- A `hidden` threat isn't sent, and `currentId` is `UNSEEN_ID` on its Turn. The banner then reads `UNSEEN THREAT ACTING`
  and takes the side that's due from
  `encounter.upNext`, since `sideUpNext` on the filtered combatants would miss the hidden threat's Turn.
- A `bars` threat's `stats` is `null`, its `threatId` is `""` and its `personalRuin` is 0. Its bars, mob count and
  Conditions still come through.
- Factions are never sent. Adventures arrive only once `shown` (the mission log, issue #196), with their title, brief
  and status: never their premise or scenes.
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
| `threat-picker/threat-picker.tsx` `ThreatPicker` | `bestiary: Threat[]`, `tier`, `onPick`, `value?`, `label?` (`+ THREAT…`), `className?`, `disabled?` | The way into the bestiary, GM only: the trigger names the picked threat, and opens a native modal `dialog.picker` with a search over the name and keywords, faction chips, T/E/A/M chips for the class printed at this campaign's Tier (Core p.323) and a book select (`sourceName`, so a custom threat reads "Custom"). Only facets the loaded bestiary holds get a chip. The trigger disables itself with no bestiary loaded, and when the caller can't act on a pick (the custom-threat editor at its cap, issue #43). Each row shows the name, a class chip, the faction (`FACTION_LABEL`) and `threatCite`; a tap picks and closes. At most `PICK_LIMIT` (50, `constants.ts`) rows, then "N more, narrow the search", and "Nothing matches." when none do. Used by the FIGHT layer's add row and by every beat-editor encounter row |
| `threat-builder/threat-builder.tsx` `ThreatBuilder` | `start` (`{ slug, draft }`, slug null for a new one), `wargear`, `ruinActions`, `send`, `onSaved(threatId)`, `onCancel` | One custom stat block being written (issue #43), mounted fresh per open: `ThreatForm` (its child, `components/threat-form`), the refusal line, CREATE or SAVE (busy while `threat.save` is in flight, CANCEL with it) and CANCEL. Checks `CustomThreatData` first (`useFieldErrors`, NAME and KEYWORDS marked), then `onSaved(customThreatId(slug))`. Beside it, `constants.ts` holds `ThreatDraft` and the drafts (`blankDraft`, `cloneDraft`, `draftOf`, `quickDraft`), `ruinAbility` and `RUIN_ACTIONS_TABLE`, and `hints.ts` holds `threatHints`. Used by CODEX › THREATS and a scene's + NEW CUSTOM THREAT |
| `threat-starts/threat-starts.tsx` `ThreatStarts` | `bestiary`, `tier`, `disabled` (the cap), `onStart(draft)` | The three ways to start a custom stat block, as a fragment for the caller's row: CLONE FROM BESTIARY (a `ThreatPicker`, `cloneDraft` with the source's cite), BLANK, and QUICK (TIER n) from `quickRow` |
| `gm/codex/components/threat-editor/threat-editor.tsx` `ThreatEditor` | `editSlug`, `onEdit`, `customThreats`, `bestiary`, `wargear`, `ruinActions`, `tier`, `send` | The THREATS sub-tab of CODEX (issue #43): the campaign's own stat blocks with EDIT (its URL, `codex/threats/<slug>/edit`), CLONE and DELETE, a `PrintPick` tick on each row and PRINT N for the ticked ones (§5.1), and two ways to start one — CLONE FROM BESTIARY (the picker, filling the form with a copy whose `note` records the source) BLANK, or QUICK (Tier N), which fills the eight derived numbers from Core p.326's row (`quickDraft`, `quickRow`) and leaves the Attributes to the GM (§11.110). `ThreatForm` is the stat block in printed order (TA p.5) with a `–` toggle on every field that may print one (Core p.323) and weapons filled from the catalogue through `threatWeapon`; `threatHints` warns and never blocks (§11.109). Under the abilities, `+ RUIN: …` adds one of Threat Assessment p.7's five Additional Ruin Actions as a RUIN ability with its cite (`ruinAbility`), from the pool table GmApp already holds (`RUIN_ACTIONS_TABLE` on `/scene-presets`), so no second copy of the text exists. The three starts are `ui/threat-starts`, and the form, its refusal line and CREATE/SAVE are `ui/threat-builder` (rows below); a scene's + NEW CUSTOM THREAT shares both. Saving sends `threat.save`, which re-parses it server-side and returns the slug (`customThreatId`) |
| `threat-scale/threat-scale.tsx` `ThreatScale` | `threat?: Threat`, `tier`, `agents`, `asMob?`, `profiles`, `scale`, `onChange` | The GM's two levers on a threat before it joins: a chip per Tier 5 Threat Profile (`PROFILE_CHIP` in `constants.ts`: STRENGTH, CUNNING, WITHIN, with the full name, cite and effect in each title, VoA p.126) and a SCALE toggle that prints what it would add (`scaleBy`, Core p.326) and says beside itself that it adds nothing on a Troop or a Mob, while still showing a tick the GM has set there (§11.107). Used by the beat editor's encounter rows and the FIGHT layer's add row |
| `attitude-chip/attitude-chip.tsx` `AttitudeChip`, `attitudeLabel` | `attitude: Attitude` | An NPC's Attitude with its DN modifier ("HOSTILE · +4 DN", Core p.168); none for Neutral, red when it raises the DN. On the GM's NPC rows and the player's KNOWN PERSONS (rules-flow §11.89) |
| `budget-lines/budget-lines.tsx` `BudgetLines` | `tally: RosterTally`, `budget: EncounterBudget` | A roster against Building Encounters (Threat Assessment p.8): TROOPS, OF THOSE IN MOBS (a target of one reads as needing 2, Core p.324), ELITE OR ADVERSARY, MONSTROUS (no target in the book) and ENEMIES ("N tracked · M models"), each with UNDER / ON TARGET / OVER in words as well as colour, plus a note for entries the loaded bestiary can't class |
| `rule-item/rule-item.tsx` `RuleItem` | `r: RuleEntry`, `open?` | One rules entry as a `<details>`: name (a stat's `abbr` first), kind · cite, gist, and the book text inside. Used by the RULES tab, the stat legend and the rule dialog; `open` starts it expanded |
| `rules-provider/rules-provider.tsx` `RulesProvider`, `useRules()` | `rules: RuleEntry[]`, `children` | Wraps `GmApp` and `PlayerApp`. Builds a `ruleKey` → entries map once, over `LINKED_RULE_KINDS` only (Conditions, weapon and armour traits; not actions or stat block terms). It owns one native modal `<dialog>` that shows the entries as `RuleItem open` with CLOSE. Esc or a backdrop tap closes it, and focus returns to the tapped word. `useRules()` returns `{ find(name), open(entries) }` and throws outside the provider |
| `rule-link/rule-link.tsx` `RuleLink` | `name`, `children?` (defaults to `name`) | A trait or Condition as the data spells it (`Blast (6)`, `Inflicts (On Fire)`). If `find` resolves it, it's a `button.rule-link` (dotted underline, 32px hit area, `aria-label="Rule: <name>"`) that opens the dialog; otherwise it renders as plain text. `RuleIdLink` (`id`, `children`) does the same for an entry that isn't a trait, by id (the scene Tests' DN TABLE, SHIFTING, FAIL FORWARD). Needs a `RulesProvider` above it |
| `term/term.tsx` `Term` | `k` (a `lib/sheet-terms` key), `children?` (defaults to the term's name) | A sheet word a new player can tap: a `button.term` (dotted underline) whose native popover holds our one-line meaning and its Core page, plus FULL RULE when the seat is served the term's rule. The meanings are our own wording, never the book's sentences, so the JOIN page shows them to guests. Hidden by `.term-pop.term-pop` and shown only by `:popover-open` (the Popover API: Safari 17, Chrome 114). Needs a `RulesProvider` above it (the JOIN page mounts an empty one) |
| `book-sheet/book-sheet.tsx` `BookSheet` | `me`, `tier`, `table?` (`state`, `send`, `onError`, `asks`), `textless?` | The book's character sheet (Core pp.40–41), its boxes under `components/`. With `table`: both pages, live (`asks` on the player's own phone puts SPEND WRATH in the WRATH box). Without: page 1 and TALENTS & ABILITIES, read-only (the JOIN page) |
| `sheet-guide/sheet-guide.tsx` `SheetGuide` | none | HOW TO READ THIS SHEET, folded: five plain lines on Tests, Traits, weapons, Wrath and Glory, Keywords and Talents, each term a `Term`. Opens AT A GLANCE, the DOSSIER and the JOIN page's READ |
| `mentions/mentions-provider.tsx` `MentionsProvider`, `useMentions()` | `codex`, `missing` (`(removed)` on the GM's tablet, `(unknown)` on a phone), `onGoTo?` and `editor?` (the GM's only), `children` | Codex mentions (issue #200, campaign-model.md §Mentions). Wraps `GmApp` and `PlayerApp` over the seat's own snapshot. Lists every linkable entry (NPCs first, so an NPC wins a shared name), builds the auto-linker once (`nameLinker`) and owns one `dialog.rule-dialog` that peeks at an entry (`components/peek`: its CODEX fields, GM-only ones on a plate). A link inside the peek swaps the entry in place. With `onGoTo` the peek has GO TO (issue #198): `GmApp` pushes the entry's URL (§1.1), a scene's PAGE in STORY or `codex/<kinds>/<entry>`, which opens and scrolls to its `#entry-<id>` row. With `editor` the peek has EDIT: the dialog becomes a sheet from the right (`app/css/editor.css`) with the entry's `CodexEditor` (`sheet`: DONE and OPEN IN CODEX; not for a scene), and a tap outside or Esc can't drop the draft, only its × can. `edit(kind, id)` opens straight into the sheet (the scene editor's lists), and DONE then closes it; from the peek, DONE goes back to the peek |
| `mentions/mentions.tsx` `Mentions` | `text`, `self?` (the entry the text belongs to) | A codex text with its `@[kind:id]` tokens and plain entry names as `button.rule-link`s showing the live name. An unresolved token shows `missing`, and an unrevealed entry gets `(HIDDEN)`. The caller keeps its `<pre>`. Used by SCENE, STORY, CODEX and INTEL |
| `mention-field/mention-field.tsx` `MentionField` | `value`, `onChange(value)`, `multiline?`, `id?`, `placeholder?`, `useFieldErrors` marks | A codex text input or textarea. `@` plus letters lists up to `PICK_LIMIT` (8) matching entries under it (`fold`, names that start with the letters first). A tap, or Enter once a letter follows the `@`, writes the token (a bare `@` or an IME composition keeps Enter), and Escape closes the list. Used by CODEX's editor, the scene editor (all but TITLE) and END SESSION's recap |
| `codex-search/codex-search.tsx` `CodexSearch` | `query`, `onQuery(q)` | The codex search (issue #198): one `type="search"` box ("Search the codex") over the seat's `useMentions().entries`, so the GM finds everything and a phone only what its `toPlayerCodex` holds (blanked GM fields never match). `utils.ts` `searchEntries` folds the query (`lib/fold`) and matches the name, then the Peek's fields (`PEEK_FIELDS`) with mention tokens spelled out as names (`plainMentions`); a body hit carries a one-line snippet around the match. Name hits first, then by name; the hits are grouped by kind with a count, the first `LIST_LIMIT` shown. A hit opens the Peek. `/` focuses the box unless an input has focus. CODEX shows it under the sub-tabs over a list (never over an open editor, whose draft it would drop) and INTEL at the top; while it holds text the hits replace the list below |
| `weapon-line/weapon-line.tsx` `WeaponLine` | `weapon`, `strength?` | `weaponProfile` (§`lib/`), then each trait as a `RuleLink`. Used by the sheet's ARMAMENT, the FIGHT layer's selected character and `StatBlock` (ability and option weapons) |
| `status-chips/status-chips.tsx` `StatusChips` | `items: string[]` | Upper-cased chips. Anything matching `Slain\|Dead\|Dying` is `.chip.bad` (red), everything else `.chip.warn` (crimson outline) |
| `status-screen/status-screen.tsx` `StatusScreen` | `text` | Full-screen centred status line (`.center` + `.display`) for loading, access and error states |
| `print-dialog/print-dialog.tsx` `PrintProvider`, `usePrint()` | `source` (`{ state, codex, threats, wargear }`), `children` | Printed cards and handouts (issues #203, #204, §5.1). Wraps `GmApp` only, so a print follows the screen's gates. `usePrint().print(job)` resolves a `PrintJob` of ids (`printCards`, or `printHandouts` for a job with `handouts`) and opens a modal `dialog.rule-dialog`: the count, the kind's PAPER choices (cards A4 / LETTER under `PAPER_KEY`, handouts A5 / A4 / LETTER under `HANDOUT_PAPER_KEY`, in `localStorage`), BUILD PDF, then DOWNLOAD PDF and OPEN as plain links (iPad Safari blocks a window opened after an `await`), and the "print at 100 %" hint. `utils.ts` `picturesOf` redraws each tent's WebP portrait as a PNG data URL (react-pdf embeds PNG and JPEG only). The blob URL is freed on close |
| `codex-picture/codex-picture.tsx` `PictureProvider`, `usePictureCampaign()`, `CodexPicture` | `campaignId`; `imageId`, `alt`, `held?`, `large?` | A codex picture (issue #199). `PictureProvider` wraps `GmApp` and `PlayerApp` with the campaign whose pictures it serves. `CodexPicture` is a 96 px thumbnail (`a.codex-picture`, whole, framed; `large` for a handout, 240 px) that opens full size in a new tab. A plain `img`, not `next/image`: the api gates the bytes per seat, and the optimiser would fetch without the viewer's cookies. `held` dims it on the GM's screen |
| `handout-doc/handout-doc.tsx` `HandoutDoc` | `handout` (`{ id?, body, style, header, title?, imageId?, imageRevealed? }`) | A handout as its prop (issue #204), on the phone, in CODEX and in the editor's preview. Its picture (issue #199) sits under the header. `plain` is the bare `pre.text.slate` every handout had before; the other four are `.handout-doc[data-style]` frames in `globals.css`: data-slate (bezel, scanlines, a centred banner), form (reference line, a dashed stamp box, ruled lines), vox (static strips, `voxLines` stamps in a column only as wide as the longest and absent when no line has one), decree (Cinzel heading, a drawn wax seal, a signature line). The frames set the `--paper*` palette on themselves, so they stay paper in vigil. The body goes through `Mentions`. `constants.ts` holds `HANDOUT_STYLE_LABEL`, `DEFAULT_HEADER` and `headerOf`, shared with the printed page |
| `print-pick/print-pick.tsx` `PrintPick` | `name`, `on`, `onToggle` | A row's tick for PRINT N on CODEX › THREATS and ITEMS (§5.1): a square / ticked-square button with `aria-pressed`, which doesn't open the `<summary>` it sits in |
| `refusal/refusal.tsx` `Refusal` | `error: string \| null`, `onDismiss` | A `role="alert"` banner fixed to the bottom, showing `! <error>` with an OK button. Renders nothing when `error` is `null` |

### `lib/`

Each lib is a pure helper that takes an options object. Every one except `tokens` has a sibling `*.test.ts`, run
with `bun test lib`.

| Lib | Export | Job |
|---|---|---|
| `blocks/blocks.ts` | `blocks({ value, max })`, `MAX_CELLS` (10) | `{ filled, cells }` for a track scaled to at most 10 cells (drawn by `components/ui/track`). Any damage fills at least one cell, anything short of max leaves at least one empty, and overflow stays full |
| `weapon-line/weapon-line.ts` | `weaponProfile({ weapon, strength? })`, `weaponLine(…)` | `weaponProfile` is the one-line profile without traits: `dmg +ED ED · AP · R short/med/long · S salvo`. `addStrength` melee prints `S+X`, or a number when `strength` is given. A `salvo: null` prints `–`, and an absent salvo is omitted. `weaponLine` appends `· traits` as plain text, for places with no `RulesProvider`; inside one, use the `WeaponLine` component |
| `tokens/tokens.ts` | `TOKENS` | Raw colours for places CSS variables can't reach: the QR canvas, the viewport `themeColor`, the manifest and the printed PDF cards (ink, rubric red, cut-line grey, the marker colours). It mirrors `:root`, so change both together |
| `print-cards/print-cards.ts` | `printCards(job, source)`, `layoutCards(cards)`, `fitThreat`, `cardHeight`, `fieldedAgentIds`, `PrintJob`, `Card` | What a print holds and where each card goes (§5.1). `constants.ts` holds the poker size, the 3 × 3 grid and the paper sizes |
| `threat-filter/threat-filter.ts` | `filterThreats(bestiary, facets, tier)`, `ThreatFacets` | The bestiary narrowed for the `ThreatPicker`: the query folds away case and punctuation on both sides (so "tau" finds "T'au") and matches the name or any keyword, and the class facet is the one printed at that Tier (`threatClassAt`, Core p.323) |
| `fold/fold.ts` | `fold(s)` | A search key: case, punctuation and accents dropped, letters kept (so "tau" finds "T'au" and "é" still narrows). Shared by every name search: the threat filter, the pickers, `@` mentions, `lib/keywords` and the codex search |
| `command/command.ts` | `parseCommand`, `targetsOf`, `Parsed` | The tracker command line (§3.2) |
| `scene/scene.ts` | `currentScene(codex)` | The scene being played: the one `active` beat (`beat.begin` keeps it to one), with its adventure and its index; `null` with none. Read by SCENE and the header's `SealButton` |
| `scene-reveal/scene-reveal.ts` | `findRevealable`, `revealAction`, `undoBegin` | What SCENE sends to show or seal an entry: `revealAction` is a whole-entry `codex.save` with `revealed` set (id and `revealedAt` stripped), and `undoBegin` is the action list that takes a `beat.begin` back (§3.0a) |
| `fight-delta/fight-delta.ts` | `parseDelta`, `counterKey`, `DIRECTIONS`, `DIRECTION_SIGN` | The delta pad's number: a signed `-3` or `+2`, or a bare one that follows DEAL or HEAL, whole 1–99, else `null`; and which `COUNTER_ACTIONS` key a field and delta are, for the log wording |
| `story-scenes/story-scenes.ts` | `sceneFixes`, `readiness`, `entryName`, `entryLine`, `tagline`, `exitNumber`, `toggleId` | STORY's words: what a scene lacks (`NO GOAL`, `NO READ-ALOUD`, exits to nowhere) and its `READY ✓` / `n TO FIX`, a prepared entry as a name and count (with its Profiles and "scaled"), a card's tagline, an exit's `nn` and an ON ENTRY pick toggled |
| `party-view/party-view.ts` | `PAD_FIELDS`, `padAction`, `seatLine`, `objectivesLine` | PARTY's: the action each tapped value sends (`character.adjust`, `character.corrupt` or `character.supply`), an Agent's seat as words and the objectives count on a card |
| `seen/seen.ts` | `SEEN_KINDS`, `entryKeys`, `shownKeys`, `freshKeys`, `isFresh`, `freshCount` | The player's NEW badge (§4): the keys a snapshot shows, those a phone hasn't seen (none for a device with no record), and the count. `hooks/use-seen` keeps the seen keys in `localStorage` |
| `vox-lines/vox-lines.ts` | `voxLines(body)`, `VoxLine` | A vox transcript's lines: one starting with a bracketed stamp of up to 24 characters (`[03:12] text`) splits it off; every other line stays as written (issue #204, Decision 3) |
| `codex-image/codex-image.ts` | `fit`, `shrink`, `uploadImage`, `imageSrc` | A codex picture on its way up (issue #199). `fit` is the drawn size (at most 1024 px on the long side, never enlarged). `shrink` draws it on a canvas as WebP 0.85, or JPEG on vellum where `toBlob` can't make WebP. `uploadImage` posts the bytes and returns `{ id }` or `{ error }`. `imageSrc` is the seat-gated URL |
| `toggle-set/toggle-set.ts` | `toggleIn(set, id)` | A new set with `id` added or removed, for picked-row state (CODEX's PRINT N ticks) |

### 5.1 Printed cards (issue #203)

The GM prints fold-over tent cards, Threat cards and item cards for the table. It is a **PDF built in the GM's
browser** with `@react-pdf/renderer`, not `window.print()`: each card sits at fixed millimetres, so a sheet prints the
same from any device at 100 %. The renderer and its fonts load on the first BUILD PDF only (`import()`), so the GM
bundle doesn't carry them.

- **The job.** A button calls `usePrint().print({ agents?, encounter?, threats?, items? })` with ids only.
  `printCards` (`lib/print-cards`) resolves them against the GM app's state, codex, bestiary + customs and wargear:
  - an Agent → a tent from `deriveStats`;
  - a prepared encounter row → what `beat.startEncounter` will field: `prepareThreat` with its Profiles and scaling,
    one tent per combatant under the tracker's label (`Ork Boy 1`, `Ork Boy ×6` for a Mob), and one Threat card per
    row with the Profiles named in its footer;
  - a threat id → its Threat card, unprepared; an item id → its item card (`description`, never `gmNotes`, plus the
    catalogue entry with a relic's mods applied).
- **Card sizes.** Tents and items are one poker card (63 × 88 mm). A Threat card starts at its class's size (Troop 1,
  Elite 2 wide, Adversary or Monstrous Creature 2 × 2) and takes the next size up, at most the whole sheet, until its
  text fits at 6 pt or more. `cardHeight` predicts the height from the text length, a fit to react-pdf's own layout
  of the bestiary; refit it if `threat-card.tsx` changes. Text that overflows a fixed-height react-pdf box isn't
  clipped cleanly, the paragraphs squeeze into each other, which is why the card is sized and not shrunk.
- **The sheet.** `layoutCards` places cards first fit on a centred 3 × 3 grid (189 × 264 mm fits A4 and Letter), so
  a card never splits across pages. `components/print/card-sheet` draws it: `TentCard` (the players' half printed
  upside down, a dashed fold), `ThreatCard` (the stat block in printed order), `ItemCard`. Ink on white with grey cut
  lines. The faces come from `components/print/fonts.ts` (`registerFonts`, `DISPLAY`, `SERIF`, `MONO`): Cinzel and
  Crimson Pro as static WOFF from Fontsource, IBM Plex Mono as IBM's own WOFF (`@ibm/plex-mono`; fontkit can't read
  Fontsource's subset of it), all SIL OFL with the licences beside them in `public/fonts`. react-pdf can't use the
  variable fonts `next/font` serves.
- **Handouts** (issue #204) are the second kind of print. A job with `handouts` resolves through `printHandouts` to
  `HandoutPage`s, with mentions spelled out as the table may know them (`tableText`, the same rule as item cards).
  `components/print/handout-sheet` draws one handout to a page at A5 (the default), A4 or Letter (`HANDOUT_PAPERS`,
  remembered under `HANDOUT_PAPER_KEY`): the frame `HandoutDoc` draws on the phone, repeated on every page a long one
  runs to (`fixed`), with the header from `headerOf` and vox stamps from `voxLines`. Two A5 handouts share an A4 sheet
  through the printer's "2 pages per sheet", as the dialog says.
- **The dialog** keeps the kind (`Doc`) and takes its title, papers, remembered pick, hint and file name from `KINDS`;
  a build lazy-imports `fonts` and that kind's sheet only.
- **Adding a kind** (#205, #206): a `Card` variant and its branch in `printCards` for something that prints as a card;
  for a page-shaped print, a `Doc` kind with its `KINDS` entry, a resolver beside `printHandouts` and a sheet under
  `components/print`. Either way, a `PrintJob` field for its ids.

---

## 6. How errors reach the user

| Surface | Where | Looks like | Clears |
|---|---|---|---|
| Status screen | the `/`, `/c/<id>` and `/invite/<code>` pages, the apps before their first snapshot | A full-screen message (§1) | On navigation or reload |
| Offline badge `.badge-offline` | `GmApp` and `CampaignSetup` (`NO SIGNAL · RECONNECTING`), `PlayerApp` (`NO SIGNAL`) | A red full-width row at the top of the header band while `!online`, in flow so it never covers the header's buttons; the last state stays on screen | On reconnect |
| `Refusal` banner | `GmApp` (the header's seals), `CodexView` (the reveal toggle), `Sheet` (every player action) | A red alert bar fixed to the bottom, above the page's own bottom bar (`--bar-h`: the player tabs, the builder's XP bar) and the home indicator, `! <error>`, with an OK button | On OK, or on the next success |
| Tracker error line | `Tracker` (`.red` above the key bar) | `! <error>` from command parse errors and from every `run` refusal (buttons, delta pad, add-combatants, undo) | On the next successful `run` |
| Scene / Story / Party message line | `Scene`, `Story`, `Party` (top of the tab) | Amber on success (`SCENE BEGUN, TAKEN BACK`, `<TITLE> BEGUN · 2 REVEALED`, `SESSION STARTED · POOLS RESET`…), red on refusal (starts with `!`) | Replaced by the next message |
| Inline editor error | `BeatEditor`, `CodexEditor`, `ThreatBuilder` | `! <error>` above the buttons; the editor stays open with the draft intact | On the next save |
| Refused field | Every CREATE, ADD and SAVE with a required field: NEW CAMPAIGN's NAME, `TableTalk`, `AddByName`, STORY's adventure, ADD AGENT, the codex and scene editors, the threat editor, YOUR OWN HAZARD, requisition | `useFieldErrors` parses with a shared zod schema (`CreateGame`, `CodexSave`, `CharacterName`, `CustomThreatData`…) before sending: each refused input gets `aria-invalid` (a red border on a red tint, `globals.css`), `FieldError` says why under it (`! Required.`, `! At most 100 characters.`, `sayIssue`), and the first takes the focus. A refusal on a field with no input of its own (an ability in a list) goes to the form's error line as `KEY: reason` | When that field is edited |
| Inline form error | `NewCampaign` (CREATE), `LobbyView` (IMPORT GAME, which also marks the file input), `InviteAccept` | `! <error>` from the api's message, or `No signal` | On the next attempt |

The error text is either the server's `ActionError` message or one of the two client strings from `send`
(`No signal`, and `No reply from server. Check before retrying`).

---

## 7. Styling

The look is the "Imperial Manuscript", after the print design of the Wrath & Glory books: a cold grey page with
grain, mottle and a smudged vignette (SVG noise tiles `--grain` and `--mottle`, plus the `radial-gradient`s on `body`),
crimson Cinzel section heads beside the books' quill rule (a serrated bar ending in a feather), black iron bands with a
dry-brush torn edge and bone text for headers and tabs, stat blocks as printed (a spiked crest, a crimson title bar,
charcoal bands with ragged ends), the sealed plate (the books' Optional Rule box: spiked crest bar and winged skull) for
GM-only content, and flat panels and tables so numbers read at arm's length. Warmth comes only from crimson and brass. None
of it uses book art: everything is CSS, plus inline SVG masks and noise. The token names keep "vellum" from the first,
warmer pass. Mock-ups and the design language: canvas `LRBEbp8GhgBAFeDk4pohVy`. Everything is plain CSS in `app/globals.css`, using short
utility and component classes plus inline `style` for one-offs, and the scene-first GM screens keep their own rules in
per-screen files (below).

**Per-screen CSS** (`app/css/`, imported after `globals.css` in `app/layout.tsx`, so a rule there wins a tie), one file for
each scene-first screen:

| File | Holds |
|---|---|
| `fight.css` | The FIGHT layer: `.fight-row` and its cells, `.fight-keys` and its panels, `.fight-pad` (the delta pad), `.fight-vis` |
| `header.css` | The header's popovers (`.hd-pop*`), the seal buttons (`.hd-seal`, `.hd-pad`), and the rail's SETUP at its foot (`.tabs.rail .tab.foot`) |
| `scene.css` | SCENE: `.scene`, the strip, the layer switch (`.scene-layers`), the two columns, IN THIS SCENE, WHERE NEXT, the SCENE BEGUN notice |
| `story.css` | STORY: the spine and its cards, the spread (`.story-spread`, `.story-leaf`), sections and pencils |
| `party.css` | PARTY: the session band, the agent cards, the dossier sheet (`dialog.party-dlg`), the tapped values |
| `player.css` | The player shell (`.pl`, `.pl-head`, the vitals strip `.pl-strip`/`.pl-vt`, `.pl-nav`/`.pl-tab`) and the dataslate accents every player screen shares: `.mono`, `.cut` (clipped corners, an inset focus ring), `.slate-card` (iron with scanlines), `.xmit` (a `+++ HANDOUT +++` stamp), `.pool-badge` |
| `player-sheet.css`, `player-fight.css`, `player-intel.css`, `player-test.css` | One player screen each: SHEET, FIGHT, INTEL, the called Test |
| `invite.css` | `/invite/<code>`: the Agent cards to skim before taking a seat (`.agent-pick`, the Attribute row, best Skills, weapons) and the READ dialog's printed stat block |

**Themes.** `:root` is **vellum** (day). **Vigil** (night: soot page, bone ink, ember red) re-maps the same tokens
under `:root[data-theme="vigil"]`, and under `prefers-color-scheme: dark` unless `data-theme="vellum"` is set.
`ThemeToggle` (`components/ui/theme-toggle/`) stores the choice per device in `localStorage` (`THEME_KEY`), and
`THEME_SCRIPT`, inlined in `<head>` by `app/layout.tsx`, applies it before first paint (`<html suppressHydrationWarning>`).
The toggle shows a Lucide moon (to vigil) or sun (to vellum), swapped by CSS (`.theme-to-night` / `.theme-to-day`), so server and client markup match.

**Fonts** come from `next/font/google` in `app/layout.tsx` and are exposed as CSS variables on `<html>`:

| Variable | Font | Use |
|---|---|---|
| `--font-display` → `--display` | Cinzel (variable) | Heads, labels, buttons, tabs, chips: `.display`, `.label`, `.rule`, `.btn`, `.tab`, `.chip`. Stands in for the books' Priori Serif |
| `--font-serif` → `--serif` | Crimson Pro (variable, with italics) | Body text, the default for everything; counters use its lining tabular figures. Stands in for Caxton |
| `--font-mono` → `--mono` | IBM Plex Mono (400/500/700) | In-world print-outs and typed commands (`pre.text.slate`, `.cmd input`), and on the player's phone the dataslate's live readouts: counters, the status line, pools, `.xmit` stamps, the invite page's Agent cards (`.mono`) |

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
| `--grain`, `--mottle`, `--stain-a`, `--stain-b`, `--vignette` | The page-ground texture: SVG noise tiles (dark specks by day, pale by night), faint stains, the smudged edge |
| `--overlay` | Near-opaque backdrop for `.overlay` (the QR dialog) |
| `--hi-light`, `--shade-28`, `--shade-35`, `--shade-40`, `--shade-50` | Bevel highlight and black shades for button bevels, tab dividers, the rail's inner shadow and the refusal bar's drop shadow; the same in both themes |
| `--bone-line`, `--bone-wash` | Bone at 22% and 8%: the pool frames and the inner ring of a button on a band, a band button's hover |
| `--ink-shadow`, `--ink-shadow-soft` | The lifted shadow under an `.item` card |
| `--bar-h` | Set per shell (`.pl` 52px, `.bld` 64px under 900px, else 0): the height of the page's fixed or sticky bottom bar, which `.refusal` sits above |
| `--marker-red`, `--marker-amber`, `--marker-green`, `--marker-blue`, `--marker-purple`, `--marker-white` | Threat marker swatches, always in an ink frame. They match the coloured tags on the physical minis, one per `Marker` value in `@wg/shared` |
| `--side-agents`, `--side-threats` | Blue and orange outlines on the player FIGHT cards (Agents, Threats). Orange, not crimson, so a threat never reads as "now" |
| `--serif`, `--display`, `--mono` | Font stacks |
| `--clerk-*` | Clerk's sign-in screens and `UserButton`, mapped from the tokens above (`--clerk-color-primary: var(--red-fill)`, `--clerk-color-background: var(--vellum)`, `--clerk-font-family: var(--serif)`, `--clerk-border-radius: 2px`…) |

**Class vocabulary:**
- Text: `.sr-only` (read by screen readers, not drawn), `.display`, `.page-title` (the 30px page and round title), `.dim`, `.accent` (crimson emphasis: the acting combatant, notices, success), `.red` (errors),
  `.label`, `.rule` (a section head; the double rule is drawn by `::after`), `.kw` (keywords in crimson small caps).
- Dialogs: every dialog ends in `.dlg-foot` (sticky): CLOSE as a plain `.btn.sm` at the right end, a main action
  (PLAY, GO TO) at the left. A way out is never crimson, the colour that means "do it".
- Controls: `.btn` (ink outline with an inner double frame), with `.primary` (crimson fill), `.danger`, `.sm` (32px),
  `.sq` (44px square; every "◂" back link) and `.sq.sm` (the dense 32px square, the builder's −/+ steppers); `.input`;
  `.field`; `.check` (a checkbox or radio label with a 44px hit area) and `.check-box` (a lone checkbox padded to 44px).
  Native file inputs get a `.btn`-style `::file-selector-button`.
- Chips: `.chip`, with `.warn` and `.bad`; `.now-chip` (the tracker's "▶ X ACTING").
- Tabs: `.tabs` / `.tab`, an iron strip; `[aria-selected="true"]` is crimson with a bright top stroke. `.tabs.rail` is
  the GM's right-edge chapter rail, of links (the open one is `[aria-current="page"]`; the open tab on a torn crimson stroke, `data-n` numerals behind the rest; a top
  strip under 900px). `.tabs.sub` is an underlined in-screen strip (codex kinds, rule kinds) that scrolls sideways
  when it doesn't fit.
- Bands: `.band` (iron, bone text; `.btn`, `.dim` and `.label` inside it switch to their on-iron colours) and
  `.band.torn` (adds the ragged bottom edge). Used by `.gm-head`, `.pl-head` (the player header, sticky over every tab) and `.bld-head` (the builder, NEW CAMPAIGN,
  set-up and lobby headers).
- Book furniture: `.sb*` (the stat block: `.sb-title`, `.sb-grid`, `.sb-head` with `.cur` for the campaign Tier,
  `.sb-v`, `.sb-shade`, `.sb-band`, `.sb-body`), `.tbar` (a crimson table title bar; `.iron` for Threats), `.plate`
  (sealed plate: GM-only content, e.g. the codex editor's GM notes, secrets and hazards), `.handout` (a sealed
  slip), `.track` (framed wound/shock cells, `.harm` or `.ink`; `components/ui/track`), `.seal` (a pool as a wax seal;
  `components/ui/seal`).
- Layout: `.panel`, `.item` (`.now` for the acting card on FIGHT), `.item-head` (a card's full-width header row, 44px
  tall), `.list` (`.table` for a bordered, gap-less table), `.stack`, `.cols`, `.keys`, `.pad`, `.center`, `.overlay`,
  `dialog.picker` (a wide modal, framed like `dialog.legend` and `dialog.sheet`, with `.tp-facets` and `.tp-row` for
  the threat picker's facets and rows), `pre.text` (long text with its line breaks, in the serif; `.slate` for in-world print-outs in Plex Mono),
  `.setup-scroll` (a wide table that scrolls inside itself on a phone).
- Shells: `.gm*` for the GM, `.tracker*`, `.turn-strip` and `.fight-*` for the tracker, `.cmd` for the command bar,
  `.pl*`, `.vitals`, `.vital` and `.traits` for the player app.

**Layout:**
- **GM:** tablet-first. `.gm` is a full-height grid: the header band and the scrolling body on the left, the
  112px chapter rail on the right. The tracker is a two-column grid: the main list, plus a 300px side panel, side by side
  down to 1100px wide, so a landscape tablet keeps the stat block beside the table (its rows drop CLASS, DEF and RES under
  801px, `fight.css`); narrower, the side panel goes under the list. SCENE's
  `.scene-cols` and STORY's `.story-spread` are two columns that stack under 860px.
- **`@media (max-width: 900px)`** is the app-wide breakpoint (`scene.css` adds 520px for SCENE's phone tweaks):
  - The GM shell becomes one scrolling page instead of fixed-height panes, and the rail becomes a top tab strip that
    scrolls sideways inside itself and sticks to the top, like the player's bottom strip.
  - Header titles keep a row with the back button while there is room, then wrap.
  - The tracker stacks, with the side panel below the list.
  - The tracker's rows (`.fight-row`) don't use the media query: they pick their columns from the width `.tracker-main` gets
    (`@container tracker`, `fight.css`), so a row fits a 390px phone (§3.1).
- **Player:** phone-first single column, capped at 720px and centred on bigger screens (the banner and tabs stay full
  width). `.vitals` is 2 columns. `.cols` wraps at `minmax(280px, 1fr)`.
- **Safe areas:** `viewport-fit=cover` (`app/layout.tsx`). `body` pads the left and right insets once; headers add
  the top inset, and fixed bars (`.refusal`, `.bld-xpbar`) and the player's sticky tabs add their own.
- **Grid cells** get `min-width: 0` (`.fight-cell`) so bars shrink instead of spilling into the next column.

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
- **`useEffect` only for external systems.** Each one is commented with the system it syncs: the socket, the wake
  lock, `navigator.vibrate`, the book page relay, timers and focus, document listeners and the native `<dialog>` (the
  header popovers, the delta pad, PARTY's sheets), and `localStorage` for INTEL's NEW marks.

  There's no client-side read. The browser `fetch` calls are REST writes: NEW CAMPAIGN's CREATE, the lobby's IMPORT
  GAME and library rows, and accepting an invite.
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

1. Add the name to `GM_TABS` in `components/gm/gm-app/constants.ts`, before SETUP (which stays last, at the rail's foot), and
   a matching numeral to `TAB_NUMERALS`. `GmTab`, the rail and `?tab=` pick it up.
2. Create `components/gm/<name>/<name>.tsx`: a `"use client"` component with typed props. It takes what it needs
   from `state`, `codex` and `send`, and `bestiary` if it adds threats.
3. Give it a route: `app/c/[campaignId]/(table)/<name>/page.tsx`, a `"use client"` page that reads `useGm()` and renders
   it. A screen inside it (an entry, an editor) gets a folder and a `gmPath` builder; once there are several, move the
   component into the folder's `layout.tsx` and leave the pages returning `null` (§1.1).
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
   `lib/command/constants.ts`. The command line picks it up and the vox log words it (`counterKey`, `lib/fight-delta`). The
   delta pad has only WOUNDS and SHOCK (`PAD_FIELDS`, `tracker/constants.ts`), so a new field needs a segment there too.
   If the field is new, add its difference to `preview()` in `tracker.tsx` too, or UNDO won't reverse it.
3. **Any other verb:** add a `case` to the `switch` at the end of `parseCommand` that returns `{ actions: [...] }` or
   `{ error }`. Use `t.characterId` for character actions and `t.combatantId` for combatant actions.
4. **Turn verb:** route it through `runCommand` in `tracker.tsx`, so it fires the Condition reminders the buttons do.
5. **New server action:** if the verb needs one, follow "Adding an action" in `CLAUDE.md` first.
6. **Test:** add cases to `lib/command/command.test.ts`.
7. **Docs:** update the verb table in §3.2, and the input's `placeholder` or the `Unknown command` hint if it's a
   headline verb.
