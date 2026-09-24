import { and, count, eq, isNull, max, not, sql, type AnyColumn } from "drizzle-orm";
import {
  CharacterStats, EncounterEntry, Overrides, PLAYER_ACTIONS, canSeize, deriveStats, poolMax, threatClassAt,
  type Action, type ActionResult, type Marker, type Side, type Threat,
} from "@wg/shared";
import { threats } from "@wg/data";
import { issueToken, type Ctx } from "./auth.ts";
import type { Tx } from "./db.ts";
import {
  accessToken, adventure, beat, campaign, character, combatant, encounter, faction, handout, location, npc, session,
} from "./schema.ts";

export class ActionError extends Error {}
const fail = (msg: string): never => {
  throw new ActionError(msg);
};

// Which snapshot an action changes, so the gateway only rebroadcasts what moved.
export function touches(a: Action): { state: boolean; codex: boolean } {
  if (a.type === "codex.save" || a.type === "codex.delete" || a.type === "beat.reorder") return { state: false, codex: true };
  if (a.type === "beat.startEncounter" || a.type.startsWith("session.")) return { state: true, codex: true };
  return { state: true, codex: false };
}

// Counters never drop below 0.
const bump = (col: AnyColumn, d: number | undefined) => (d === undefined ? undefined : sql`greatest(0, ${col} + ${d})`);
const sideOfKind = (kind: "pc" | "threat"): Side => (kind === "pc" ? "agents" : "threats");

function authorize(ctx: Ctx, a: Action) {
  if (ctx.role === "gm") return;
  if (!PLAYER_ACTIONS.has(a.type)) fail("GM only");
  if ((a.type === "character.update" || a.type === "character.adjust" || a.type === "character.respite") && a.id !== ctx.characterId)
    fail("Not your character");
  if (a.type === "character.update" && a.overrides) fail("Overrides are GM only");
  if (a.type === "character.adjust" && a.traumatic !== undefined) fail("GM only");
  if (a.type === "pool.adjust" && a.pool !== "glory") fail("GM only");
}

async function activeEncounter(tx: Tx, campaignId: string) {
  const [enc] = await tx.select().from(encounter).where(and(eq(encounter.campaignId, campaignId), eq(encounter.active, true)));
  return enc ?? fail("No active encounter");
}

async function ownCharacter(tx: Tx, campaignId: string, id: string) {
  const [c] = await tx.select().from(character).where(and(eq(character.id, id), eq(character.campaignId, campaignId)));
  return c ?? fail("Character not found");
}

async function campaignTier(tx: Tx, campaignId: string) {
  const [c] = await tx.select({ tier: campaign.tier }).from(campaign).where(eq(campaign.id, campaignId));
  return c!.tier;
}

async function playerCount(tx: Tx, campaignId: string) {
  const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(character).where(eq(character.campaignId, campaignId));
  return n;
}

// Spend 1 Glory (Agents) or Ruin (Threats); fails if the pool is empty.
async function spend(tx: Tx, campaignId: string, side: Side) {
  const col = side === "agents" ? campaign.glory : campaign.ruin;
  const r = await tx.update(campaign).set({ [side === "agents" ? "glory" : "ruin"]: sql`${col} - 1` })
    .where(and(eq(campaign.id, campaignId), sql`${col} > 0`)).returning({ id: campaign.id });
  if (!r.length) fail(side === "agents" ? "No Glory to spend" : "No Ruin to spend");
}

async function nextOrder(tx: Tx, encounterId: string) {
  const [{ m } = { m: null }] = await tx.select({ m: max(combatant.order) }).from(combatant).where(eq(combatant.encounterId, encounterId));
  return (m ?? -1) + 1;
}

async function addThreat(tx: Tx, encounterId: string, tier: number, t: Threat, o: { label?: string; mobCount?: number; marker?: Marker }) {
  const [c] = await tx
    .insert(combatant)
    .values({
      encounterId,
      order: await nextOrder(tx, encounterId),
      kind: "threat",
      threatId: t.id,
      threatClass: threatClassAt(t, tier),
      statSnapshot: t,
      label: o.label ?? (o.mobCount ? `${t.name} ×${o.mobCount}` : t.name),
      mobCount: o.mobCount ?? null,
      mobStart: o.mobCount ?? null,
      personalRuin: t.personalRuin ?? 0,
      marker: o.marker ?? null,
    })
    .returning({ id: combatant.id });
  return c!.id;
}

