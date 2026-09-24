import { Me, Threat } from "@wg/shared";

import { JOIN_ERRORS, NO_ACCESS } from "@/app/constants";
import { apiGet } from "@/app/server-api";
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

  if (me.role === "gm") return <GmApp campaignId={me.campaignId} bestiary={await loadBestiary(me.campaignId)} />;
  if (!me.characterId) return <StatusScreen text="NO CHARACTER YET. ASK YOUR GM." />;
  return <PlayerApp campaignId={me.campaignId} characterId={me.characterId} />;
}
