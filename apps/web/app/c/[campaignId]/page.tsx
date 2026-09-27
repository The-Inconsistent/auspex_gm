import { Me, Threat, Wargear } from "@wg/shared";

import { JOIN_ERRORS, NO_ACCESS } from "@/app/constants";
import { apiGet, loadCreation, loadRules } from "@/app/server-api";
import { GmApp } from "@/components/gm/gm-app/gm-app";
import { PlayerApp } from "@/components/player/player-app/player-app";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";
import { sheetRules } from "@/lib/sheet-rules/sheet-rules";

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
    const [bestiary, wargear, rules, creation] = await Promise.all([
      loadBestiary(me.campaignId),
      loadWargear(me.campaignId),
      loadRules(me.campaignId),
      loadCreation(me.campaignId),
    ]);
    // Only the Talents and Abilities reach the client, for PARTY's EDIT on a hand-made sheet; empty on failure.
    // ponytail: parses the whole ~2 MB catalogue per GM page load for them; a GM-only route with just these if it drags.
    const sheet = creation ? sheetRules(creation.creation) : { abilities: [], talents: [] };
    return <GmApp campaignId={me.campaignId} bestiary={bestiary} wargear={wargear} rules={rules} sheetRules={sheet} />;
  }
  if (!me.characterId) return <StatusScreen text="NO CHARACTER YET. ASK YOUR GM." />;
  return <PlayerApp campaignId={me.campaignId} characterId={me.characterId} rules={await loadRules(me.campaignId)} />;
}
