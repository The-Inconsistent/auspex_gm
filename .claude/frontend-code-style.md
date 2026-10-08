# Frontend (Next.js · React) Code Style Guidelines

> Sibling to [backend-code-style.md](./backend-code-style.md). Stack: **Next.js 16** (App Router), **React 19**,
> **socket.io-client**, plain CSS design tokens (the "Imperial Manuscript" look, vellum and vigil themes) in `apps/web/app/globals.css`, and **zod**
> schemas from `@wg/shared`. Architecture is in the root `CLAUDE.md`.

## General Principles

- **TypeScript:** strict typing; **never use `any`**. Use specific types, `unknown` plus a zod parse, or generics.
- **Optional chaining:** use `?.` on anything that can be missing (lookups, socket state before it arrives, `Map.get`).
  Don't paper over a type that the compiler says is defined.
- **Imports:** external, then workspace (`@wg/*`), then app (`@/…`), then relative, alphabetised within each group.
- **Components:** function components with explicitly typed props.
- **Naming:** `camelCase` for variables and functions, `PascalCase` for components and types, kebab-case for files and
  folders.
- **Error handling:** `try`/`catch` around async work that can fail. Surface the failure in the UI (the tracker's error
  line, the player banner); never swallow it.
- **State:** React hooks; avoid prop drilling (see Context below).
- **Formatting:** Prettier, 2-space indentation.

## Development Best Practices

### Closed value sets: define once

**Never re-declare a literal-string union inline** (`useState<"wounds" | "heal">`, `side: "agents" | "threats"`).
- A set that belongs to the domain (side, marker, condition, beat type…) comes from `@wg/shared`: use its `z.enum` type
  or `.options`.
- A UI-only set is an `as const` object in the feature's `constants.ts`, with a type derived from it (`keyof typeof`,
  or `(typeof X)[number]`).

(TypeScript `enum` is unavailable, because `erasableSyntaxOnly` is on.)

```ts
// ❌ Avoid
const [amountFor, setAmountFor] = useState<"wounds" | "heal" | "shock" | "recover" | null>(null);

// ✅ Prefer: tracker/constants.ts
export const COUNTER_ACTIONS = {
  wounds: { field: "wounds", sign: 1 },
  heal: { field: "wounds", sign: -1 },
} as const;
export type CounterAction = keyof typeof COUNTER_ACTIONS;
```

### Function parameters

A function with **more than two parameters**, or two adjacent parameters of the same type, takes **one options
object**, e.g. `blocks({ value, max })`, not `blocks(value, max)`.

### Async/await

Always use `async`/`await`, never `.then().catch()` chains. Don't write `return await x`; use
`const result = await x; return result;`.

### Component files and structure

- **No `index.tsx` barrels.** Import a component by its file name.
- **Each component gets a kebab-case folder.** Its children, hooks, types, utils and constants go inside, used only by
  it:

```text
components/gm/tracker/
  tracker.tsx                     # main component
  constants.ts                    # constants used by tracker + tests
  components/
    add-combatants/add-combatants.tsx
```

- **Shared building blocks** live in `components/ui/<name>/<name>.tsx`.
- **Shared hooks** live in `hooks/<use-name>/<use-name>.ts`.
- **Pure helpers** live in `lib/<name>/<name>.ts`, each with a sibling `<name>.test.ts`.

### Extract constants for testing

Defaults, option lists and magic numbers used in logic go in a `constants.ts` beside the feature, so tests import the same
values.

## React & Next.js Patterns

### Named event handlers

**Any handler with more than one statement, or with logic beyond a simple setter call, is a named function defined
above `return`,** with a one-line comment saying what it does. One-line calls may stay inline
(`onClick={() => setOpen(false)}`).

```tsx
// ❌ Avoid: logic buried in JSX
<select onChange={(e) => { const k = e.target.value; const next = …; void run(…); }} />

// ✅ Prefer
// Condition picker: toggles the chosen Condition on the selected combatant.
const handleConditionPick = (e: ChangeEvent<HTMLSelectElement>) => { … };
<select onChange={handleConditionPick} />
```

