import { and, count, eq, inArray, max, or, sql } from "drizzle-orm";
import {
  EncounterEntry,
  MONSTROUS_IMMUNE,
  canBeEnemy,
  canSeize,
  exhaustedShock,
  isExhausted,
  isOut,
  isTimed,
  playerMayRun,
  prepareThreat,
  sideOf,
  sideUpNext,
  threatClassAt,
  type Action,
  type ActionResult,
  type Combatant,
  type FightsAs,
  type LiveState,
  type Marker,
  type ProfileId,
  type Side,
  type SpendKind,
  type Threat,
  type Visibility,
} from "@wg/shared";
import type { Ctx } from "../auth/auth.service.ts";
import { claimedCharacterIds } from "../auth/invite.service.ts";
import { campaignTier } from "../campaign/campaign.actions.ts";
import { campaign } from "../campaign/campaign.schema.ts";
import { ownCharacter } from "../character/character.actions.ts";
import { character } from "../character/character.schema.ts";
import { beginBeat } from "../codex/codex.actions.ts";
import { beat, npc } from "../codex/codex.schema.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { bump } from "../core/sql.ts";
import { clearMootAware, clearSpendRequests } from "../spend/spend.clear.ts";
import { loadState } from "../table/table.state.ts";
import { loadThreats } from "../threat/threat.service.ts";
import { combatant, encounter } from "./encounter.schema.ts";
import { TurnStep } from "./encounter.turn-step.ts";

const TURN_HISTORY = 30; // TURN BACK steps kept (rules-flow §11.170)
const FIGHT_SPENDS: SpendKind[] = ["seize", "determination", "aware"]; // asks that mean nothing once their fight is over

export type EncounterAction = Extract<
  Action,
  { type: `encounter.${string}` | `turn.${string}` | `combatant.${string}` | "beat.startEncounter" }
>;

// The live state inside this transaction, for the shared turn rules (sideUpNext, canAct, canSeize), so the api and
// the tracker can't drift apart.
async function liveTable(tx: Tx, campaignId: string) {
  const state = await loadState(campaignId, tx);
  const enc = state?.encounter ?? fail("No active encounter");
  return { state: state!, enc }; // an encounter implies the campaign row was found
}

// PCs' Conditions live on their character; threats' on the combatant row.
const conditionsOf = (state: LiveState, c: Combatant) =>
  c.kind === "pc" ? (state.characters.find((x) => x.id === c.characterId)?.conditions ?? []) : c.conditions;

async function activeEncounter(tx: Tx, campaignId: string) {
  const [enc] = await tx
    .select()
    .from(encounter)
    .where(and(eq(encounter.campaignId, campaignId), eq(encounter.active, true)));
  return enc ?? fail("No active encounter");
}

// Spend 1 Glory (Agents) or Ruin (Threats) to Seize or ignore an ambush (p.177, p.320); fails if the pool is empty.
async function spend(tx: Tx, { campaignId, side }: { campaignId: string; side: Side }) {
  const col = side === "agents" ? campaign.glory : campaign.ruin;
  const r = await tx
    .update(campaign)
    .set({ [side === "agents" ? "glory" : "ruin"]: sql`${col} - 1` })
    .where(and(eq(campaign.id, campaignId), sql`${col} > 0`))
    .returning({ id: campaign.id });
  if (!r.length) fail(side === "agents" ? "No Glory to spend" : "No Ruin to spend");
}

async function combatantOf(tx: Tx, { encounterId, id }: { encounterId: string; id: string }) {
  const [c] = await tx
    .select()
    .from(combatant)
    .where(and(eq(combatant.id, id), eq(combatant.encounterId, encounterId)));
  return c ?? fail("Combatant not found");
}

// The Codex NPC behind a fight row, of this campaign (issue #350). Never trust the id from the client.
async function npcOf(tx: Tx, { campaignId, id }: { campaignId: string; id: string }) {
  const [n] = await tx
    .select({ name: npc.name, fightsAs: npc.fightsAs })
    .from(npc)
    .where(and(eq(npc.id, id), eq(npc.campaignId, campaignId)));
  return n ?? fail("NPC not found");
}

