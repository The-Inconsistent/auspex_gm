import { CreationPayload, Me } from "@wg/shared";

import { JOIN_ERRORS, NO_ACCESS } from "@/app/constants";
import { apiGet } from "@/app/server-api";
import { Builder } from "@/components/builder/builder";
import { NEW_CHARACTER } from "@/components/builder/constants";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";

type BuildProps = { params: Promise<{ campaignId: string; characterId: string }> };

// The creation catalogue for this table (book text, seats only). null on failure; the page then says so.
async function loadCatalogue(campaignId: string): Promise<CreationPayload | null> {
  try {
    const res = await apiGet(`/api/campaigns/${campaignId}/creation`);
    const parsed = CreationPayload.safeParse(res.ok ? await res.json() : null);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// The character builder (issue #9): the GM builds any character, or a new one; a player rebuilds their own.
export default async function Build({ params }: BuildProps) {
  const p = await params;
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

  const characterId = p.characterId === NEW_CHARACTER ? null : p.characterId;
  if (me.role !== "gm" && (!characterId || characterId !== me.characterId))
    return <StatusScreen text="ONLY YOUR OWN CHARACTER. ASK YOUR GM." />;
  const catalogue = await loadCatalogue(me.campaignId);
  if (!catalogue) return <StatusScreen text="CREATION DATA UNAVAILABLE. TRY AGAIN." />;
  return <Builder campaignId={me.campaignId} characterId={characterId} role={me.role} payload={catalogue} />;
}
