import { randomUUID, timingSafeEqual } from "node:crypto";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import type { AuthUser } from "@wg/auth/api";
import { rulesList, scenePresets, threats, wargear } from "@wg/data";
import { CharacterStats } from "@wg/shared";
import type { CampaignExport, Lobby, LobbyGame, Role, RuleEntry, ScenePresets, Threat, Wargear } from "@wg/shared";
import { appUser, membership } from "../auth/auth.schema.ts";
import { character } from "../character/character.schema.ts";
import { checkHazards, checkThreats } from "../codex/codex.actions.ts";
import { adventure, beat, faction, handout, location, npc } from "../codex/codex.schema.ts";
import { db, type Tx } from "../core/db.ts";
import { fail } from "../core/errors.ts";
import { listLibrary } from "../library/library.service.ts";
import { loadCodex, loadState } from "../table/table.state.ts";
import { campaign, session } from "./campaign.schema.ts";

// Constant-time compare against ADMIN_KEY (scripts only; people sign in with Clerk).
export function isAdmin(key: string | undefined) {
  const expected = process.env.ADMIN_KEY;
  if (!expected || !key) return false;
  const a = Buffer.from(key),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// A new campaign with its creator seated as GM. `owner.name` is a placeholder until they next sign in. `fill` writes
// the rest of an imported campaign in the same transaction.
export function createCampaign({
  owner,
  fill,
  ...values
}: Omit<typeof campaign.$inferInsert, "id" | "createdAt"> & {
  owner: { userId: string; name: string } | null;
  fill?: (tx: Tx, campaignId: string) => Promise<void>;
}) {
  return db.transaction(async (tx) => {
    const [c] = await tx.insert(campaign).values(values).returning({ id: campaign.id });
    const campaignId = c!.id; // the row was just inserted
    if (owner) {
      await tx.insert(appUser).values({ id: owner.userId, name: owner.name }).onConflictDoNothing();
      await tx.insert(membership).values({ campaignId, userId: owner.userId, role: "gm" });
    }
    await fill?.(tx, campaignId);
    return { campaignId };
  });
}

// EXPORT: what the GM app holds, minus the seats, the running fight and the builder drafts (a device's, not the sheet).
export async function exportCampaign(campaignId: string): Promise<CampaignExport> {
  const [state, codex, stored] = await Promise.all([
    loadState(campaignId),
    loadCodex(campaignId),
    db.select({ id: character.id, stats: character.stats }).from(character).where(eq(character.campaignId, campaignId)),
  ]);
  if (!state) fail("Campaign not found");
  // The sheets as stored, not as the table shows them: the state's have the upgrades and weapon effects applied
  // (withUpgrades, withWeaponEffects), and an import would store those and apply them again on read.
  const statsOf = new Map(stored.map((r) => [r.id, CharacterStats.parse(r.stats)]));
  const { id: _, ...camp } = state.campaign;
  return {
    format: "auspex-campaign",
    version: 1,
    exportedAt: new Date().toISOString(),
    campaign: camp,
    // A saved build passed CharacterBuild on its way in; the state type only keeps it loose.
    characters: state.characters.map(({ draft: _, build, ...c }) => ({
      ...c,
      stats: statsOf.get(c.id) ?? c.stats,
      build: build as CampaignExport["characters"][number]["build"],
    })),
    codex,
  };
}

// IMPORT GAME: a campaign file (CampaignExport) as a new campaign. Every row gets a fresh id, and references are
// remapped through those; one that points outside the file is dropped. Direct inserts in one transaction rather than
// replayed actions, which would lose the counters, sessions and reveal times a backup has to keep.
export async function importCampaign({
  file,
  owner,
}: {
  file: CampaignExport;
  owner: { userId: string; name: string };
}) {
  const { codex: c } = file;
  // Beats belong to the adventure they're filed under, whatever their own adventureId says.
  const beats = c.adventures.flatMap((a) => a.beats.map((b) => ({ ...b, adventureId: a.id })));
  // Same check as codex.save: a file from a server with other threat data would leave beats that can't start.
  checkThreats([
    ...beats.flatMap((b) => b.encounter.map((e) => e.threatId)),
    ...c.npcs.flatMap((n) => (n.statSource.kind === "bestiary" ? [n.statSource.threatId] : [])),
  ]);
  checkHazards(c.locations.flatMap((l) => l.hazardList));
  // A scene keeps only the picks its place lists, as codex.save does (§11.95).
  const listed = new Map(c.locations.map((l) => [l.id, new Set(l.hazardList.map((h) => h.id))]));

  const rows = [...file.characters, ...c.factions, ...c.adventures, ...beats, ...c.locations, ...c.npcs, ...c.handouts];
  const ids = new Map(rows.map((r) => [r.id, randomUUID()]));
  if (ids.size !== rows.length) fail("That file repeats an id");
  // Like codex.save: an empty audience means every player, so an Agent missing from the file can't just be dropped.
  if (c.handouts.some((h) => h.audience.some((a) => !ids.has(a)))) fail("A handout's audience isn't in that file");
  const ref = (old: string | null) => (old && ids.get(old)) || null;
  const refs = (old: string[]) => old.flatMap((o) => ids.get(o) ?? []);
  const at = (iso: string | null) => (iso ? new Date(iso) : null);
  // An exit keeps its target only inside its own adventure, as codex.save checks.
  const adventureOf = new Map(beats.map((b) => [b.id, b.adventureId]));

  return createCampaign({
    ...file.campaign,
    owner,
    fill: async (tx, campaignId) => {
      // Lists load in createdAt order, and now() is the same for the whole transaction, so each row gets its place in
      // the file as its own millisecond. The id is in the map because every row went into it above.
      const t0 = Date.now();
      const own = <T extends { id: string }>(r: T, i: number) => ({
        ...r,
        id: ids.get(r.id)!,
        campaignId,
        createdAt: new Date(t0 + i),
      });
      // In reference order; one statement per table, so a location can name a parent from the same insert.
      if (file.characters.length)
        await tx.insert(character).values(
          file.characters.map((ch, i) => ({
            ...own(ch, i),
            builtAt: ch.builtAt === null ? null : new Date(ch.builtAt),
          })),
        );
      if (c.factions.length) await tx.insert(faction).values(c.factions.map(own));
      if (c.locations.length)
        await tx.insert(location).values(c.locations.map((l, i) => ({ ...own(l, i), parentId: ref(l.parentId) })));
      if (c.npcs.length)
        await tx.insert(npc).values(c.npcs.map((n, i) => ({ ...own(n, i), factionId: ref(n.factionId) })));
      if (c.handouts.length)
        await tx
          .insert(handout)
          .values(
            c.handouts.map((h, i) => ({ ...own(h, i), revealedAt: at(h.revealedAt), audience: refs(h.audience) })),
          );
      if (c.adventures.length)
        await tx.insert(adventure).values(c.adventures.map(({ beats: _, ...a }, i) => own(a, i)));
      if (beats.length)
        await tx.insert(beat).values(
          beats.map((b, i) => ({
            ...own(b, i),
            adventureId: ids.get(b.adventureId)!, // its adventure's id, from the same map
            locationId: ref(b.locationId),
            npcIds: refs(b.npcIds),
            handoutIds: refs(b.handoutIds),
            hazards: b.hazards.filter((h) => b.locationId && listed.get(b.locationId)?.has(h.id)),
            exits: b.exits.map((e) => ({
              ...e,
              beatId: e.beatId && adventureOf.get(e.beatId) === b.adventureId ? ref(e.beatId) : null,
            })),
          })),
        );
      if (c.sessions.length)
        await tx.insert(session).values(
          c.sessions.map(({ id: _, startedAt, endedAt, ...s }) => ({
            ...s,
            campaignId,
            startedAt: new Date(startedAt),
            endedAt: at(endedAt),
          })),
        );
    },
  });
}

// The lobby: the caller's games, and every game with a session in progress (as cards only; opening one needs a seat).
export async function lobby(user: AuthUser): Promise<Lobby> {
  // `characters` is their own library (issue #14): it belongs to no game, so it's listed whether or not they have a
  // seat anywhere.
  const [mine, running, characters] = await Promise.all([
    db
      .select({ campaignId: membership.campaignId, role: membership.role })
      .from(membership)
      .where(eq(membership.userId, user.userId)),
    db.select({ campaignId: session.campaignId, number: session.number }).from(session).where(isNull(session.endedAt)),
    listLibrary(user.userId),
  ]);
  const ids = [...new Set([...mine, ...running].map((r) => r.campaignId))];
  if (!ids.length) return { canCreate: user.creator, mine: [], running: [], characters };

  const [camps, gms, players] = await Promise.all([
    db
      .select({ id: campaign.id, name: campaign.name, tier: campaign.tier })
      .from(campaign)
      .where(inArray(campaign.id, ids)),
    db
      .select({ campaignId: membership.campaignId, name: appUser.name })
      .from(membership)
      .innerJoin(appUser, eq(appUser.id, membership.userId))
      .where(and(inArray(membership.campaignId, ids), eq(membership.role, "gm"))),
    db
      .select({ campaignId: character.campaignId, n: count() })
      .from(character)
      .where(inArray(character.campaignId, ids))
      .groupBy(character.campaignId),
  ]);
  const roleOf = new Map<string, Role>(mine.map((m) => [m.campaignId, m.role]));
  const card = (id: string): LobbyGame | null => {
    const c = camps.find((x) => x.id === id);
    if (!c) return null;
    return {
      ...c,
      gm:
        gms
          .filter((g) => g.campaignId === id)
          .map((g) => g.name)
          .join(", ") || "—",
      players: players.find((p) => p.campaignId === id)?.n ?? 0,
      session: running.find((r) => r.campaignId === id)?.number ?? null,
      role: roleOf.get(id) ?? null,
    };
  };
  const cards = (list: { campaignId: string }[]) =>
    list.map((r) => card(r.campaignId)).filter((g): g is LobbyGame => !!g);
  return { canCreate: user.creator, mine: cards(mine), running: cards(running), characters };
}

// Whether the campaign's character builder may use the homebrew books (a REST read, outside any action).
export async function campaignHomebrew(campaignId: string) {
  const [c] = await db.select({ homebrew: campaign.homebrew }).from(campaign).where(eq(campaign.id, campaignId));
  return c?.homebrew ?? false;
}

export const listThreats = (): Threat[] => [...threats.values()];
export const listWargear = (): Wargear[] => [...wargear.values()];
const presets = scenePresets(); // parsed at startup, so a bad file fails fast
export const listScenePresets = (): ScenePresets => presets;
const rules = rulesList(); // parsed at startup, so a bad file fails fast
// Entries flagged `gm` come from the Gamemaster chapter, so a player seat (or the seatless builder) never gets them.
export const listRules = ({ gm }: { gm: boolean }): RuleEntry[] => (gm ? rules : rules.filter((r) => !r.gm));