// Who may run an ally (§11.208): the GM (null), or an Agent of this campaign, unless the NPC behind the row is an Ally,
// which only the GM runs (the category is read as it is now, so a change in the story is honoured without re-adding it).
async function checkController(
  tx: Tx,
  {
    campaignId,
    controllerId,
    npc: n,
  }: { campaignId: string; controllerId: string | null; npc: { name: string; fightsAs: FightsAs } | null },
) {
  if (!controllerId) return;
  await ownCharacter(tx, { campaignId, id: controllerId });
  if (n && !playerMayRun(n.fightsAs)) fail(`${n.name} is an Ally: only the GM runs it`);
}

async function nextOrder(tx: Tx, encounterId: string) {
  const [{ m } = { m: null }] = await tx
    .select({ m: max(combatant.order) })
    .from(combatant)
    .where(eq(combatant.encounterId, encounterId));
  return (m ?? -1) + 1;
}

async function addThreat(
  tx: Tx,
  {
    encounterId,
    tier,
    threat: printed,
    label,
    mobCount,
    marker,
    visibility,
    profiles,
    scale,
    agents,
    ally,
    controllerId,
    npcId,
  }: {
    encounterId: string;
    tier: number;
    threat: Threat;
    label?: string;
    mobCount?: number;
    marker?: Marker;
    visibility?: Visibility;
    profiles?: readonly ProfileId[];
    scale?: boolean;
    agents: number;
    ally?: boolean;
    controllerId?: string | null;
    npcId?: string | null;
  },
) {
  // What the GM ticked, applied before the snapshot: profiles (VoA p.126) and scaling (Core p.326). The class still
  // comes from the printed Tier row, which neither changes (Core p.323), and the label stays the threat's own.
  const t = prepareThreat(printed, { tier, agents, asMob: mobCount !== undefined, profiles, scale });
  const [c] = await tx
    .insert(combatant)
    .values({
      encounterId,
      order: await nextOrder(tx, encounterId),
      kind: "threat",
      threatId: t.id,
      threatClass: threatClassAt(t, tier),
      statSnapshot: t,
      label: label ?? (mobCount ? `${t.name} ×${mobCount}` : t.name),
      mobCount: mobCount ?? null,
      mobStart: mobCount ?? null,
      personalRuin: t.personalRuin ?? 0,
      marker: marker ?? null,
      visibility: ally ? "stats" : visibility, // undefined takes the column default, bars; an ally is always seen (§11.208)
      ally: ally ?? false,
      controllerId: controllerId ?? null,
      npcId: npcId ?? null,
    })
    .returning({ id: combatant.id });
  return c!.id; // the row was just inserted
}

// "The number of players" in Scaling Threats (Core p.326, rules-flow §11.106): the seated Agents, or the whole roster
// while nobody holds a seat, as `agentsInFight` counts on the GM's screen, so the SCALE preview is what the server adds.
async function agentCount(tx: Tx, { campaignId, seated }: { campaignId: string; seated?: Set<string> }) {
  const n = (seated ?? (await claimedCharacterIds(tx, campaignId))).size;
  if (n) return n;
  const [row] = await tx.select({ n: count() }).from(character).where(eq(character.campaignId, campaignId));
  return row?.n ?? 0;
}

async function addPc(tx: Tx, { encounterId, characterId }: { encounterId: string; characterId: string }) {
  const [c] = await tx
    .insert(combatant)
    .values({ encounterId, order: await nextOrder(tx, encounterId), kind: "pc", characterId })
    .returning({ id: combatant.id });
  return c!.id; // the row was just inserted
}

async function startEncounter(tx: Tx, campaignId: string) {
  await tx.update(encounter).set({ active: false }).where(eq(encounter.campaignId, campaignId));
  await clearSpendRequests(tx, { campaignId, kinds: FIGHT_SPENDS }); // asked against the fight this one replaces
  const [e] = await tx.insert(encounter).values({ campaignId, round: 0 }).returning({ id: encounter.id });
  return e!.id; // the row was just inserted
}

