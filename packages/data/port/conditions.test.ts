import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONDITIONS,
  corruptionGain,
  ENDURING_LIFE,
  TIMED_CONDITIONS,
  TURN_END_REMINDERS,
  TURN_START_REMINDERS,
} from "@wg/shared";
import { loadEngine } from "./engine.ts";
import { buildRuleset, idOf } from "./ruleset.ts";

// What a called Test offers, the reminders, the Conditions' timing and stacks, the rests and Enduring Life's notices
// (InconsisTable's house decisions #79 to #81), against this repo's tally, state.ts and character actions. Skipped
// when InconsisTable is not checked out beside this repo.
const engine = await loadEngine();
const skip = engine === null ? "InconsisTable is not checked out beside this repo" : false;
const plain = buildRuleset();
const ledger = buildRuleset({ builder: "ledger" });

const ev = (source: string, scope: Record<string, unknown>) =>
  engine!.evaluate({ node: engine!.parseExpr(source), scope });
type Offer = { id: string; when: string; changes: { pool?: string; resource?: string; by: string }[] };
const offersOf = (test: keyof typeof plain.tests) => (plain.tests[test] as { offers?: Offer[] }).offers ?? [];
// An offer reads the call's inputs and marks as `ctx`, and the taker's resolved report as `result`.
const offerScope = (ctx: Record<string, unknown>, result: Record<string, unknown>) => ({
  ...engine!.actorScope({ fields: {}, ctx }),
  result,
});

test("both rulesets pass InconsisTable's validator with their offers, reminders and Conditions", { skip }, () => {
  for (const r of [plain, ledger]) {
    const result = engine!.compileRuleset(r);
    if (!result.ok) assert.fail(result.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  }
});

test("a failed Corruption Test offers the gain corruptionGain gives, and 1 Ruin with it", { skip }, () => {
  const gain = offersOf("corruption").find((o) => o.id === "corruptionGain")!;
  for (let dn = 1; dn <= 12; dn++)
    for (let icons = 0; icons <= 14; icons++)
      for (const complication of [false, true])
        for (const passed of [false, true]) {
          const scope = offerScope(
            { dn },
            { passed, total: icons, target: dn, flags: { complication, critical: false } },
          );
          const what = `DN ${dn}, ${icons} Icons, ${complication ? "a Complication" : "none"}, ${passed}`;
          assert.equal(ev(gain.when, scope), !passed, what);
          const [corruption, ruin] = gain.changes.map((c) => ev(c.by, scope));
          assert.equal(corruption, corruptionGain({ dn, icons, complication }), what);
          assert.equal(ruin, 1, what);
        }
});

test("a failed Resolve Test the GM marked as Fear offers 1 Ruin, as the tally does", { skip }, () => {
  const fear = offersOf("trait").find((o) => o.id === "fearRuin")!;
  for (const mark of [false, true])
    for (const trait of ["influence", "resolve"])
      for (const passed of [false, true]) {
        const scope = offerScope({ fear: mark, trait }, { passed });
        assert.equal(ev(fear.when, scope), mark && trait === "resolve" && !passed, `${mark} ${trait} ${passed}`);
      }
  assert.deepEqual(fear.changes, [{ pool: "ruin", by: "1" }]);
});

test("the timed Conditions last through the holder's next Turn and the rated ones stack", () => {
  for (const name of CONDITIONS) {
    const c = plain.conditions.find((x) => x.id === idOf(name))! as Record<string, unknown>;
    const timed = (TIMED_CONDITIONS as readonly string[]).includes(name);
    assert.equal(c.duration, timed ? "ownTurnEnd" : "manual", name);
    assert.equal(c.from, timed ? "nextOwnTurn" : undefined, name);
    // The book's examples of a rating: Hindered (2), Bleeding (3) (p.197) and Vulnerable (2) (p.198).
    assert.equal(c.stacking, ["Hindered", "Bleeding", "Vulnerable"].includes(name) ? "stack" : undefined, name);
  }
});

test("a Condition reminds at the Turn's start or end exactly where this repo's tracker does", () => {
  for (const name of CONDITIONS) {
    const c = plain.conditions.find((x) => x.id === idOf(name))! as { at?: string; text?: string };
    const at = name in TURN_START_REMINDERS ? "turnStart" : name in TURN_END_REMINDERS ? "turnEnd" : undefined;
    assert.equal(c.at, at, name);
    if (at) assert.ok(c.text!.startsWith(`${name}:`) && c.text!.length <= 120, name);
  }
});

test("the round-end reminders: a held action is lost, the ambushed act from Round 2", { skip }, () => {
  const lines = (scope: Record<string, unknown>) =>
    plain.reminders
      .filter((r) => ev(r.if, { ...engine!.actorScope({ fields: {} }), ...scope }) === true)
      .map((r) => r.id);
  assert.deepEqual(lines({ round: 1, held: false, barred: false }), []);
  assert.deepEqual(lines({ round: 1, held: true, barred: true }), ["heldLost", "ambushOver"]);
  // Ambush ends after Round 1 only (roundEndReminders reads `e.round === 1`).
  assert.deepEqual(lines({ round: 2, held: false, barred: true }), []);
});

test("a Respite is refused to the Dying and the Dead, and in the ledger ruleset the Lost", () => {
  assert.deepEqual(plain.rests, [{ event: "longRest", refusedIn: ["dying", "dead"], cite: "Core pp.196-197" }]);
  assert.deepEqual(ledger.rests[0]!.refusedIn, ["dying", "dead", "lost"]);
  for (const r of [plain, ledger]) {
    const states = new Set(r.health.states.map((s) => s.id));
    for (const id of r.rests[0]!.refusedIn) assert.ok(states.has(id), id);
  }
});

test("Enduring Life tells one 1d6 Corruption roll per Traumatic Injury taken, and nothing without it", { skip }, () => {
  const told = (mutations: string[], before: number, after: number) => {
    const scope = (traumatic: number) => engine!.actorScope({ fields: { mutations, traumatic } });
    const holds = (source: string, s: Record<string, unknown>) => ev(source, s) === true;
    return plain.notices.filter(
      (n) => n.id.startsWith("enduringLife") && !holds(n.if, scope(before)) && holds(n.if, scope(after)),
    ).length;
  };
  for (let before = 0; before <= 8; before++)
    for (let after = 0; after <= 8; after++) {
      // character.adjust: one notice per Traumatic Wound added (Core p.294, rules-flow §11.185).
      assert.equal(told([ENDURING_LIFE], before, after), Math.max(0, after - before), `${before} → ${after}`);
      assert.equal(told([], before, after), 0);
    }
});

// Auspex notices only when `traumatic` rises (character.actions.ts); a notice rule reads the Agent after the action, not
// what changed, so gaining Enduring Life with Injuries already taken tells one roll per Injury (rules-flow §11.188).
test("gaining Enduring Life with Injuries taken tells their rolls, a difference the decisions write", { skip }, () => {
  const scope = (mutations: string[]) => engine!.actorScope({ fields: { mutations, traumatic: 2 } });
  const crossed = plain.notices.filter(
    (n) => n.id.startsWith("enduringLife") && ev(n.if, scope([])) !== true && ev(n.if, scope([ENDURING_LIFE])) === true,
  );
  assert.equal(crossed.length, 2);
  assert.ok(plain.decisions.some((d) => d.id === "enduringLifeOnGain"));
});
