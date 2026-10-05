# Spike: table screen

A read-only view for a TV or spare tablet in the middle of the table: whose side is up, the Round, Glory, and the
Agents' and visible threats' bars. Item 5 of the feature-spike list.

## What it proves

- **A read-only seat needs no new trust path.** A new `Role` value, `"screen"`, is only ever held by a guest token
  (`access_token`, `characterId: null`); no membership gets it. `authorize()` refuses every action from it before the
  PLAYER_ACTIONS check (`apps/api/src/table/table.dispatch.ts`), so the seat can't change anything even if a browser
  sends actions by hand.
- **It can't leak one player's private data.** The screen socket joins the players room and gets
  `toPlayerView(state, null)` and `toPlayerCodex(codex, null)`. A new unit test (`packages/shared/src/state.test.ts`)
  checks a null viewer gets no objectives, no Ruin, no hidden threats and no audience-restricted handouts.
- **No book text reaches the TV.** `/rules`, `/creation` and `book:request` refuse a screen seat.
- **Joining is mostly reuse.** PARTY › TABLE SCREEN › SCREEN QR sends `screen.issue` and shows the usual QR dialog on
  `/join/<token>`; the existing join route sets the guest cookie and `/c/<id>` renders `TableScreen` for that seat.
  REVOKE SCREENS (`screen.revoke`) revokes every screen token and disconnects the TVs (`Kick` gained `{ screens: true }`).
- **Whose side is up** comes from `encounter.upNext`, worked out server-side before hidden threats are dropped, because
  `sideUpNext` on the filtered view would miss their Turns (same reason as the player app).

## Schema

None. `access_token.role` is plain text, so no migration.

## Left out on purpose

- Not run against a live api or looked at on a real TV: there is no Postgres or Clerk in the spike environment. Typecheck,
  lint, format and the 266 unit tests pass.
- No layout choices for the GM (what to show, portrait vs landscape, hiding Agents' bars).
- `screen.*` actions take the default `touches()` and cause one needless state broadcast.
- Every SCREEN QR tap mints a new token that lives until REVOKE SCREENS (marked `ponytail` in `auth.service.ts`).
- `membership.role` is typed `Role`, so TypeScript would allow `"screen"` there; a separate member role type would be tidier.

## Open questions for Tony

1. Should the TV show the Agents' Wounds and Shock, or only the threats and the turn?
2. Should anything else go up there: Conditions on Agents, the scene's name, a revealed handout the GM "casts" to it?
3. One screen per table, or several (a TV and a tablet at the far end)?

## Size of the full feature

S: one PR. Polish the layout on a real TV, add a smoke test (screen token joins, its actions are refused, revoke kicks
it), narrow `touches()` for `screen.*`, and decide token reuse.
