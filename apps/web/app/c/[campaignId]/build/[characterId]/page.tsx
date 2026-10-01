import { Me } from "@wg/shared";

import { JOIN_ERRORS, NO_ACCESS } from "@/app/constants";
import { apiGet, loadCreation, loadRules } from "@/app/server-api";
import { Builder } from "@/components/builder/builder";
import { BUILD_STEP_PARAM, NEW_CHARACTER } from "@/components/builder/constants";
import { asBuilderStep } from "@/components/builder/utils";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";

type BuildProps = {
  params: Promise<{ campaignId: string; characterId: string }>;
  // "?step=advance" (the sheet's LEVEL UP badge) opens the builder on one screen. It is read here, on the server, so the
  // first render is the same on both sides; this page is dynamic already, because it reads the caller's seat.
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

// The character builder (issue #9): the GM builds any character, or a new one; a player rebuilds their own.
export default async function Build({ params, searchParams }: BuildProps) {
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

  const characterId = p.characterId === NEW_CHARACTER ? null : p.characterId;
  if (me.role !== "gm" && (!characterId || characterId !== me.characterId))
    return <StatusScreen text="ONLY YOUR OWN CHARACTER. ASK YOUR GM." />;
  const [catalogue, rules] = await Promise.all([loadCreation(me.campaignId), loadRules(me.campaignId)]);
  if (!catalogue) return <StatusScreen text="CREATION DATA UNAVAILABLE. TRY AGAIN." />;
  return (
    <Builder
      campaignId={me.campaignId}
      characterId={characterId}
      role={me.role}
      payload={catalogue}
      rules={rules}
      initialStep={asBuilderStep(query[BUILD_STEP_PARAM]) ?? undefined}
    />
  );
}
