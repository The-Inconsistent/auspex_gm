import { Me, ScenePresets, Threat, Wargear } from "@wg/shared";

import { JOIN_ERRORS, NO_ACCESS } from "@/app/constants";
import { apiGet, loadRules } from "@/app/server-api";
import { GmApp } from "@/components/gm/gm-app/gm-app";
import { PlayerApp } from "@/components/player/player-app/player-app";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";

type TableProps = { params: Promise<{ campaignId: string }> };

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

// GM-only book data for building scenes (issue #39). Empty on failure; the scene editor then shows no examples.
async function loadScenePresets(campaignId: string): Promise<ScenePresets> {
  try {
    const res = await apiGet(`/api/campaigns/${campaignId}/scene-presets`);
    const parsed = ScenePresets.safeParse(res.ok ? await res.json() : null);
    return parsed.success ? parsed.data : { skillDns: [], tables: [] };
  } catch {
    return { skillDns: [], tables: [] };
  }
}

// One table: the GM board or the player view, by the caller's seat (membership or guest QR).
export default async function Table({ params }: TableProps) {
  const campaignId = encodeURIComponent((await params).campaignId);
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
    const [bestiary, wargear, rules, presets] = await Promise.all([
      loadBestiary(me.campaignId),
      loadWargear(me.campaignId),
      loadRules(me.campaignId),
      loadScenePresets(me.campaignId),
    ]);
    return <GmApp campaignId={me.campaignId} bestiary={bestiary} wargear={wargear} rules={rules} presets={presets} />;
  }
  if (!me.characterId) return <StatusScreen text="NO CHARACTER YET. ASK YOUR GM." />;
  return <PlayerApp campaignId={me.campaignId} characterId={me.characterId} rules={await loadRules(me.campaignId)} />;
}
