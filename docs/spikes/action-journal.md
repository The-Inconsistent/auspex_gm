# Spike: server-side action journal (undo and recap drafts)

Spike 6 of `feature-spikes.md`, now **built on the server** (the tracker UNDO and the SESSION END draft in the web app
are the other half). The reference is `docs/backend.md` §3.3 and the house decision is rules-flow §11.183; this note keeps
the findings that shaped it. Run the Postgres test with `DATABASE_URL=… bun test apps/api/test/journal.test.ts` (it skips
itself without a reachable database, so `test:smoke` is unaffected).

## What changed since the spike

- Migration `0035_action_journal` holds the two tables. The trigger and functions are still installed at every start.
- Tables are found in the database (`information_schema`), not in Drizzle's schema object, so `test_call` is journaled.
  `admin_event` and `codex_image` are left out on purpose (`UNJOURNALED`, with the why).
- The ack carries the entry id (`ActionResult.entry`), from `journaled()`, which now returns `{ result, entry }`.
- The admin-key socket (`seed.ts`) runs unjournaled; a Clerk admin's actions are journaled.
- A refusal names the blocker: ``Undo “<label>” first.`` The SQL raises `journal_conflict:<table>:<row id>` and the action
  looks up the earliest standing entry after the target that changed the same column of that row (any change to the row if none did). The undo runs in a savepoint so that lookup
  can query after the conflict.
- Undoing a create that later rows hang off (an Agent in a fight) is **refused**, naming the entry that added them: at the end of `journal_undo`, a row
  the undo's own entry changed but the target did not is a conflict.
- Labels (`journalLabel`, `packages/shared/src/journal.ts`) and names (live rows plus the journal's row images) feed the GM-only
  `journal` socket event (the history list) and `GET .../sessions/:sessionId/recap-draft`. The recap now names the Threats, who was removed
  and which item went to whom. It says "removed", not "slain": the action doesn't say which.
- Measured latency, below.

## What it proves

**1. Before-rows can be captured cheaply inside the action's transaction.**
`journaled()` (`apps/api/src/journal/journal.service.ts`) opens a `journal_entry`, sets the transaction-local
`wg.journal_entry`, runs the action, and drops the entry if nothing changed. It is wired in one line of the gateway
(`table.gateway.ts:172`); `applyAction` and every handler are untouched. A generic row trigger writes the images, so no handler needs to know about the journal. The trigger goes on every
table in the Drizzle schema except an explicit list (auth tables, the library, the journal itself), installed at every
api start by `installJournal()` (`journal.service.ts`), so a new feature table (say #169's `spend_request`) is journaled
by default; a table without a uuid `id` fails the start instead of breaking undo later. Cost: the API's own writes see one extra insert per changed row. An UPDATE stores only
the changed keys (`journal.sql`), so a Wound tap is ~two small values, not a character's sheet jsonb. Test: "undo a
combatant.adjust" asserts the stored `before` is `["wounds"]` (`journal.test.ts`).

**2. What undo means when a later action touched the same row: refuse, per column.**
Not "in order only". `journal_undo` (`journal.sql`) checks each change against the current row before restoring it:
INSERT must still equal what was inserted, UPDATE keys must still hold what the entry wrote, DELETE must not have had its
id retaken. Consequences, all tested: the latest action always undoes (`journal.test.ts`); an older action whose
column was changed later is refused with "A later change touched that combatant. Undo that first." and nothing is half
undone; an older independent action (a hit on A under a later hit on B) undoes. The refusal text comes
from `journal.actions.ts`.

**3. A session's journal weighs little.** See "Weight" below.

**Also shown.** Undo is itself journaled, so undoing an undo is a redo (marks in `journal.actions.ts`, kept right through undoing a redo). A
removed combatant that was current (the FK nulls `encounter.current_id` after the delete is journaled) undoes whole,
pointer included. Another
campaign's entry is unreachable. `draftRecap` (`packages/shared/src/journal.ts`, tested in `journal.test.ts`
beside it) drafts "Fight 1, 2 Rounds: ork-boy x6, Big Nob. / 20 XP awarded." from the actions alone.

## Findings that changed the design

- **Cascade order is not what the brief assumed.** Postgres journals a cascade's parent delete *before* its children's
  whatever the trigger is called (measured: `D:character D:combatant U:encounter`; also with a trigger named `AA_j` on a
  scratch table). RI triggers fire after every ordinary row trigger. Reverse-seq restore therefore reinserted the child
  first and hit the foreign key. Fix: `journal_undo` retries a step that raises `foreign_key_violation` after the others,
  and calls a pass with no progress a conflict (`journal.sql`). The `zz_` name is kept only to sort last.
- **Check and restore are interleaved, not "all checks first".** One action can change a row twice (insert then update);
  checking everything against the pre-undo state would false-conflict. A conflict raises, which aborts the transaction, so
  the outcome is the same: nothing half-undone.
- Circular FK `encounter.current_id` <-> `combatant`: the set-null update on the encounter is journaled and restored
  after the combatant returns, via the same retry.
- jsonb round trip (timestamps as ISO strings, `text[]`, jsonb columns, nulls) was clean through
  `jsonb_populate_record`; the tested rows cover booleans, ints, arrays, timestamps and jsonb. Not covered: `numeric`/
  `bytea` columns (none in the live tables today).

## Weight

One run of the test (273 actions: 2 characters, 3 fights of 2 Agents and 4 Threats over 4 Rounds with hits, Turns and
Prone toggles, pool taps, 5 codex saves, session start/end) produced 258 entries (15 no-ops left no entry) and 417 row
changes. Row bytes (`pg_column_size`, no indexes): **126,359 B, ~490 B per entry**. Relation sizes including indexes
and page slack, over the whole test file's eight campaigns: entry 196,608 B + change 532,480 B. So a session is on the
order of 100-250 KB with indexes; a whole campaign of 30 sessions is single-digit MB. Per-action latency, same session, journaled vs
the triggers dropped and unjournaled, against a local Postgres 16 (three runs): ~10-12 ms vs ~8.5-9 ms, i.e. **+2 to +4 ms
per action** (entry insert, row triggers and the no-op delete included).

## What it leaves out

- No retention, by decision: entries live until the campaign is deleted.
- Not journaled by design: auth tables (tokens, invites, members), `library_character`, `admin_event`, `codex_image`, REST
  paths (invite accept, campaign import, image upload), scripts. Those actions answer "nothing to undo".
- Seats and guest QRs: access rows aren't journaled but hang off a character by FK. So undo refuses a `character.delete`
  (its tokens already cascaded away) and a `character.create` once a token, invite or seat points at it (`journal.actions.ts`).
- The names lookup scans the campaign's whole journal for row images on each request (`journalNames`, a `ponytail:`).
  Fine at single-digit MB; add a window if a campaign ever outgrows it.
- Not built here: the web half (the tracker's UNDO on `journal.undo`, the history list, the recap draft in the SESSION END
  form), and a "slain" line in the recap, which needs a rule for what slain means in the journal.

## Decided (Tony, 2026-10-06)

- A session end can't be undone (`journal.actions.ts`, tested). Every other journaled action can.
- Undo is GM only: `journal.undo` stays out of `PLAYER_ACTIONS`.
- Entries are kept for the life of the campaign; no pruning.
- Refusals name the blocker, and a create with later rows hanging off it is refused (the open questions of the spike, answered
  by the build; rules-flow §11.183).
