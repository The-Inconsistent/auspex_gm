import { randomUUID, timingSafeEqual } from "node:crypto";
import { and, count, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";
import type { AuthUser } from "@wg/auth/api";
import { rulesList, scenePresets, threats, wargear } from "@wg/data";
import { CharacterStats, CUSTOM_PREFIX, isCustomThreatId, MAX_SLUG, remapMentions, wouldCycle } from "@wg/shared";
import type { CampaignExport, Lobby, LobbyGame, Role, RuleEntry, ScenePresets, Threat, Wargear } from "@wg/shared";
import { appUser, membership } from "../auth/auth.schema.ts";
import { character } from "../character/character.schema.ts";
import { checkHazards, checkHolder, checkWargear } from "../codex/codex.actions.ts";
import { customThreat } from "../threat/threat.schema.ts";
import { CUSTOM_THREAT_CAP } from "../threat/threat.service.ts";
import { adventure, beat, faction, handout, item, location, npc } from "../codex/codex.schema.ts";
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
  const { id: _, archived: _archived, ...camp } = state.campaign; // an import starts a live game
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
  // Same check as codex.save, but the campaign doesn't exist yet, so it runs against the bestiary plus the file's own
  // custom threats (issue #43) rather than through `loadThreats`.
  const customs = c.customThreats;
  // A slug is a row's identity here (`custom_threat` is unique per campaign and slug), and the id carries it, so a
  // file naming one twice has to be refused with a reason: the insert below would otherwise raise a constraint error,
  // which is not an ActionError and would answer 500 instead of 400. An id of `custom-` alone passes `Threat`'s regex
  // and would leave a row with an empty slug, so it is refused with the rest.
  // A slug longer than `threat.save` and `threat.delete` accept would import a threat the GM could never edit or delete.
  const slugOf = (id: string) => id.slice(CUSTOM_PREFIX.length);
  if (
    customs.some(
      (t) => !isCustomThreatId(t.id) || t.source !== "custom" || !slugOf(t.id) || slugOf(t.id).length > MAX_SLUG,
    )
  )
    fail("A custom threat in that file isn't a custom threat");
  if (customs.length > CUSTOM_THREAT_CAP) fail(`At most ${CUSTOM_THREAT_CAP} custom threats per campaign`);
  const customIds = new Set(customs.map((t) => t.id));
  if (customIds.size !== customs.length) fail("That file repeats a custom threat");
  const known = new Set([...threats.keys(), ...customIds]);
  const unknown = [
    ...beats.flatMap((b) => b.encounter.map((e) => e.threatId)),
    ...c.npcs.flatMap((n) => (n.statSource.kind === "bestiary" ? [n.statSource.threatId] : [])),
  ].find((t) => !known.has(t));
  if (unknown) fail(`Unknown threat "${unknown}"`);
  checkHazards(c.locations.flatMap((l) => l.hazardList));
  // Items as codex.save checks them (issue #51): a known catalogue entry, one holder, and none once given.
  checkWargear(c.items.map((i) => i.wargearId));
  for (const i of c.items) {
    checkHolder(i);
    if (i.givenTo && (i.locationId || i.npcId)) fail(`${i.name} is with an Agent and has a holder too`);
  }
  // Packs can't nest a place inside itself (parents come first), but a hand-edited file can (issue #50).
  const parentOf = new Map(c.locations.map((l) => [l.id, l.parentId]));
  if (c.locations.some((l) => wouldCycle({ id: l.id, parentId: l.parentId, parentOf })))
    fail("That file nests a place inside itself");
  // A scene keeps only the picks its place lists, as codex.save does (§11.95).
  const listed = new Map(c.locations.map((l) => [l.id, new Set(l.hazardList.map((h) => h.id))]));

  const rows = [
    ...file.characters,
    ...c.factions,
    ...c.adventures,
    ...beats,
    ...c.locations,
    ...c.npcs,
    ...c.handouts,
    ...c.items,
  ];
  const ids = new Map(rows.map((r) => [r.id, randomUUID()]));
  if (ids.size !== rows.length) fail("That file repeats an id");
  // Like codex.save: an empty audience means every player, so an Agent missing from the file can't just be dropped.
  if (c.handouts.some((h) => h.audience.some((a) => !ids.has(a)))) fail("A handout's audience isn't in that file");
  const ref = (old: string | null) => (old && ids.get(old)) || null;
  const refs = (old: string[]) => old.flatMap((o) => ids.get(o) ?? []);
  const at = (iso: string | null) => (iso ? new Date(iso) : null);
  // A codex mention carries a row id (issue #200), so every text that may hold one follows the same map.
  const remapText = <T extends object>(r: T): T =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" ? remapMentions(v, ids) : v])) as T;
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
        ...remapText(r),
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
      // Before the beats and NPCs that name them, though nothing in the database points at one: the id is the slug.
      // These keep their own `createdAt` millisecond like every other list, since `loadCustomThreats` loads them in
      // that order; they can't use `own()`, which renames a row by its id, because theirs is the slug the file brought.
      if (customs.length)
        await tx.insert(customThreat).values(
          customs.map((t, i) => ({
            campaignId,
            slug: t.id.slice(CUSTOM_PREFIX.length),
            data: t,
            createdAt: new Date(t0 + i),
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
      if (c.items.length)
        await tx.insert(item).values(
          c.items.map((it, i) => ({
            ...own(it, i),
            locationId: ref(it.locationId),
            npcId: ref(it.npcId),
            givenTo: ref(it.givenTo),
          })),
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
            itemIds: refs(b.itemIds),
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
            ...remapText(s),
            campaignId,
            startedAt: new Date(startedAt),
            endedAt: at(endedAt),
          })),
        );
    },
  });
}

