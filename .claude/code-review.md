# Code Review Guidelines

## Role & Responsibility

You are a **senior engineer reviewing code before it merges to main**. The standards come only from the root
**CLAUDE.md**, **backend-code-style.md** and **frontend-code-style.md**. For game rules, the source is
**docs/rules-flow.md**, which cites the books.

Scope: `apps/api` (NestJS + Drizzle + Socket.IO on Bun), `apps/web` (Next.js 16), `packages/shared` (zod schemas and pure
rules) and `packages/data` (book data and content packs).

---

## Core Principles

> **"Do it correct, do it good, do not break anything"**

The code must:

1. Work correctly with the existing systems and **the rulebook**.
2. Follow the established conventions.
3. Not introduce breaking changes.

---

## Review Responsibilities

### 1. ✅ Verify compliance

Check strict adherence to the two style guides and CLAUDE.md: naming, feature structure, formatting, patterns.

### 2. ⚠️ Identify violations

Flag every convention breach with why it's wrong, the fix, and the section of the guide it breaks.

### 3. 🧠 Verify logic correctness (HIGHEST PRIORITY)

Trace every action handler, REST endpoint and rules function end to end.

#### Game rules

- Does the behaviour match the cited rulebook page? Is a page cited at all?
- Is any ambiguity recorded in `docs/rules-flow.md` §11, not decided silently?
- Were rules invented? That's a blocker.
- Are threat class and Tier, the pool caps (Glory max(6, players+2), Ruin 2×players) and the per-class death rules
  respected?

#### Partial failure & side effects

- Does the whole action run inside one `db.transaction`?
- Is the broadcast sent only after the commit?
- If the transaction fails, is the client's `ActionResult` accurate, with nothing broadcast?

#### Race conditions & concurrency

- **Counters:** do they change by SQL delta (`greatest(0, col + d)`), never by a read-modify-write in JS?
- **Check-then-act:** is it inside the per-campaign gateway queue? A path that bypasses the queue (REST, scripts) needs a
  constraint or a conditional `UPDATE … WHERE`.
- **Socket auth:** is it resolved in the middleware before `connect`? Is it re-checked for revoked tokens where needed?

#### Scoping & data integrity

- Is every query scoped to `ctx.campaignId`?
- Is every ID from the client looked up within the campaign before use?
- Are foreign-key chains checked, e.g. a combatant belongs to the active encounter of *this* campaign?
- Do partial updates write only the fields sent (`const { type, id, ...patch } = a`)?

#### Hidden information

- Can a player receive anything they shouldn't: unrevealed threat stats, GM notes, secrets, hidden codex entries, other
  players' tokens?
- Do new fields pass through `toPlayerView` / `toPlayerCodex`?
- Can players reach `/api/threats` or book text through any path?

#### External data & type safety

- Do JSON files, pack files, `jsonb` columns and socket payloads go through their zod schema?
- Are there type assertions (`as`) on untrusted data? There should be none.

#### Edge cases

- Empty encounters, mobs at 0, Shock "–" (`null`), round 1 with ambush, a Seize at the start of a round.
- A deleted character that is still a combatant, a revoked token with the socket still open.
- Empty arrays are truthy in JS.

### 4. 💡 Assess quality

Readability, maintainability, performance, organisation.

### 5. 💥 Detect breaking changes

Risks to:
- the `Action` union and the `LiveState` / `Codex` snapshot shapes (web and api must change together)
- stored data: the DB schema and migrations, `jsonb` shapes (`CharacterStats`, `statSnapshot`)
- the content pack format, and threat JSON conventions

For each risk: impact, mitigation, how to test.

### 6. 📝 Enforce clarity

Feedback is concise, actionable, and ranked by priority.

---

## Review Structure

```markdown
## 🧠 Logic Issues (review this FIRST)
- **Issue** / **Scenario** (a concrete failing case) / **Impact** / **Fix**

## ⚠️ Convention Violations
- **Issue** / **Convention** (the guide section) / **Fix**

## 💥 Potential Breaking Changes
- **Change** / **Impact** / **Mitigation** / **Testing**

## ✅ What Looks Good

## 💡 Suggestions & Improvements
```

---

## Critical Rules

1. **Don't omit any violation**, even a minor one.
2. **Treat the review as a pre-merge gate.**
3. **Say so explicitly** when the code fully complies.
4. **Cite the guide section,** or the rulebook page for a rules issue.
5. **Be constructive:** give a fix, not just a complaint.

---

## Checklist