// Everyone gets a Turn each Round; the players pick first again; ambush only applies to Round 1 (p.176-177). Held
// actions are lost at the Round's end (p.187).
async function newRound(tx: Tx, { encounterId, round }: { encounterId: string; round: number }) {
  await tx
    .update(combatant)
    .set({ acted: false, ambushed: false, held: false, manifested: false })
    .where(eq(combatant.encounterId, encounterId));
  await tx
    .update(encounter)
    .set({ round: round + 1, currentId: null, lastSide: null, seizedSide: null })
    .where(eq(encounter.id, encounterId));
}

// TURN BACK (§11.170): before a turn-flow action, keep the fight's turn state and everyone's damage as they stand.
// `who` names the combatant the label speaks of ("Aurelian Tarsus's Turn"); `refund` is what a Seize or AWARE is about to
// cost, to give back.
async function pushStep(
  tx: Tx,
  {
    encounterId,
    who,
    label,
    refund,
  }: { encounterId: string; who?: string; label: (name: string) => string; refund?: TurnStep["refund"] },
) {
  const [enc] = await tx.select().from(encounter).where(eq(encounter.id, encounterId));
  const rows = await tx.select().from(combatant).where(eq(combatant.encounterId, encounterId));
  const pcIds = rows.flatMap((r) => (r.characterId ? [r.characterId] : []));
  const chars = pcIds.length ? await tx.select().from(character).where(inArray(character.id, pcIds)) : [];
  const row = rows.find((r) => r.id === who);
  const name = row ? (row.kind === "pc" ? chars.find((c) => c.id === row.characterId)?.name : row.label) : "";
  const step: TurnStep = {
    label: label(name ?? "?"),
    round: enc!.round, // the encounter was looked up by the caller
    currentId: enc!.currentId,
    lastSide: enc!.lastSide,
    seizedSide: enc!.seizedSide,
    refund: refund ?? null,
    combatants: rows.map((r) => ({
      id: r.id,
      acted: r.acted,
      ambushed: r.ambushed,
      held: r.held,
      manifested: r.manifested,
      expiring: r.expiring,
      wounds: r.wounds,
      shock: r.shock,
      mobCount: r.mobCount,
      conditions: r.conditions,
    })),
    characters: chars.map((c) => ({
      id: c.id,
      wounds: c.wounds,
      shock: c.shock,
      conditions: c.conditions,
      traumatic: c.traumatic,
      annihilated: c.annihilated,
    })),
  };
  await tx
    .update(encounter)
    .set({ history: [...enc!.history, step].slice(-TURN_HISTORY) })
    .where(eq(encounter.id, encounterId));
}

// Pop the newest step and put all of it back, damage included (the GM's ruling); what was added since stays. Then the
// Glory or Ruin a Seize or AWARE cost goes back to its pool.
async function takeBack(tx: Tx, { campaignId }: { campaignId: string }) {
  const enc = await activeEncounter(tx, campaignId);
  const step = TurnStep.parse(enc.history.at(-1) ?? fail("Nothing to take back"));
  const rows = await tx.select({ id: combatant.id }).from(combatant).where(eq(combatant.encounterId, enc.id));
  const here = new Set(rows.map((r) => r.id));
  for (const { id, ...c } of step.combatants.filter((x) => here.has(x.id)))
    await tx
      .update(combatant)
      .set(c)
      .where(and(eq(combatant.id, id), eq(combatant.encounterId, enc.id)));
  for (const { id, ...c } of step.characters)
    await tx
      .update(character)
      .set(c)
      .where(and(eq(character.id, id), eq(character.campaignId, campaignId)));
  await tx
    .update(encounter)
    .set({
      round: step.round,
      currentId: step.currentId && here.has(step.currentId) ? step.currentId : null,
      lastSide: step.lastSide,
      seizedSide: step.seizedSide,
      history: enc.history.slice(0, -1),
    })
    .where(eq(encounter.id, enc.id));
  if (step.refund) {
    const col = step.refund.pool === "glory" ? campaign.glory : campaign.ruin;
    await tx
      .update(campaign)
      .set({ [step.refund.pool]: sql`${col} + ${step.refund.n}` })
      .where(eq(campaign.id, campaignId));
  }
}

