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

## Decisions (Tony left them to Claude, 2026-10-06)

1. **The Agents' Wounds, Shock, status and Conditions show on the TV.** The phones' FIGHT tab already shows them to
   the whole table, so the screen adds nothing private.
2. **Nothing else for now.** Sending a handout to the screen is a separate feature (a new "cast" action and a codex
   field); worth it only if the table asks.
3. **Several screens are fine.** Each SCREEN QR tap makes a new token, and REVOKE SCREENS drops them all at once.

## Since the spike

- `screen.issue` and `screen.revoke` touch neither snapshot, so they no longer rebroadcast the state.
- A smoke test (`apps/api/test/smoke.test.ts`, "table screen") covers the join, `/me`, the refused book text, the
  view (no objectives, no Ruin, no private handout), a refused action, and REVOKE SCREENS kicking the socket. The
  whole smoke suite passes against a local Postgres 16.

## Still unchecked

- The layout on a real TV: the web app can't run here without Clerk keys. Its styles are in
  `components/screen/table-screen/table-screen.css` rather than `globals.css`, to stay clear of the UI pass.
- `membership.role` is typed `Role`, so TypeScript would allow `"screen"` there; nothing writes it.
