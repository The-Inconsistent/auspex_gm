import { and, eq, max, sql } from "drizzle-orm";
import { threats } from "@wg/data";
import {
  EncounterEntry, canAct, canSeize, isOut, sideOf, sideOfKind, sideUpNext, threatClassAt,
  type Action, type ActionResult, type Marker, type Side, type Threat,
} from "@wg/shared";
import type { Ctx } from "../auth/auth.service.ts";
import { campaignTier } from "../campaign/campaign.actions.ts";
import { campaign } from "../campaign/campaign.schema.ts";
import { ownCharacter } from "../character/character.actions.ts";
import { character } from "../character/character.schema.ts";
import { beat } from "../codex/codex.schema.ts";
import type { Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { bump } from "../core/sql.ts";
import { loadState } from "../table/table.state.ts";
import { combatant, encounter } from "./encounter.schema.ts";

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

async function activeEncounter(tx: Tx, campaignId: string) {
  const [enc] = await tx.select().from(encounter).where(and(eq(encounter.campaignId, campaignId), eq(encounter.active, true)));
  return enc ?? fail("No active encounter");
}

// Spend 1 Glory (Agents) or Ruin (Threats) to Seize or ignore an ambush (p.177, p.320); fails if the pool is empty.
async function spend(tx: Tx, { campaignId, side }: { campaignId: string; side: Side }) {
  const col = side === "agents" ? campaign.glory : campaign.ruin;
  const r = await tx.update(campaign).set({ [side === "agents" ? "glory" : "ruin"]: sql`${col} - 1` })
    .where(and(eq(campaign.id, campaignId), sql`${col} > 0`)).returning({ id: campaign.id });
  if (!r.length) fail(side === "agents" ? "No Glory to spend" : "No Ruin to spend");
}

async function nextOrder(tx: Tx, encounterId: string) {
  const [{ m } = { m: null }] = await tx.select({ m: max(combatant.order) }).from(combatant).where(eq(combatant.encounterId, encounterId));
  return (m ?? -1) + 1;
}

async function addThreat(
  tx: Tx,
  { encounterId, tier, threat: t, label, mobCount, marker }:
    { encounterId: string; tier: number; threat: Threat; label?: string; mobCount?: number; marker?: Marker },
) {
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
    })
    .returning({ id: combatant.id });
  return c!.id; // the row was just inserted
}

async function addPc(tx: Tx, { encounterId, characterId }: { encounterId: string; characterId: string }) {
  const [c] = await tx.insert(combatant)
    .values({ encounterId, order: await nextOrder(tx, encounterId), kind: "pc", characterId })
    .returning({ id: combatant.id });
  return c!.id; // the row was just inserted
}

async function startEncounter(tx: Tx, campaignId: string) {
  await tx.update(encounter).set({ active: false }).where(eq(encounter.campaignId, campaignId));
  const [e] = await tx.insert(encounter).values({ campaignId }).returning({ id: encounter.id });
  return e!.id; // the row was just inserted
}

// Everyone gets a Turn each Round; the players pick first again; ambush only applies to Round 1 (p.176-177).
async function newRound(tx: Tx, { encounterId, round }: { encounterId: string; round: number }) {
  await tx.update(combatant).set({ acted: false, ambushed: false }).where(eq(combatant.encounterId, encounterId));
  await tx.update(encounter).set({ round: round + 1, currentId: null, lastSide: null, seizedSide: null }).where(eq(encounter.id, encounterId));
}