// End the Turn in progress, for END TURN, HOLD, and anything that starts another Turn (the order is a suggestion,
// §11.168). Returns false when no one was acting. `step: false` when the caller already kept its own TURN BACK step, so
// one tap is one step back.
async function endCurrentTurn(
  tx: Tx,
  { campaignId, hold, step = true }: { campaignId: string; hold?: boolean; step?: boolean },
) {
  const { state, enc } = await liveTable(tx, campaignId);
  const current = enc.combatants.find((x) => x.id === enc.currentId);
  if (!current) return false;
  if (step)
    await pushStep(tx, {
      encounterId: enc.id,
      who: current.id,
      label: (n) => `${n}'s ${hold ? "HOLD" : "END TURN"}`,
    });
  const side = sideOf(current);
  // "Until the end of your next Turn" (pp.199-200): drop the timed Conditions armed at turn.start.
  // ponytail: one that was removed and gained again this Turn ends too; per-Condition start times if that matters.
  const [{ expiring } = { expiring: [] }] = await tx
    .select({ expiring: combatant.expiring })
    .from(combatant)
    .where(eq(combatant.id, current.id));
  const left = conditionsOf(state, current).filter((k) => !expiring.includes(k));
  if (current.kind === "pc" && expiring.length)
    await tx.update(character).set({ conditions: left }).where(eq(character.id, current.characterId));
  await tx
    .update(combatant)
    .set({
      acted: true,
      held: !!hold, // holding the action keeps the Turn spent but lets it interrupt later (p.187)
      expiring: [],
      ...(current.kind === "threat" && expiring.length ? { conditions: left } : {}),
    })
    .where(eq(combatant.id, current.id));
  // A Seize holds until the other side acts.
  await tx
    .update(encounter)
    .set({ currentId: null, lastSide: side, seizedSide: enc.seizedSide === side ? side : null })
    .where(eq(encounter.id, enc.id));
  return true;
}