async function addPc(tx: Tx, encounterId: string, characterId: string) {
  const [c] = await tx.insert(combatant)
    .values({ encounterId, order: await nextOrder(tx, encounterId), kind: "pc", characterId })
    .returning({ id: combatant.id });
  return c!.id;
}

async function startEncounter(tx: Tx, campaignId: string) {
  await tx.update(encounter).set({ active: false }).where(eq(encounter.campaignId, campaignId));
  const [e] = await tx.insert(encounter).values({ campaignId }).returning({ id: encounter.id });
  return e!.id;
}

// Everyone gets a Turn each Round; the players pick first again; ambush only applies to Round 1 (p.176-177).
async function newRound(tx: Tx, encounterId: string, round: number) {
  await tx.update(combatant).set({ acted: false, ambushed: false }).where(eq(combatant.encounterId, encounterId));
  await tx.update(encounter).set({ round: round + 1, currentId: null, lastSide: null, seizedSide: null }).where(eq(encounter.id, encounterId));
}

const codexTable = { faction, adventure, beat, location, npc, handout } as const;

export async function applyAction(tx: Tx, ctx: Ctx, a: Action): Promise<ActionResult> {
  authorize(ctx, a);
  const cid = ctx.campaignId;
  const inCampaign = (id: string) => and(eq(character.id, id), eq(character.campaignId, cid));

  switch (a.type) {
    case "campaign.update": {
      const { type, ...patch } = a;
      await tx.update(campaign).set(patch).where(eq(campaign.id, cid));
      return { ok: true };
    }

    case "pool.adjust": {
      const cap = poolMax(a.pool, await playerCount(tx, cid));
      await tx.update(campaign).set({ [a.pool]: sql`least(${cap}, ${bump(campaign[a.pool], a.delta)})` }).where(eq(campaign.id, cid));
      return { ok: true };
    }

    case "session.start": {
      const players = await playerCount(tx, cid);
      await tx.update(character).set({ wrath: 2 }).where(eq(character.campaignId, cid));
      await tx.update(campaign).set({ glory: 0, ruin: players }).where(eq(campaign.id, cid));
      await tx.update(session).set({ endedAt: new Date() }).where(and(eq(session.campaignId, cid), isNull(session.endedAt)));
      const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(session).where(eq(session.campaignId, cid));
      const [s] = await tx.insert(session).values({ campaignId: cid, number: n + 1 }).returning({ id: session.id });
      return { ok: true, id: s!.id };
    }

    case "session.end": {
      const [s] = await tx.select().from(session).where(and(eq(session.campaignId, cid), isNull(session.endedAt)));
      if (!s) fail("No session in progress");
      await tx.update(session).set({ endedAt: new Date(), recap: a.recap, xp: a.xp }).where(eq(session.id, s!.id));
      await tx.update(character).set({ xp: sql`${character.xp} + ${a.xp}` }).where(eq(character.campaignId, cid));
      return { ok: true };
    }

    case "character.create": {
      const [c] = await tx.insert(character).values({ campaignId: cid, name: a.name, stats: a.stats ?? {} }).returning({ id: character.id });
      return { ok: true, id: c!.id };
    }

    case "character.update": {
      const { type, id, ...patch } = a;
      if (Object.keys(patch).length === 0) return { ok: true };
      const r = await tx.update(character).set(patch).where(inCampaign(id)).returning({ id: character.id });
      return r.length ? { ok: true } : fail("Character not found");
    }

    case "character.adjust": {
      const r = await tx
        .update(character)
        .set({
          wounds: bump(character.wounds, a.wounds), shock: bump(character.shock, a.shock),
          wrath: bump(character.wrath, a.wrath), traumatic: bump(character.traumatic, a.traumatic),
        })
        .where(inCampaign(a.id))
        .returning({ id: character.id });
      return r.length ? { ok: true } : fail("Character not found");
    }

    case "character.respite": {
      const c = await ownCharacter(tx, cid, a.id);
      const d = deriveStats(CharacterStats.parse(c.stats), Overrides.parse(c.overrides), await campaignTier(tx, cid));
      if (c.wounds > d.maxWounds) fail("A Dying character can't benefit from a Respite (p.197)");
      await tx.update(character).set({ wounds: 0, shock: 0, wrath: 2 }).where(eq(character.id, a.id));
      return { ok: true };
    }

    case "character.delete": {
      const r = await tx.delete(character).where(inCampaign(a.id)).returning({ id: character.id });
      return r.length ? { ok: true } : fail("Character not found");
    }

    case "token.issue": {
      await ownCharacter(tx, cid, a.characterId);
      return { ok: true, token: await issueToken(tx, cid, "player", a.characterId) };
    }

    case "token.revoke":
      await ownCharacter(tx, cid, a.characterId);
      await tx.update(accessToken).set({ revokedAt: new Date() })
        .where(and(eq(accessToken.characterId, a.characterId), isNull(accessToken.revokedAt)));
      return { ok: true };

    case "encounter.start":
      return { ok: true, id: await startEncounter(tx, cid) };

    case "encounter.end":
      await tx.update(encounter).set({ active: false }).where(eq(encounter.campaignId, cid));
      return { ok: true };

    case "encounter.newRound": {
      const enc = await activeEncounter(tx, cid);
      await newRound(tx, enc.id, enc.round);
      return { ok: true };
    }

    case "turn.start":
    case "turn.seize": {
      const enc = await activeEncounter(tx, cid);
      if (enc.currentId) fail("End the current turn first");
      const [c] = await tx.select().from(combatant).where(and(eq(combatant.id, a.id), eq(combatant.encounterId, enc.id)));
      if (!c) fail("Combatant not found");
      if (c!.acted) fail("Already acted this round");
      if (c!.ambushed && enc.round === 1) fail("Ambushed: no turn in Round 1 (pay 1 Glory/Ruin to be aware)");
      const side = sideOfKind(c!.kind);
      if (a.type === "turn.seize") {
        if (!canSeize(enc, side))
          fail(enc.seizedSide === side ? "Already Seized: the other side acts next" : "Seizing lets the side that just acted go again");
        await spend(tx, cid, side);
        await tx.update(encounter).set({ currentId: a.id, seizedSide: side }).where(eq(encounter.id, enc.id));
      } else {
        // Normal order: the other side, unless it has no one left (p.177).
        const pending = await tx.select({ kind: combatant.kind, ambushed: combatant.ambushed }).from(combatant)
          .where(and(eq(combatant.encounterId, enc.id), not(combatant.acted)));
        const expected: Side = enc.lastSide === "agents" ? "threats" : "agents";
        const expectedCanAct = pending.some((p) => sideOfKind(p.kind) === expected && !(p.ambushed && enc.round === 1));
        if (side !== expected && expectedCanAct)
          fail(`It's the ${expected === "agents" ? "Agents'" : "Threats'"} turn; Seize to go out of order`);
        await tx.update(encounter).set({ currentId: a.id }).where(eq(encounter.id, enc.id));
      }
      return { ok: true };
    }

    case "turn.end": {
      const enc = await activeEncounter(tx, cid);
      if (!enc.currentId) fail("No one is taking a turn");
      const [c] = await tx.update(combatant).set({ acted: true }).where(eq(combatant.id, enc.currentId!)).returning({ kind: combatant.kind });
      const side = sideOfKind(c!.kind);
      // A Seize holds until the other side acts.
      await tx.update(encounter)
        .set({ currentId: null, lastSide: side, seizedSide: enc.seizedSide === side ? side : null })
        .where(eq(encounter.id, enc.id));
      // The Round ends once everyone able to act has had a Turn (p.176).
      const rest = await tx.select({ ambushed: combatant.ambushed }).from(combatant)
        .where(and(eq(combatant.encounterId, enc.id), not(combatant.acted)));
      if (rest.every((r) => r.ambushed && enc.round === 1)) await newRound(tx, enc.id, enc.round);
      return { ok: true };
    }

    case "combatant.addThreat": {
      const t = threats.get(a.threatId) ?? fail(`Unknown threat "${a.threatId}"`);
      const enc = await activeEncounter(tx, cid);
      return { ok: true, id: await addThreat(tx, enc.id, await campaignTier(tx, cid), t, a) };
    }

    case "combatant.addCharacter": {
      await ownCharacter(tx, cid, a.characterId);
      const enc = await activeEncounter(tx, cid);
      return { ok: true, id: await addPc(tx, enc.id, a.characterId) };
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
        const r = await tx.update(combatant).set(threatOnly).where(and(where, eq(combatant.kind, "threat"))).returning({ id: combatant.id });
        if (!r.length) fail("Threat combatant not found");
      }
      return { ok: true };
    }

    case "combatant.adjust": {
      const enc = await activeEncounter(tx, cid);
      const [c] = await tx.select().from(combatant)
        .where(and(eq(combatant.id, a.id), eq(combatant.encounterId, enc.id), eq(combatant.kind, "threat")));
      if (!c) fail("Threat combatant not found");
      if (a.shock && c!.statSnapshot!.shock === null) fail("This Threat never suffers Shock (p.324)");
      // Every member of a Mob has 1 Wound (p.325): Wounds remove members; healing restores them, up to the starting size.
      const damage = c!.mobCount !== null && a.wounds !== undefined
        ? { mobCount: sql`least(${c!.mobStart ?? c!.mobCount}, greatest(0, ${combatant.mobCount} - ${a.wounds}))` }
        : { wounds: bump(combatant.wounds, a.wounds) };
      await tx.update(combatant)
        .set({ ...damage, shock: bump(combatant.shock, a.shock), personalRuin: bump(combatant.personalRuin, a.personalRuin) })
        .where(eq(combatant.id, a.id));
      return { ok: true };
    }

    case "combatant.aware": {
      const enc = await activeEncounter(tx, cid);
      const [c] = await tx.select().from(combatant).where(and(eq(combatant.id, a.id), eq(combatant.encounterId, enc.id)));
      if (!c) fail("Combatant not found");
      if (!c!.ambushed) fail("Not ambushed");
      await spend(tx, cid, sideOfKind(c!.kind));
      await tx.update(combatant).set({ ambushed: false }).where(eq(combatant.id, a.id));
      return { ok: true };
    }

    case "combatant.remove": {
      const enc = await activeEncounter(tx, cid);
      const r = await tx.delete(combatant).where(and(eq(combatant.id, a.id), eq(combatant.encounterId, enc.id))).returning({ id: combatant.id });
      return r.length ? { ok: true } : fail("Combatant not found"); // current_id is cleared by the FK
    }

    case "codex.save": {
      // The per-kind shape was validated by CodexInput[kind]; the union just doesn't narrow `data` by `kind`.
      const table = codexTable[a.kind];
      const data: Record<string, unknown> = { ...a.data };
      if (a.kind === "beat") {
        const [adv] = await tx.select({ id: adventure.id }).from(adventure)
          .where(and(eq(adventure.id, data.adventureId as string), eq(adventure.campaignId, cid)));
        if (!adv) fail("Adventure not found");
      }
      if (a.kind === "handout") data.revealedAt = data.revealed ? sql`coalesce(${handout.revealedAt}, now())` : null;
      if (a.id) {
        const r = await tx.update(table).set(data as never).where(and(eq(table.id, a.id), eq(table.campaignId, cid))).returning({ id: table.id });
        return r.length ? { ok: true, id: a.id } : fail("Not found");
      }
      const [row] = await tx.insert(table).values({ ...data, campaignId: cid } as never).returning({ id: table.id });
      return { ok: true, id: row!.id };
    }

    case "codex.delete": {
      const table = codexTable[a.kind];
      const r = await tx.delete(table).where(and(eq(table.id, a.id), eq(table.campaignId, cid))).returning({ id: table.id });
      return r.length ? { ok: true } : fail("Not found");
    }

    case "beat.reorder": {
      const rows = await tx.select({ id: beat.id }).from(beat).where(and(eq(beat.adventureId, a.adventureId), eq(beat.campaignId, cid)));
      const ids = rows.map((r) => r.id);
      if (new Set(a.ids).size !== ids.length || !a.ids.every((x) => ids.includes(x))) fail("Reorder must list every beat exactly once");
      for (const [order, bid] of a.ids.entries()) await tx.update(beat).set({ order }).where(eq(beat.id, bid));
      return { ok: true };
    }

    // Start the beat's prepared encounter: every party character plus its threats.
    case "beat.startEncounter": {
      const [b] = await tx.select().from(beat).where(and(eq(beat.id, a.id), eq(beat.campaignId, cid)));
      if (!b) fail("Beat not found");
      const entries = EncounterEntry.array().parse(b!.encounter);
      const missing = entries.find((e) => !threats.has(e.threatId));
      if (missing) fail(`Unknown threat "${missing.threatId}"`);
      const tier = await campaignTier(tx, cid);
      const encId = await startEncounter(tx, cid);
      for (const ch of await tx.select({ id: character.id }).from(character).where(eq(character.campaignId, cid)))
        await addPc(tx, encId, ch.id);
      for (const e of entries) {
        const t = threats.get(e.threatId)!;
        if (e.asMob && e.count > 1) await addThreat(tx, encId, tier, t, { label: e.label, mobCount: e.count, marker: e.marker });
        else for (let i = 0; i < e.count; i++)
          await addThreat(tx, encId, tier, t, { label: e.count > 1 ? `${e.label ?? t.name} ${i + 1}` : e.label, marker: e.marker });
      }
      await tx.update(beat).set({ status: "active" }).where(eq(beat.id, b!.id));
      return { ok: true, id: encId };
    }
  }
}