export async function applyEncounterAction(tx: Tx, { ctx, action: a }: { ctx: Ctx; action: EncounterAction }): Promise<ActionResult> {
  const cid = ctx.campaignId;

  switch (a.type) {
    case "encounter.start":
      return { ok: true, id: await startEncounter(tx, cid) };

    case "encounter.end":
      await tx.update(encounter).set({ active: false }).where(eq(encounter.campaignId, cid));
      return { ok: true };

    case "encounter.newRound": {
      const enc = await activeEncounter(tx, cid);
      await newRound(tx, { encounterId: enc.id, round: enc.round });
      return { ok: true };
    }

    case "turn.start":
    case "turn.seize": {
      const { state, enc } = await liveTable(tx, cid);
      if (enc.currentId) fail("End the current turn first");
      const c = enc.combatants.find((x) => x.id === a.id) ?? fail("Combatant not found");
      if (isOut(state, c)) fail(c.kind === "pc" ? "Dead: no more Turns (p.193)" : "Slain: no more Turns (p.324)");
      if (c.acted) fail("Already acted this round");
      if (c.ambushed && enc.round === 1) fail("Ambushed: no turn in Round 1 (pay 1 Glory/Ruin to be aware)");
      const side = sideOf(c);
      const up = sideUpNext(state);
      const sideName = (x: Side) => (x === "agents" ? "Agents" : "Threats");
      if (a.type === "turn.seize") {
        if (!canSeize(state, side))
          fail(enc.seizedSide === side ? "Already Seized: the other side acts next"
            : up === side ? `No need to Seize: the ${sideName(side)} act next anyway`
            : "Seizing lets the side that just acted go again");
        await spend(tx, { campaignId: cid, side });
        await tx.update(encounter).set({ currentId: a.id, seizedSide: side }).where(eq(encounter.id, enc.id));
      } else {
        // Normal order: the other side, unless it has no one left (p.177).
        if (side !== up) fail(`It's the ${sideName(up ?? side)}' turn; Seize to go out of order`);
        await tx.update(encounter).set({ currentId: a.id }).where(eq(encounter.id, enc.id));
      }
      return { ok: true };
    }

    case "turn.end": {
      const { state, enc } = await liveTable(tx, cid);
      const current = enc.combatants.find((x) => x.id === enc.currentId) ?? fail("No one is taking a turn");
      const side = sideOf(current);
      await tx.update(combatant).set({ acted: true }).where(eq(combatant.id, current.id));
      // A Seize holds until the other side acts.
      await tx.update(encounter)
        .set({ currentId: null, lastSide: side, seizedSide: enc.seizedSide === side ? side : null })
        .where(eq(encounter.id, enc.id));
      // The Round ends once everyone able to act has had a Turn (p.176). canAct already excludes the current
      // combatant, the Slain and the Dead.
      if (!enc.combatants.some((x) => canAct(state, x))) await newRound(tx, { encounterId: enc.id, round: enc.round });
      return { ok: true };
    }

    case "combatant.addThreat": {
      const t = threats.get(a.threatId) ?? fail(`Unknown threat "${a.threatId}"`);
      const enc = await activeEncounter(tx, cid);
      const tier = await campaignTier(tx, cid);
      return { ok: true, id: await addThreat(tx, { encounterId: enc.id, tier, threat: t, label: a.label, mobCount: a.mobCount, marker: a.marker }) };
    }

    case "combatant.addCharacter": {
      await ownCharacter(tx, { campaignId: cid, id: a.characterId });
      const enc = await activeEncounter(tx, cid);
      const [dup] = await tx.select({ id: combatant.id }).from(combatant)
        .where(and(eq(combatant.encounterId, enc.id), eq(combatant.characterId, a.characterId)));
      if (dup) fail("Already in this encounter");
      return { ok: true, id: await addPc(tx, { encounterId: enc.id, characterId: a.characterId }) };
    }

    case "combatant.update": {
      const enc = await activeEncounter(tx, cid);
      const { type, id, ambushed, ...threatOnly } = a;
      const where = and(eq(combatant.id, id), eq(combatant.encounterId, enc.id));
      if (ambushed !== undefined) {
        const r = await tx.update(combatant).set({ ambushed }).where(where).returning({ id: combatant.id });
        if (!r.length) fail("Combatant not found");
      }
      if (Object.keys(threatOnly).length) {
        // Setting a Mob's size by hand raises its starting size too, so the half-slain prompt and the healing cap
        // (p.325) follow; null turns it back into a single Threat.
        const mobStart = threatOnly.mobCount === undefined ? {}
          : { mobStart: threatOnly.mobCount === null ? null : sql`greatest(coalesce(${combatant.mobStart}, 0), ${threatOnly.mobCount})` };
        const r = await tx.update(combatant).set({ ...threatOnly, ...mobStart }).where(and(where, eq(combatant.kind, "threat"))).returning({ id: combatant.id });
        if (!r.length) fail("Threat combatant not found");
      }
      return { ok: true };
    }

    case "combatant.adjust": {
      const enc = await activeEncounter(tx, cid);
      const [c] = await tx.select().from(combatant)
        .where(and(eq(combatant.id, a.id), eq(combatant.encounterId, enc.id), eq(combatant.kind, "threat")));
      if (!c) fail("Threat combatant not found");
      // Threat rows always carry a stat snapshot (see addThreat).
      if (a.shock && c.statSnapshot!.shock === null) fail("This Threat never suffers Shock (p.324)");
      // Mob (p.325): every member has 1 Wound, so Wounds remove members and healing restores them, up to the starting
      // size. More Shock in one hit than the members' Maximum Shock removes one member; less has no effect, and a Mob
      // keeps no Shock track.
      const maxShock = c.statSnapshot!.shock;
      const mobLoss = (a.wounds ?? 0) + (a.shock !== undefined && maxShock !== null && a.shock > maxShock ? 1 : 0);
      const damage = c.mobCount !== null
        ? { mobCount: sql`least(${c.mobStart ?? c.mobCount}, greatest(0, ${combatant.mobCount} - ${mobLoss}))` }
        : { wounds: bump(combatant.wounds, a.wounds), shock: bump(combatant.shock, a.shock) };
      await tx.update(combatant)
        .set({ ...damage, personalRuin: bump(combatant.personalRuin, a.personalRuin) })
        .where(eq(combatant.id, a.id));
      return { ok: true };
    }

    // Pay 1 Glory/Ruin so an ambushed combatant acts normally in Round 1 (p.177).
    case "combatant.aware": {
      const enc = await activeEncounter(tx, cid);
      const [c] = await tx.select().from(combatant).where(and(eq(combatant.id, a.id), eq(combatant.encounterId, enc.id)));
      if (!c) fail("Combatant not found");
      if (!c.ambushed) fail("Not ambushed");
      await spend(tx, { campaignId: cid, side: sideOfKind(c.kind) });
      await tx.update(combatant).set({ ambushed: false }).where(eq(combatant.id, a.id));
      return { ok: true };
    }

    case "combatant.remove": {
      const enc = await activeEncounter(tx, cid);
      const r = await tx.delete(combatant).where(and(eq(combatant.id, a.id), eq(combatant.encounterId, enc.id))).returning({ id: combatant.id });
      return r.length ? { ok: true } : fail("Combatant not found"); // current_id is cleared by the FK
    }

    // Start the beat's prepared encounter: every party character plus its threats.
    case "beat.startEncounter": {
      const [b] = await tx.select().from(beat).where(and(eq(beat.id, a.id), eq(beat.campaignId, cid)));
      if (!b) fail("Beat not found");
      const entries = EncounterEntry.array().parse(b.encounter);
      const missing = entries.find((e) => !threats.has(e.threatId));
      if (missing) fail(`Unknown threat "${missing.threatId}"`);
      const tier = await campaignTier(tx, cid);
      const encounterId = await startEncounter(tx, cid);
      for (const ch of await tx.select({ id: character.id }).from(character).where(eq(character.campaignId, cid)))
        await addPc(tx, { encounterId, characterId: ch.id });
      for (const e of entries) {
        const t = threats.get(e.threatId)!; // every entry was checked against `threats` above
        if (e.asMob && e.count > 1) await addThreat(tx, { encounterId, tier, threat: t, label: e.label, mobCount: e.count, marker: e.marker });
        else for (let i = 0; i < e.count; i++)
          await addThreat(tx, { encounterId, tier, threat: t, label: e.count > 1 ? `${e.label ?? t.name} ${i + 1}` : e.label, marker: e.marker });
      }
      await tx.update(beat).set({ status: "active" }).where(eq(beat.id, b.id));
      return { ok: true, id: encounterId };
    }
  }
}
