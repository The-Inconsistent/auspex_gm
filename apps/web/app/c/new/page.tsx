import { FrameworkCatalogue } from "@wg/shared";

import { JOIN_ERRORS } from "@/app/constants";
import { apiGet } from "@/app/server-api";
import { NewCampaign } from "@/components/new-campaign/new-campaign";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";

// CREATE NEW CAMPAIGN, before the campaign exists. The Framework list is book text, so the api gives it to creators
// only (GET /api/frameworks), and that one call is the page's gate too.
export default async function NewCampaignPage() {
  let catalogue: FrameworkCatalogue;
  try {
    const res = await apiGet("/api/frameworks");
    if (res.status === 401) return <StatusScreen text="SIGN IN TO START A CAMPAIGN." />;
    if (res.status === 403) return <StatusScreen text="ONLY A CREATOR CAN START A CAMPAIGN." />;
    const parsed = FrameworkCatalogue.safeParse(res.ok ? await res.json() : null);
    if (!parsed.success) return <StatusScreen text={JOIN_ERRORS.nosignal} />;
    catalogue = parsed.data;
  } catch {
    return <StatusScreen text={JOIN_ERRORS.nosignal} />;
  }
  return <NewCampaign catalogue={catalogue} />;
}
