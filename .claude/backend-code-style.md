# Backend (NestJS · Drizzle · Bun) Code Style Guidelines

> Sibling to [frontend-code-style.md](./frontend-code-style.md). The philosophy is the same on both sides: strong typing,
> one source of truth, explicit structure, testability. Stack: **NestJS 12** on **Bun** (run from source, no build step),
> **Drizzle ORM** on **PostgreSQL 17**, **Socket.IO**, **zod 4** schemas from `@wg/shared`, and **`bun test`**.
> Architecture and game-flow rules are in the root `CLAUDE.md`.

## General Principles

- **Types:** never use `any`. Use a concrete type, `unknown` plus a zod parse, or a generic. TypeScript strict mode and
  `noUncheckedIndexedAccess` are on; a `!` needs a reason (e.g. "the row was just inserted").
- **Safe access:** guard `null`/`undefined` before use. Optional chaining is required on data from outside the process
  (DB rows, socket payloads, JSON files). Payloads are validated by zod first, so after parsing you can trust their shape.
- **Imports:** group them as node built-ins (`node:*`), then third-party, then workspace (`@wg/*`), then relative, each
  group alphabetised. Relative imports use the `.ts` extension.
- **Naming:**
  - `camelCase` for functions and variables, `PascalCase` for classes, types and zod schemas.
  - `UPPER_SNAKE_CASE` for module-level constants.
  - kebab-case, feature-prefixed file names (`encounter.actions.ts`, `campaign.controller.ts`).
- **Errors:** client-facing failures throw `ActionError` (socket actions) or a Nest `HttpException` (REST). Unexpected
  errors are logged and returned as a generic message, never as stack traces.
- **Formatting:** 2-space indentation and double quotes, with Prettier as the formatter. Match the surrounding code.

## Development Best Practices

### Closed value sets: define once

**Never re-declare a literal-string union inline.** Every closed set (side, marker, threat class, beat type, role,
combatant kind…) is defined **once** as a `z.enum` in `packages/shared`, and its type comes from that schema via
`z.infer`. DB columns reference it with `.$type<T>()`. Call sites may use the literal (`side === "agents"`), because the
type checks it.

```ts
// ❌ Avoid: a second, drifting copy of the set
kind: text().$type<"pc" | "threat">().notNull(),

// ✅ Prefer: one definition in packages/shared, referenced everywhere
export const CombatantKind = z.enum(["pc", "threat"]);
export type CombatantKind = z.infer<typeof CombatantKind>;
kind: text().$type<CombatantKind>().notNull(),
```

*Why:* adding a value is one edit. A schema, a DB column and a UI switch can't drift apart, and TypeScript flags every
place that doesn't handle the new value.

### Function parameters

A function with **more than two parameters**, or two adjacent parameters of the same type, takes **one options
object**. A DB handle (`tx`) may stay as the first positional parameter, since every data function takes one.

```ts
// ❌ Avoid: positional soup; tier and count are easy to swap
addThreat(tx, encounterId, tier, threat, opts);

// ✅ Prefer
addThreat(tx, { encounterId, tier, threat, label, mobCount, marker });
```

### No barrel files inside apps

Import from the module that defines a symbol. The one exception is a workspace package's public entry
(`packages/shared/src/index.ts`, `packages/data/index.ts`), which is that package's API.

### Feature-based structure (strictly enforced)

Group code by **feature**, never by layer. A global `schema.ts`, `services/` or `controllers/` is not allowed.

```text
apps/api/src/
  main.ts                    # bootstrap only
  app.module.ts              # wiring only
  core/                      # app-wide, not feature-specific
    db.ts                    # drizzle client, Tx type, migrations
    errors.ts                # ActionError, fail()
    sql.ts                   # shared SQL helpers (clamped counters)
  auth/                      # tokens, cookie, access_token table
    auth.schema.ts
    auth.service.ts
  campaign/                  # campaign + session: REST setup, pools, session start/end
    campaign.controller.ts
    campaign.service.ts
    campaign.actions.ts
    campaign.schema.ts
  character/
  encounter/                 # encounters, turns, combatants
  codex/                     # factions, adventures/beats, locations, NPCs, handouts
  table/                     # the socket: gateway, action dispatch, snapshot loaders
```