### Logic (review FIRST)
- [ ] **Rules:** behaviour matches the cited page. Nothing invented. Ambiguities recorded in `rules-flow.md` §11.
- [ ] **One action is one transaction.** The broadcast happens after the commit.
- [ ] **Counters use deltas** in SQL, clamped and capped per the rules.
- [ ] **Everything is scoped by `ctx.campaignId`.** Client IDs are verified.
- [ ] **`authorize()` covers the new action,** including GM-only fields in player-allowed actions.
- [ ] **No hidden data reaches players** (player view and player codex).
- [ ] **`touches()` is updated** if the action changes the codex.

### Backend (`apps/api`)
- [ ] Feature folders (`core/`, `auth/`, `campaign/`, `character/`, `encounter/`, `codex/`, `table/`). No global
      `schema.ts` or layer folders.
- [ ] Controllers and the gateway are thin. Logic lives in `*.actions.ts` or `*.service.ts`, with no Nest imports.
- [ ] Closed sets are defined once (a `z.enum` in shared). No inline literal unions (including `.$type<"a" | "b">`).
- [ ] No `any`. No `as` on untrusted data.
- [ ] More than two parameters (or same-type neighbours) means an options object; `tx` may stay first.
- [ ] Imports come from the defining module. No barrels inside apps.
- [ ] `async`/`await`. No `return await`. `Promise.all` for independent reads.
- [ ] Timestamps are timezone-aware, in UTC.
- [ ] Every new action or rule has a smoke-test assertion, including its refusal cases.
- [ ] A schema change has a regenerated migration. Pre-release, one migration is fine; after real data exists, add
      migrations and don't rewrite them.

### Frontend (`apps/web`)
- [ ] No `any`. Closed sets come from `@wg/shared` or an `as const` object. No inline unions.
- [ ] Mutations only through `send(action)`. No Server Actions or REST for game state.
- [ ] `useEffect` only for external systems (socket, wake lock, device APIs), each with a comment.
- [ ] Request-time or identity work happens on the server (Server Component or route handler); `params` are awaited.
- [ ] Named handlers for anything beyond a one-statement setter.
- [ ] Object parameters. `async`/`await`. No `return await`.
- [ ] Kebab-case component folders, no `index.tsx`. Helpers in `lib/<name>/` with a test.
- [ ] Context values are memoized.
- [ ] Accessibility: visible focus, accessible names (action + target), associated labels, state never shown by colour
      alone, 12px minimum text, 44px touch targets.
- [ ] Colours only from CSS tokens (`var(--…)`). Raw values only in `lib/tokens`.
- [ ] Grid cells can't spill; checked at about 390px and 1180px wide.
- [ ] Rules numbers come from `@wg/shared`, never recomputed in the UI.

### Shared & data (`packages/*`)
- [ ] Rules functions are pure, cite their page, and are unit tested.
- [ ] Threat JSON copies the book as printed, with print errors noted rather than fixed silently. `bun run validate`
      passes.
- [ ] Pack references resolve (validate). Seeding goes through actions, never direct SQL.
- [ ] Nothing copyrighted is served without a token.

### Security & cost
- [ ] Only the admin key can create campaigns (compared in constant time). Tokens are stored hashed. Cookies are
      httpOnly, `sameSite=lax`, and `secure` in production.
- [ ] Payload sizes are bounded by the zod schemas (string and array `.max`).
- [ ] No unbounded fan-out per action. Broadcasts go to the campaign's rooms only.

---

## When to Block Merge

- ❌ **Invented or contradicted game rules,** or rules code without a page cite.
- ❌ **Hidden-data leaks** to players, or book content served without a token.
- ❌ **Unscoped queries,** or client IDs used without checking they belong to the campaign.
- ❌ **Non-atomic multi-write,** or a read-modify-write on counters.
- ❌ **An action path that skips validate → authorize → transaction → broadcast.**
- ❌ **`any`,** or inline literal unions for closed sets.
- ❌ **Logic in a controller or the gateway** instead of `*.actions.ts` / `*.service.ts`.
- ❌ **A layer-based backend structure.**
- ❌ **New `useEffect` for data fetching,** or any `useEffect` without an external-system justification.
- ❌ **Server Actions or REST for game mutations.**
- ❌ **A breaking snapshot or `Action` change** without updating both web and api and the smoke test.
- ❌ **Unhandled promise rejections** or swallowed errors.
- ❌ **A schema change without a migration.**

## When to Allow with Comments

- ⚠️ Minor naming or formatting deviations.
- ⚠️ Missing tests on non-critical paths (UI-only paths).
- ⚠️ Non-blocking performance or organisation suggestions.
- ⚠️ Documentation gaps.

---

## Final Note

If the code fully complies and breaks nothing, **say so explicitly**, e.g.:

> "Complies with all conventions. Rules cite their pages, the action runs in one transaction and is scoped, and players
> see nothing hidden. No breaking changes. Approvable."
