// InconsisTable's rules engine, loaded from a checkout beside this repo (or INCONSISTABLE=<path>). It is another
// repo's code, so it is loaded by path at run time and typed here only as far as the port uses it.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ResolvedBuild } from "@wg/shared";

export type Problem = { path: string; message: string };
type Expr = { source: string };
type Scope = Record<string, unknown>;
export interface Compiled {
  ruleset: { health: { states: { id: string; label?: string }[] } };
  resources: Record<string, unknown>;
  tests: Record<string, { pool: Expr | null; target: Expr }>;
}
export interface Schema {
  parse(x: unknown): unknown;
  safeParse(
    x: unknown,
  ):
    | { success: true; data: unknown }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}
/** The port's ledger builder answers in this repo's shapes, but its sheet carries no book text. */
export type PortResolvedBuild = Omit<ResolvedBuild, "sheet"> & { sheet: Record<string, unknown> };
export type PackResult = { ok: true; warnings: Problem[] } | { ok: false; problems: Problem[]; warnings: Problem[] };
export interface Engine {
  validatePack(a: { input: unknown; ruleset: Compiled["ruleset"] }): PackResult;
  compileRuleset(input: unknown): { ok: true; compiled: Compiled } | { ok: false; problems: Problem[] };
  deriveValues(a: {
    compiled: Compiled;
    entity: string;
    values: { fields: Scope; resources?: Scope; campaign?: Scope };
  }): Record<string, number>;
  campaignValues(a: { compiled: Compiled; stored: Record<string, unknown> }): Scope;
  actorScope(a: {
    fields: Scope;
    derived?: Scope;
    resources?: Scope;
    party?: { characters: number };
    campaign?: Scope;
    ctx?: Scope;
  }): Scope;
  resourceBounds(a: { compiled: Compiled; resource: string; scope: Scope }): { min: number; max: number | null };
  evaluateInt(a: { expr: Expr; scope: Scope }): number;
  healthStatesOf(a: { compiled: Compiled; entity: string; scope: Scope }): string[];
  runOp(a: {
    primitive: string;
    op: string;
    params: unknown;
    state: unknown;
    input: unknown;
  }):
    | { ok: true; deltas: { target: Record<string, unknown>; kind: string; value: unknown }[] }
    | { ok: false; refusal: { code: string; detail?: string } };
  sideUp(a: { params: unknown; state: unknown }): string | null;
  runCreation(a: {
    ruleset: Compiled["ruleset"];
    actor: string;
    answers: Record<string, unknown>;
    lookup: (a: { type: string; key: string }) => undefined;
  }): { ok: true; fields: Record<string, unknown> } | { ok: false; problems: Problem[] };
  // The ledger builder (InconsisTable's ADR 0011): absent from a checkout made before it.
  BuildParams?: Schema;
  buildSchemas?(params: unknown): Record<string, Schema>;
  resolveBuild?(a: {
    params: unknown;
    catalogue: { creation: unknown; wargear: ReadonlyMap<string, unknown>; homebrew: boolean };
    build: unknown;
    play?: { tier: number; xpEarned: number; packageWaived?: boolean };
  }): PortResolvedBuild;
}

const root = resolve(process.env.INCONSISTABLE ?? new URL("../../../../InconsisTable", import.meta.url).pathname);
const entry = resolve(root, "packages/rules-engine/src/index.ts");
/** Null when InconsisTable is not checked out here (CI of this repo): the port's checks are skipped. */
export const loadEngine = async (): Promise<Engine | null> =>
  existsSync(entry) ? ((await import(entry)) as Engine) : null;

// A checkout made before the ledger builder's `build` block and pack `record`s strips both unread (its schemas are not
// strict), so whether they are checked is asked by sending a broken one: refused only where it is validated.

/** True when `compileRuleset` checks a ruleset's `build` block. */
export const checksBuild = (engine: Engine, ruleset: Record<string, unknown>) =>
  !engine.compileRuleset({ ...ruleset, build: { strategy: "none" } }).ok &&
  engine.compileRuleset({ ...ruleset, build: undefined }).ok;

/**
 * True when `compileRuleset` checks the build block's play keys (`ascension`, `gone`, `award`): each one is optional,
 * so an older validator ignores them and accepts the ledger ruleset, and only a validator that reads them refuses a
 * broken one. `ruleset` is the ledger ruleset, which has them.
 */
export function checksPlay(engine: Engine, ruleset: Record<string, unknown>) {
  const broken = [
    { ascension: { xp: 0, cite: "Core p.1" } },
    { gone: ["nobody"] },
    { award: { max: 0, suggested: [], cite: "Core p.1" } },
  ];
  return (
    engine.compileRuleset(ruleset).ok &&
    broken.every((b) => !engine.compileRuleset({ ...ruleset, build: { ...(ruleset.build as object), ...b } }).ok)
  );
}

/** True when `validatePack` checks an entry's `record` (`pack` holds one valid entry, which gets a broken record). */
export function checksRecord(engine: Engine, ruleset: Compiled["ruleset"], pack: { entries: object[] }) {
  const entry = pack.entries[0];
  const one = (e: unknown) => engine.validatePack({ input: { ...pack, entries: [e] }, ruleset }).ok;
  return entry !== undefined && one(entry) && !one({ ...entry, record: 1 });
}