export async function applyEncounterAction(
  tx: Tx,
  { ctx, action: a }: { ctx: Ctx; action: EncounterAction },
): Promise<ActionResult> {
  const cid = ctx.campaignId;

  switch (a.type) {
    case "encounter.start":
      return { ok: true, id: await startEncounter(tx, cid) };

    case "encounter.end":
      await tx.update(encounter).set({ active: false }).where(eq(encounter.campaignId, cid));
      await clearSpendRequests(tx, { campaignId: cid, kinds: FIGHT_SPENDS }); // there is no fight left to spend in
      return { ok: true };

    // Round 0 → Round 1 (p.176): the ambushes set in Round 0 stay; a done or held mark tapped there by mistake doesn't.
    case "encounter.begin": {
      const enc = await activeEncounter(tx, cid);
      if (enc.round !== 0) fail("Round 1 has already begun");
      await pushStep(tx, { encounterId: enc.id, label: () => "Round 1 begins" });
      await tx
        .update(combatant)
        .set({ acted: false, held: false, manifested: false })
        .where(eq(combatant.encounterId, enc.id));
      await tx
        .update(encounter)
        .set({ round: 1, currentId: null, lastSide: null, seizedSide: null })
        .where(eq(encounter.id, enc.id));
      return { ok: true };
    }

    // The GM's tap: a Round never ends by itself (§11.169).
    case "encounter.newRound": {
      const before = await activeEncounter(tx, cid);
      if (before.round === 0) fail("BEGIN ROUND 1 first");
      await pushStep(tx, { encounterId: before.id, label: () => `Round ${before.round + 1}` });
      await endCurrentTurn(tx, { campaignId: cid, step: false });
      await newRound(tx, { encounterId: before.id, round: before.round });
      // An ambush costs only Round 1's Turn (p.177): an AWARE still asked is moot once Round 2 begins.
      if (before.round === 1) await clearSpendRequests(tx, { campaignId: cid, kinds: ["aware"] });
      return { ok: true };
    }

    // Step 1 (p.176): a whole side ambushed or not, while the fight is being set up or in Round 1.
    case "encounter.ambush": {
      const enc = await activeEncounter(tx, cid);
      if (enc.round > 1) fail("Ambushes are settled by Round 1 (p.177)");
      const word = a.side === "agents" ? "Agents" : "Threats";
      await pushStep(tx, {
        encounterId: enc.id,
        label: () => `${word} ${a.ambushed ? "ambushed" : "no longer ambushed"}`,
      });
      await tx
        .update(combatant)
        .set({ ambushed: a.ambushed })
        .where(
          and(
            eq(combatant.encounterId, enc.id),
            // An ally is on the Agents' side (§11.208).
            a.side === "agents" ? or(eq(combatant.kind, "pc"), eq(combatant.ally, true)) : eq(combatant.ally, false),
            a.side === "agents" ? undefined : eq(combatant.kind, "threat"),
            eq(combatant.acted, false),
          ),
        );
      await clearMootAware(tx, { campaignId: cid, encounterId: enc.id });
      return { ok: true };
    }

    case "turn.start":
    case "turn.seize": {
      // The order is a suggestion (§11.168): whoever is acting ends their Turn, then the pick is checked. One TURN BACK
      // step covers both; a refusal rolls all of it back.
      const before = await activeEncounter(tx, cid);
      const picked = await combatantOf(tx, { encounterId: before.id, id: a.id });
      await pushStep(tx, {
        encounterId: before.id,
        who: a.id,
        label: (n) => `${n}'s ${a.type === "turn.seize" ? "Seize" : "Turn"}`,
        refund:
          a.type === "turn.seize" ? { pool: picked.kind === "pc" || picked.ally ? "glory" : "ruin", n: 1 } : undefined,
      });
      await endCurrentTurn(tx, { campaignId: cid, step: false });
      const { state, enc } = await liveTable(tx, cid);
      if (enc.round === 0) fail("BEGIN ROUND 1 first");
      const c = enc.combatants.find((x) => x.id === a.id) ?? fail("Combatant not found");
      if (isOut(state, c)) fail(c.kind === "pc" ? "Dead: no more Turns (p.193)" : "Slain: no more Turns (p.324)");
      if (c.acted) fail("Already acted: mark it NOT YET for another Turn");
      if (c.ambushed && enc.round === 1) fail("Ambushed: no turn in Round 1 (AWARE first, pay 1 Glory/Ruin)");
      const side = sideOf(c);
      const up = sideUpNext(state);
      const sideName = (x: Side) => (x === "agents" ? "Agents" : "Threats");
      if (a.type === "turn.seize") {
        if (!canSeize(state, side))
          fail(
            enc.seizedSide === side
              ? "Already Seized: the other side acts next"
              : up === side
                ? `No need to Seize: the ${sideName(side)} act next anyway`
                : "Seizing lets the side that just acted go again",
          );
        await spend(tx, { campaignId: cid, side });
        await tx.update(encounter).set({ currentId: a.id, seizedSide: side }).where(eq(encounter.id, enc.id));
      } else {
        // Normal order: the other side, unless it has no one left (p.177); JUST GO takes it anyway.
        if (side !== up && !a.force) fail(`It's the ${sideName(up ?? side)}' pick: SEIZE or JUST GO`);
        await tx.update(encounter).set({ currentId: a.id }).where(eq(encounter.id, enc.id));
      }
      // Timed Conditions held now end with this Turn; ones gained during it last until the end of the next (§11.8).
      await tx
        .update(combatant)
        .set({ expiring: conditionsOf(state, c).filter(isTimed) })
        .where(eq(combatant.id, a.id));
      return { ok: true };
    }

    case "turn.end":
    case "turn.hold":
      return (await endCurrentTurn(tx, { campaignId: cid, hold: a.type === "turn.hold" }))
        ? { ok: true }
        : fail("No one is taking a turn");

    // A held action used, at any point later in the Round (p.187); interrupting someone's Turn takes an opposed Initiative
    // Test at the table (pp.177-178). The row stays done: NOT YET only if the GM gives it another Turn.
    case "turn.interrupt": {
      const enc = await activeEncounter(tx, cid);
      const c = await combatantOf(tx, { encounterId: enc.id, id: a.id });
      if (!c.held) fail("Not holding an action");
      await pushStep(tx, { encounterId: enc.id, who: c.id, label: (n) => `${n}'s INTERRUPT` });
      // The held Combat Action is used now, inside another Turn; it is not a Turn of its own (p.187).
      await tx.update(combatant).set({ held: false }).where(eq(combatant.id, c.id));
      return { ok: true };
    }

    // A fix: done or not yet, also ANOTHER TURN for a row that gets more than one (p.176).
    case "turn.mark": {
      const enc = await activeEncounter(tx, cid);
      const c = await combatantOf(tx, { encounterId: enc.id, id: a.id });
      if (enc.currentId === c.id) fail("Acting now: END TURN first");
      await pushStep(tx, {
        encounterId: enc.id,
        who: c.id,
        label: (n) => `${n} marked ${a.acted ? "done" : "not yet"}`,
      });
      await tx
        .update(combatant)
        .set(a.acted ? { acted: true } : { acted: false, held: false })
        .where(eq(combatant.id, c.id));
      return { ok: true };
    }

    case "turn.back":
      await takeBack(tx, { campaignId: cid });
      return { ok: true };

    case "combatant.addThreat": {
      // The bestiary plus this campaign's own stat blocks (issue #43).
      const t =
        (await loadThreats(tx, { campaignId: cid, ids: [a.threatId] })).get(a.threatId) ??
        fail(`Unknown threat "${a.threatId}"`);
      const enc = await activeEncounter(tx, cid);
      const tier = await campaignTier(tx, cid);
      // A Codex NPC's FIGHTS AS decides how it may join (§11.208); a stat block picked straight from the bestiary has none.
      const from = a.npcId ? await npcOf(tx, { campaignId: cid, id: a.npcId }) : null;
      if (from && !a.ally && !canBeEnemy(from.fightsAs))
        fail(
          `${from.name} is ${from.fightsAs === "ally" ? "an Ally" : "a Follower"}: it fights only beside the Agents`,
        );
      if (a.controllerId && !a.ally) fail("Only an ally has someone to run it");
      await checkController(tx, { campaignId: cid, controllerId: a.controllerId, npc: from });
      return {
        ok: true,
        id: await addThreat(tx, {
          encounterId: enc.id,
          tier,
          threat: t,
          ally: a.ally,
          controllerId: a.controllerId,
          npcId: a.npcId,
          label: a.label ?? (a.mobCount ? undefined : from?.name),
          mobCount: a.mobCount,
          marker: a.marker,
          visibility: a.visibility,
          profiles: a.profiles,
          scale: a.scale,
          agents: await agentCount(tx, { campaignId: cid }),
        }),
      };
    }

    case "combatant.addCharacter": {
      await ownCharacter(tx, { campaignId: cid, id: a.characterId });
      const enc = await activeEncounter(tx, cid);
      const [dup] = await tx
        .select({ id: combatant.id })
        .from(combatant)
        .where(and(eq(combatant.encounterId, enc.id), eq(combatant.characterId, a.characterId)));
      if (dup) fail("Already in this encounter");
      return { ok: true, id: await addPc(tx, { encounterId: enc.id, characterId: a.characterId }) };
    }

    case "combatant.update": {
      const enc = await activeEncounter(tx, cid);
      const { type, id, ambushed, controllerId, ...threatOnly } = a;
      const where = and(eq(combatant.id, id), eq(combatant.encounterId, enc.id));
      if (ambushed !== undefined) {
        await combatantOf(tx, { encounterId: enc.id, id }); // a stranger's id is refused before anything is kept
        await pushStep(tx, {
          encounterId: enc.id,
          who: id,
          label: (n) => `${n} ${ambushed ? "ambushed" : "no longer ambushed"}`,
        });
        const r = await tx.update(combatant).set({ ambushed }).where(where).returning({ id: combatant.id });
        if (!r.length) fail("Combatant not found");
        await clearMootAware(tx, { campaignId: cid, encounterId: enc.id });
      }
      // Who runs an ally (§11.208): only an ally has a runner, and the NPC's category is checked as it is now.
      if (controllerId !== undefined) {
        const [row] = await tx.select({ ally: combatant.ally, npcId: combatant.npcId }).from(combatant).where(where);
        if (!row) fail("Combatant not found");
        if (!row.ally) fail("Only an ally has someone to run it");
        const from = row.npcId ? await npcOf(tx, { campaignId: cid, id: row.npcId }) : null;
        await checkController(tx, { campaignId: cid, controllerId, npc: from });
        await tx.update(combatant).set({ controllerId }).where(where);
      }
      if (threatOnly.conditions) {
        const [row] = await tx
          .select({ threatClass: combatant.threatClass, conditions: combatant.conditions })
          .from(combatant)
          .where(where);
        const immune =
          row?.threatClass === "M" &&
          threatOnly.conditions.find(
            (k) => !row.conditions.includes(k) && (MONSTROUS_IMMUNE as readonly string[]).includes(k),
          );
        if (immune) fail(`Monstrous Creatures are immune to ${immune} (p.323)`);
      }
      if (Object.keys(threatOnly).length) {
        // Setting a Mob's size by hand raises its starting size too, so the half-slain prompt and the healing cap
        // (p.325) follow; null turns it back into a single Threat.
        const mobStart =
          threatOnly.mobCount === undefined
            ? {}
            : {
                mobStart:
                  threatOnly.mobCount === null
                    ? null
                    : sql`greatest(coalesce(${combatant.mobStart}, 0), ${threatOnly.mobCount})`,
              };
        const r = await tx
          .update(combatant)
          .set({ ...threatOnly, ...mobStart })
          .where(and(where, eq(combatant.kind, "threat")))
          .returning({ id: combatant.id });
        if (!r.length) fail("Threat combatant not found");
      }
      return { ok: true };
    }

    case "combatant.adjust": {
      const enc = await activeEncounter(tx, cid);
      const [c] = await tx
        .select()
        .from(combatant)
        .where(and(eq(combatant.id, a.id), eq(combatant.encounterId, enc.id), eq(combatant.kind, "threat")));
      if (!c) fail("Threat combatant not found");
      // Threat rows always carry a stat snapshot (see addThreat).
      const maxShock = c.statSnapshot!.shock;
      if (a.shock && maxShock === null) fail("This Threat never suffers Shock (p.324)");
      // Mob (p.325): every member has 1 Wound, so Wounds remove members and healing restores them, up to the starting
      // size. More Shock in one hit than the members' Maximum Shock removes one member; less has no effect, and a Mob
      // keeps no Shock track.
      const mobLoss =
        (a.wounds ?? 0) + (!a.raw && a.shock !== undefined && maxShock !== null && a.shock > maxShock ? 1 : 0);
      // A single Threat's Shock while Exhausted is Mortal Wounds (p.199).
      const hit = a.raw
        ? { wounds: a.wounds, shock: a.shock }
        : exhaustedShock({
            exhausted: isExhausted({ shock: c.shock, maxShock, conditions: c.conditions }),
            wounds: a.wounds,
            shock: a.shock,
          });
      const damage =
        c.mobCount !== null
          ? { mobCount: sql`least(${c.mobStart ?? c.mobCount}, greatest(0, ${combatant.mobCount} - ${mobLoss}))` }
          : { wounds: bump(combatant.wounds, hit.wounds), shock: bump(combatant.shock, hit.shock) };
      await tx
        .update(combatant)
        .set({ ...damage, personalRuin: bump(combatant.personalRuin, a.personalRuin) })
        .where(eq(combatant.id, a.id));
      return { ok: true };
    }

    // Pay 1 Glory/Ruin so an ambushed combatant acts normally in Round 1 (p.177).
    case "combatant.aware": {
      const enc = await activeEncounter(tx, cid);
      const [c] = await tx
        .select()
        .from(combatant)
        .where(and(eq(combatant.id, a.id), eq(combatant.encounterId, enc.id)));
      if (!c) fail("Combatant not found");
      if (!c.ambushed) fail("Not ambushed");
      const side: Side = c.kind === "pc" || c.ally ? "agents" : "threats"; // an ally pays Glory (§11.208)
      await pushStep(tx, {
        encounterId: enc.id,
        who: c.id,
        label: (n) => `${n} AWARE`,
        refund: { pool: side === "agents" ? "glory" : "ruin", n: 1 },
      });
      await spend(tx, { campaignId: cid, side });
      await tx.update(combatant).set({ ambushed: false }).where(eq(combatant.id, a.id));
      await clearMootAware(tx, { campaignId: cid, encounterId: enc.id });
      return { ok: true };
    }

    case "combatant.manifest": {
      // One activation per Round, whatever the roll (Core p.259, rules-flow §8, §11.181).
      const { state, enc } = await liveTable(tx, cid);
      const c = enc.combatants.find((x) => x.id === a.id) ?? fail("Combatant not found");
      if (isOut(state, c)) fail("Out of the fight: no psychic powers");
      if (c.manifested) fail("Already manifested a power this Round (Core p.259)");
      await tx.update(combatant).set({ manifested: true }).where(eq(combatant.id, a.id));
      return { ok: true };
    }

    case "combatant.remove": {
      const enc = await activeEncounter(tx, cid);
      const r = await tx
        .delete(combatant)
        .where(and(eq(combatant.id, a.id), eq(combatant.encounterId, enc.id)))
        .returning({ id: combatant.id });
      if (!r.length) fail("Combatant not found");
      await clearMootAware(tx, { campaignId: cid, encounterId: enc.id });
      return { ok: true }; // current_id is cleared by the FK
    }

    // Start the beat's prepared encounter: every active Agent (reserve ones stay out) plus its threats.
    case "beat.startEncounter": {
      const [b] = await tx
        .select()
        .from(beat)
        .where(and(eq(beat.id, a.id), eq(beat.campaignId, cid)));
      if (!b) fail("Beat not found");
      const entries = EncounterEntry.array().parse(b.encounter);
      const known = await loadThreats(tx, { campaignId: cid, ids: entries.map((e) => e.threatId) });
      const missing = entries.find((e) => !known.has(e.threatId));
      if (missing) fail(`Unknown threat "${missing.threatId}"`);
      const tier = await campaignTier(tx, cid);
      const encounterId = await startEncounter(tx, cid);
      const agentIds = await claimedCharacterIds(tx, cid);
      for (const characterId of agentIds) await addPc(tx, { encounterId, characterId });
      const agents = await agentCount(tx, { campaignId: cid, seated: agentIds });
      for (const e of entries) {
        const t = known.get(e.threatId)!; // every entry was resolved above
        if (e.asMob && e.count > 1)
          await addThreat(tx, {
            encounterId,
            tier,
            threat: t,
            label: e.label,
            mobCount: e.count,
            marker: e.marker,
            visibility: e.visibility,
            profiles: e.profiles,
            scale: e.scale,
            agents,
          });
        else
          for (let i = 0; i < e.count; i++)
            await addThreat(tx, {
              encounterId,
              tier,
              threat: t,
              label: e.count > 1 ? `${e.label ?? t.name} ${i + 1}` : e.label,
              marker: e.marker,
              visibility: e.visibility,
              profiles: e.profiles,
              scale: e.scale,
              agents,
            });
      }
      // The scene's fight begins the scene too: it becomes the one being played and its ON ENTRY list goes out.
      await beginBeat(tx, { campaignId: cid, id: b.id, leave: "done", reveal: true });
      return { ok: true, id: encounterId };
    }
  }
}
