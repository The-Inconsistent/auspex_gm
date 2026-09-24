import { InvitePreview } from "@wg/shared";

import { JOIN_ERRORS } from "@/app/constants";
import { apiGet } from "@/app/server-api";
import { InviteAccept } from "@/components/invite/invite-accept/invite-accept";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";

type InvitePageProps = { params: Promise<{ code: string }> };

// An invite link or room QR: shows the table and lets the caller claim a seat (signed in, or as a guest if allowed).
export default async function InvitePage({ params }: InvitePageProps) {
  const { code } = await params;
  try {
    const res = await apiGet(`/api/invites/${encodeURIComponent(code)}`);
    if (res.status === 400) {
      const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
      return (
        <StatusScreen text={typeof body?.message === "string" ? body.message.toUpperCase() : JOIN_ERRORS.invalid} />
      );
    }
    const parsed = InvitePreview.safeParse(res.ok ? await res.json() : null);
    if (!parsed.success) return <StatusScreen text={JOIN_ERRORS.nosignal} />;
    return <InviteAccept code={code} preview={parsed.data} />;
  } catch {
    return <StatusScreen text={JOIN_ERRORS.nosignal} />;
  }
}