Each feature owns its Drizzle tables (`<feature>.schema.ts`). `drizzle.config.ts` globs `src/**/*.schema.ts`.

### Keep transports thin

Controllers and the gateway parse input, resolve the caller (`Ctx`) and call a function. Game logic lives in
`<feature>.actions.ts` or `<feature>.service.ts`. Those files import no Nest symbols, so they're testable on their own and
reusable from scripts.

### One mutation path

Every game change is an `Action` (zod union in `packages/shared/src/actions.ts`) handled in this order:

1. **Validate** with `Action.safeParse`.
2. **Authorise** with `authorize(ctx, action)`: role, ownership, GM-only fields.
3. **Apply** inside `db.transaction`.
4. **Rebroadcast** the snapshots that `touches(action)` reports.

**Adding an action** touches four places:
1. its schema in `packages/shared/src/actions.ts`
2. its handler in the owning feature's `*.actions.ts`
3. `touches()`, if it changes the codex
4. `PLAYER_ACTIONS` / `authorize()`, if players may send it

### Scope every query

Every read and write filters by the caller's `ctx.campaignId`, directly or through a parent row that has been checked.
**Never trust an ID from the client.** Look the row up scoped to the campaign and fail if it's missing.

### Atomic writes and concurrency

- One action = one transaction. Never write outside `tx` in an action handler.
- Counters change by **delta** in SQL (`greatest(0, col + d)`, capped where the rules cap them). Never read-modify-write
  in application code.
- Actions for one campaign are serialised by the gateway queue. A check-then-act inside a handler is safe only because of
  that queue; anything reached another way (REST, scripts) needs a DB constraint or a conditional `UPDATE … WHERE`.

### Rules come from the books

Game-rule code cites its printed page (`// p.177`, `TA p.8`). An ambiguity gets a house decision in `docs/rules-flow.md`
§11, not a silent choice in code. Pure rules functions go in `packages/shared`, where the web and the api share them and
they're unit tested.

### Never leak hidden data

Anything sent to players goes through `toPlayerView` / `toPlayerCodex`, which drop unrevealed stats, GM notes and
secrets. A new field is hidden until you decide otherwise. Book content (threat stat blocks) is only served to an
authenticated GM (`/api/threats`) or through the redacted snapshot.

### Async/await

Use `async`/`await`, not `.then()` chains. Don't write `return await x`; use `const result = await x; return result;`
(clearer stack traces). Run independent queries concurrently with `Promise.all` (see `loadCodex`). Run sequential
awaits in a loop only when order matters, as with writes in one transaction.

## Data Handling

- **Time:** `timestamp({ withTimezone: true })` columns. Create them with `new Date()` or `now()` and serialise them as ISO
  strings; store everything in UTC.
- **Parsing external data:** JSON files, pack files and `jsonb` columns go through their zod schema (`Threat.parse`,
  `CharacterStats.parse`), never raw property access on `JSON.parse` output.
- **Migrations:** edit the feature schema, then `bun run db:generate`. Until real campaign data exists, the migration may
  be regenerated from scratch (see CLAUDE.md). After that, add migrations and never rewrite them.

## Testing

- **Unit:** pure functions in `packages/shared` and `apps/web/lib`, tested with `bun test` (`node:test` + `node:assert`).
- **End-to-end:** `apps/api/test/smoke.test.ts` drives a real GM and player over Socket.IO against a running api and
  Postgres. Every new action or rule gets an assertion there, including its refusal cases.
- **Data:** `bun run validate` must pass: every threat, pack reference and prepared-encounter threat must resolve.
- Test values come from the same constants the code uses (e.g. `poolMax`), not copied numbers.

## Linting & Formatting

- Type check with `bun run typecheck` (shared, api, web); it must pass before a commit.
- Prettier formats the code. Don't hand-align.
