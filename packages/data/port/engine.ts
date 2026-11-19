// InconsisTable's rules engine, loaded from a checkout beside this repo (or INCONSISTABLE=<path>). It is another
// repo's code, so it is loaded by path at run time and typed here only as far as the port uses it.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export type Problem = { path: string; message: string };
type Expr = { source: string };
type Scope = Record<string, unknown>;
export interface Compiled {
  ruleset: { health: { states: { id: string; label?: string }[] } };
  resources: Record<string, unknown>;
  tests: Record<string, { pool: Expr | null; target: Expr }>;
}
export type PackResult = { ok: true; warnings: Problem[] } | { ok: false; problems: Problem[]; warnings: Problem[] };
export interface Engine {
  validatePack(a: { input: unknown; ruleset: Compiled["ruleset"] }): PackResult;
  compileRuleset(input: unknown): { ok: true; compiled: Compiled } | { ok: false; problems: Problem[] };
  deriveValues(a: {
    compiled: Compiled;
    entity: string;
    values: { fields: Scope; resources?: Scope };
  }): Record<string, number>;
  actorScope(a: {
    fields: Scope;
    derived?: Scope;
    resources?: Scope;
    party?: { characters: number };
    ctx?: Scope;
  }): Scope;
  resourceBounds(a: { compiled: Compiled; resource: string; scope: Scope }): { min: number; max: number | null };
  evaluateInt(a: { expr: Expr; scope: Scope }): number;
  healthStatesOf(a: { compiled: Compiled; entity: string; scope: Scope }): string[];
}

const root = resolve(process.env.INCONSISTABLE ?? new URL("../../../../InconsisTable", import.meta.url).pathname);
const entry = resolve(root, "packages/rules-engine/src/index.ts");
/** Null when InconsisTable is not checked out here (CI of this repo): the port's checks are skipped. */
export const loadEngine = async (): Promise<Engine | null> =>
  existsSync(entry) ? ((await import(entry)) as Engine) : null;