// A session open longer than this is one nobody closed, so the lobby stops advertising the game as running.
const STALE_SESSION_HOURS = 18;

// The lobby: the caller's games, and every game with a session in progress (as cards only; opening one needs a seat).
// Archived games are only listed, apart, for their own members.
export async function lobby(user: AuthUser): Promise<Lobby> {
  // `characters` is their own library (issue #14): it belongs to no game, so it's listed whether or not they have a
  // seat anywhere.
  const [mine, running, characters] = await Promise.all([
    db
      .select({ campaignId: membership.campaignId, role: membership.role })
      .from(membership)
      .where(eq(membership.userId, user.userId)),
    db
      .select({ campaignId: session.campaignId, number: session.number })
      .from(session)
      .where(
        and(isNull(session.endedAt), gt(session.startedAt, new Date(Date.now() - STALE_SESSION_HOURS * 3600_000))),
      ),
    listLibrary(user.userId),
  ]);
  const ids = [...new Set([...mine, ...running].map((r) => r.campaignId))];
  if (!ids.length)
    return { canCreate: user.creator, admin: user.admin, mine: [], running: [], archived: [], characters };

  const [camps, gms, players] = await Promise.all([
    db
      .select({ id: campaign.id, name: campaign.name, tier: campaign.tier, archived: isNotNull(campaign.archivedAt) })
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
  const archivedIds = new Set(camps.filter((c) => c.archived).map((c) => c.id));
  const card = (id: string): LobbyGame | null => {
    const c = camps.find((x) => x.id === id);
    if (!c) return null;
    return {
      id: c.id,
      name: c.name,
      tier: c.tier,
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
  const cards = (list: { campaignId: string }[], archived: boolean) =>
    list
      .filter((r) => archivedIds.has(r.campaignId) === archived)
      .map((r) => card(r.campaignId))
      .filter((g): g is LobbyGame => !!g);
  return {
    canCreate: user.creator,
    admin: user.admin,
    mine: cards(mine, false),
    running: cards(running, false),
    archived: cards(mine, true),
    characters,
  };
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
