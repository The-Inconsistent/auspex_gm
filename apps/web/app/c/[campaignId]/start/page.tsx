import { Me } from "@wg/shared";

import { JOIN_ERRORS, NO_ACCESS } from "@/app/constants";
import { apiGet, loadFactionPresets, loadPlaces, loadScenePresets } from "@/app/server-api";
import { CampaignSetup } from "@/components/campaign-setup/campaign-setup";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";

type SetupProps = { params: Promise<{ campaignId: string }> };

// NEW CAMPAIGN after CREATE: the setting, the factions and the players. The GM's only, since the pickers are book data.
export default async function CampaignSetupPage({ params }: SetupProps) {
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
  if (me.role !== "gm") return <StatusScreen text="ONLY THE GM SETS UP THE CAMPAIGN." />;

  const [places, factionPresets, presets] = await Promise.all([
    loadPlaces(me.campaignId),
    loadFactionPresets(me.campaignId),
    loadScenePresets(me.campaignId),
  ]);
  return (
    <CampaignSetup
      campaignId={me.campaignId}
      places={places}
      factionPresets={factionPresets.presets}
      spaceHulk={presets.spaceHulk}
      hazards={presets.hazards}
    />
  );
}