### Mutations go through socket actions

Every game change is `send(action)` from `useTable()`. That is the server's single validated, serialised mutation path
(see CLAUDE.md). **Don't use Server Actions or REST routes for game state.** REST is only for login (`/join`, `/me`),
the GM bestiary, the character library (no table), and the admin page's housekeeping (`lib/admin`: an admin outside any
table; the api runs it through the socket's own path, `TableGateway.run`).

- Build actions with the `ActionInput` type from `@wg/shared`.
- Counters send **deltas**, never absolute values.
- Check `result.ok`, and show `result.error` when it's false.

### `useEffect` only for external systems

`useEffect` is allowed **only** to keep in sync with something outside React: the socket connection, the Screen Wake
Lock, and device APIs such as `navigator.vibrate` on a state change. Each use carries a comment saying which external
system it syncs with.

**Don't use it to fetch data:**
- Do the fetch on the server (a Server Component or route handler).
- Or have the socket send the data.

### Server first for request-time work

The guest cookie is httpOnly and Clerk's token is fetched server-side (`sessionToken()` from `@wg/auth/next`), so anything that depends on
who the caller is (the `/api/campaigns/:id/me` check, the `/join/<token>` exchange) runs on the server, through
`app/server-api.ts`: a Server Component or a route handler. Client components receive the result as props.
Route `params` are Promises in Next 16; `await` them.

### Context providers for shared state

When state or handlers are needed by three or more components at different depths, provide them with a Context and a
`useX()` hook that throws outside its provider. Always **memoize the value**
(`useMemo(() => ({ … }), [deps])`); state setters are stable and don't need to be dependencies.

### Rendering lists

The tracker and codex lists are small (tens of rows), so no virtualisation is needed. If a list can pass about 100 items
(a bestiary browser, a long history log), virtualise it.
- **Build lookup `Map`s once** (`useMemo`), not `find` inside `map`.
- **Don't pass inline closures to memoized children.**

### Loading and connection states

- **Before the first snapshot:** render a full-screen status line ("SYNCING…").
- **While disconnected:** keep the last state on screen and show the "NO SIGNAL" badge as the first row of the header
  band (`.badge-offline`, in flow so it never covers the header's buttons). Never blank the screen on reconnect.

## UI & Accessibility

- **Focus is always visible.** Never remove an outline without a visible replacement (the border colour changes to
  `--red`, or a `:focus-within` ring on a wrapper).
- **Every control has an accessible name.** Icon-only buttons get an `aria-label` naming the action *and* its target
  (`Decrease WOUNDS`). Selects and inputs without a visible label get an `aria-label`.
- **Labels are associated** (`<label htmlFor>`, or the input nested inside its `<label>`). A group of toggle chips gets
  `role="group"` and an `aria-label`.
- **State is never shown by colour alone.**
  - The selected tab gets weight as well as colour (`aria-selected`).
  - A combatant's state is a word (ACTING, DONE, AMBUSHED).
  - A marker colour square has an `aria-label` and the label text.
- **Colour comes from the tokens.** No hex in TSX. Components use `var(--…)` from `globals.css`. Values that must be raw
  (the QR code canvas) come from `lib/tokens/tokens.ts`, which mirrors the CSS variables.
- **Smallest text is 12px.** Nothing smaller.
- **Touch targets are at least 44px,** except dense secondary buttons (`.btn.sm`, 32px), and never below that.
- **Phone first for players, tablet first for the GM.** Test both at about 390px and 1180px wide. Grid cells get
  `min-width: 0` so content never spills into a neighbouring column.

## Data Handling

- **Parse untrusted JSON with zod** (`CharacterStats.parse(JSON.parse(text))` inside a `try`), and show the error.
- **Time:** display dates with the platform `Intl` APIs. Timestamps from the server are UTC ISO strings.
- **Rules numbers never come from the UI.** Derived traits, pool caps and death states come from `@wg/shared`
  (`deriveStats`, `poolMax`, `pcStatus`, `threatStatus`), so the tablet and the phones always agree with the server.
