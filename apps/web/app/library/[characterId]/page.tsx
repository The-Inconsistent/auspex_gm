import { LibraryEntry } from "@wg/shared";

import { JOIN_ERRORS } from "@/app/constants";
import { apiGet, loadCreationFor, loadRulesSignedIn } from "@/app/server-api";
import { LibraryBuilder } from "@/components/builder/builder";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";

type LibraryBuildProps = { params: Promise<{ characterId: string }> };

// The builder on a character in the signed-in user's own library (issue #14): no campaign, no seat. /library/new starts
// one and redirects here (app/library/new/route.ts).
export default async function LibraryBuild({ params }: LibraryBuildProps) {
  const { characterId } = await params;
  let entry: LibraryEntry;
  try {
    const res = await apiGet(`/api/library/${encodeURIComponent(characterId)}`);
    if (res.status === 401) return <StatusScreen text="SIGN IN TO BUILD A CHARACTER." />;
    // 400 is an id that isn't a uuid, so it's nobody's character either.
    if (res.status === 404 || res.status === 400) return <StatusScreen text="CHARACTER NOT FOUND." />;
    const parsed = LibraryEntry.safeParse(res.ok ? await res.json() : null);
    if (!parsed.success) return <StatusScreen text={JOIN_ERRORS.nosignal} />;
    entry = parsed.data;
  } catch {
    return <StatusScreen text={JOIN_ERRORS.nosignal} />;
  }

  const [payload, rules] = await Promise.all([loadCreationFor(entry.homebrew), loadRulesSignedIn()]);
  if (!payload) return <StatusScreen text="CREATION DATA UNAVAILABLE. TRY AGAIN." />;
  return <LibraryBuilder entry={entry} payload={payload} rules={rules} />;
}
