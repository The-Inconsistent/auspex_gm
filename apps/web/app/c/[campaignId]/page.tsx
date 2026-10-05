import { FlavourTable, FrameworkCatalogue, Me, NpcPreset, Threat, Wargear } from "@wg/shared";

import { JOIN_ERRORS, NO_ACCESS } from "@/app/constants";
import { apiGet, loadFactionPresets, loadPlaces, loadRules, loadScenePresets } from "@/app/server-api";
import { asGmTab, TAB_PARAM } from "@/components/gm/gm-app/constants";
import { GmApp } from "@/components/gm/gm-app/gm-app";
import { PlayerApp } from "@/components/player/player-app/player-app";
import { TableScreen } from "@/components/screen/table-screen/table-screen";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";

type TableProps = {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

// GM bestiary for the add-threat pickers, sorted by name. Empty on failure; the pickers just show nothing.
async function loadBestiary(campaignId: string): Promise<Threat[]> {
  try {
    const res = await apiGet(`/api/campaigns/${campaignId}/threats`);
    const parsed = Threat.array().safeParse(res.ok ? await res.json() : null);
    return parsed.success ? parsed.data.sort((a, b) => a.name.localeCompare(b.name)) : [];
  } catch {
    return [];
  }
}

// GM Wargear catalogue for the requisition form, sorted by name. Empty on failure; the form then takes typed entries.
async function loadWargear(campaignId: string): Promise<Wargear[]> {
  try {
    const res = await apiGet(`/api/campaigns/${campaignId}/wargear`);
    const parsed = Wargear.array().safeParse(res.ok ? await res.json() : null);
    return parsed.success ? parsed.data.sort((a, b) => a.name.localeCompare(b.name)) : [];
  } catch {
    return [];
  }
}

// GM-only printed patrons and Frameworks for SETUP's picker (issue #45). Empty on failure; the picker then lists none.
async function loadFrameworks(campaignId: string): Promise<FrameworkCatalogue> {
  try {
    const res = await apiGet(`/api/campaigns/${campaignId}/frameworks`);
    const parsed = FrameworkCatalogue.safeParse(res.ok ? await res.json() : null);
    return parsed.success ? parsed.data : { patrons: [], frameworks: [] };
  } catch {
    return { patrons: [], frameworks: [] };
  }
}

// GM-only printed NPCs for CODEX › NPCS' ADD FROM BOOK (issue #47). Empty on failure; the picker then hides.
async function loadNpcPresets(campaignId: string): Promise<NpcPreset[]> {
  try {
    const res = await apiGet(`/api/campaigns/${campaignId}/npc-presets`);
    const parsed = NpcPreset.array().safeParse(res.ok ? await res.json() : null);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

// GM-only name and appearance tables for CODEX › NPCS' ROLL NAME and ROLL LOOK (issue #48). Empty on failure; the
// editor then shows no roll buttons.
async function loadFlavour(campaignId: string): Promise<FlavourTable[]> {
  try {
    const res = await apiGet(`/api/campaigns/${campaignId}/flavour`);
    const parsed = FlavourTable.array().safeParse(res.ok ? await res.json() : null);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

// One table: the GM board, the player view or the table screen, by the caller's seat (membership or guest QR).
export default async function Table({ params, searchParams }: TableProps) {
  const [p, query] = await Promise.all([params, searchParams]);
  const campaignId = encodeURIComponent(p.campaignId);
  let me: Me;
  try {
    const res = await apiGet(`/api/campaigns/${campaignId}/me`);
    if (res.status === 400 || res.status === 401) return <StatusScreen text={NO_ACCESS} />;
    const parsed = Me.safeParse(res.ok ? await res.json() : null);
    if (!parsed.success) return <StatusScreen text={JOIN_ERRORS.nosignal} />;
    me = parsed.data;
  } catch {
    return <StatusScreen text={JOIN_ERRORS.nosignal} />;
  }

  if (me.role === "gm") {
    const [bestiary, wargear, rules, presets, frameworks, factionPresets, npcPresets, flavour, places] =
      await Promise.all([
        loadBestiary(me.campaignId),
        loadWargear(me.campaignId),
        loadRules(me.campaignId),
        loadScenePresets(me.campaignId),
        loadFrameworks(me.campaignId),
        loadFactionPresets(me.campaignId),
        loadNpcPresets(me.campaignId),
        loadFlavour(me.campaignId),
        loadPlaces(me.campaignId),
      ]);
    return (
      <GmApp
        campaignId={me.campaignId}
        bestiary={bestiary}
        wargear={wargear}
        rules={rules}
        presets={presets}
        frameworks={frameworks}
        factionPresets={factionPresets}
        npcPresets={npcPresets}
        flavour={flavour}
        places={places}
        initialTab={asGmTab(query[TAB_PARAM])}
      />
    );
  }
  // The TV in the middle of the table: a guest "screen" seat, read-only, no character.
  if (me.role === "screen") return <TableScreen campaignId={me.campaignId} />;
  if (!me.characterId) return <StatusScreen text="NO CHARACTER YET. ASK YOUR GM." />;
  return <PlayerApp campaignId={me.campaignId} characterId={me.characterId} rules={await loadRules(me.campaignId)} />;
}
