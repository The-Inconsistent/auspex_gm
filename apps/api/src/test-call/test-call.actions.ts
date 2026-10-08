import { and, eq, inArray } from "drizzle-orm";
import { CharacterStats, corruptionTestDn, reportProblem, type Action, type ActionResult } from "@wg/shared";
import type { Ctx } from "../auth/auth.service.ts";
import { ownCharacter } from "../character/character.actions.ts";
import { character } from "../character/character.schema.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { clearTestCall } from "./test-call.clear.ts";
import { testCall } from "./test-call.schema.ts";

export type TestCallAction = Extract<Action, { type: `test.${string}` }>;

// A Test the GM calls at the table, and the results the phones send back (issue #191). The dice stay physical
// (rules-flow.md §7): nothing here rolls, counts Icons or moves a pool.
export async function applyTestCallAction(
  tx: Tx,
  { ctx, action: a }: { ctx: Ctx; action: TestCallAction },
): Promise<ActionResult> {
  const cid = ctx.campaignId;
  switch (a.type) {
    // GM only. A new call replaces the open one (§11.143). Only what the Test rolls is kept, none of the GM's plan.
    case "test.call": {
      const who = [...new Set(a.who)];
      const ours = await tx
        .select({ id: character.id })
        .from(character)
        .where(and(eq(character.campaignId, cid), inArray(character.id, who)));
      if (ours.length !== who.length) fail("Call only this game's Agents");
      const { kind, skill, attribute, dn } = a.test;
      await clearTestCall(tx, cid);
      const [row] = await tx
        .insert(testCall)
        .values({ campaignId: cid, test: { kind, skill, attribute, dn }, fear: a.fear, hideDn: a.hideDn, who })
        .returning({ id: testCall.id });
      return { ok: true, id: row!.id }; // the row was just inserted
    }

    // A named Agent's own result, or the GM setting one for a phone that's out (§11.144). A second report overwrites.
    case "test.report": {
      const [call] = await tx.select().from(testCall).where(eq(testCall.campaignId, cid));
      if (!call || call.id !== a.callId) fail("That call is closed");
      // authorize() only knows the action, so a player's place in the call is checked here against the row.
      if (!call.who.includes(a.characterId)) fail("That Agent isn't asked to roll");
      const { type, callId, characterId, ...report } = a;
      const problem = reportProblem(call.test, report);
      if (problem) fail(problem);
      const row = await ownCharacter(tx, { campaignId: cid, id: characterId }); // not deleted since the call
      // A failed Corruption Test's roll has to be one the GM's GAIN can take (character.corrupt, Core p.286).
      if (call.test.kind === "corruption" && !report.passed && call.test.dn !== null) {
        const stats = CharacterStats.parse(row.stats);
        const dn = corruptionTestDn({ source: call.test.dn, points: stats.corruption, ...report });
        if ((report.icons ?? 0) >= dn) fail(`${report.icons} Icons against DN ${dn} pass that Test (Core p.286)`);
        if (report.spentWrath && row.wrath < 1) fail(`${row.name} has no Wrath to spend (p.286)`);
      }
      await tx
        .update(testCall)
        .set({ reports: { ...call.reports, [characterId]: report } })
        .where(eq(testCall.campaignId, cid));
      return { ok: true };
    }

    case "test.close":
      await clearTestCall(tx, cid);
      return { ok: true };
  }
}
