import { redirect } from "next/navigation";

import { signedInUserId } from "@wg/auth/next";
import { AdminCampaign, AdminEvent, AdminUser } from "@wg/shared";

import { JOIN_ERRORS } from "@/app/constants";
import { apiGet } from "@/app/server-api";
import { AdminView } from "@/components/admin/admin-view/admin-view";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";

// The three reads, or null when the api can't be reached.
async function loadAdmin() {
  try {
    return await Promise.all([apiGet("/api/admin/users"), apiGet("/api/admin/campaigns"), apiGet("/api/admin/events")]);
  } catch {
    return null;
  }
}

// /admin: users, games and the admin log for a Clerk admin. Anyone else (the api answers 401 or 403) goes home.
export default async function Admin() {
  const userId = await signedInUserId();
  if (!userId) redirect("/");

  const res = await loadAdmin();
  if (!res) return <StatusScreen text={JOIN_ERRORS.nosignal} />;
  if (res.some((r) => r.status === 401 || r.status === 403)) redirect("/");
  if (res.some((r) => !r.ok)) return <StatusScreen text={JOIN_ERRORS.nosignal} />;

  const [users, campaigns, events] = [
    AdminUser.array().safeParse(await res[0].json().catch(() => null)),
    AdminCampaign.array().safeParse(await res[1].json().catch(() => null)),
    AdminEvent.array().safeParse(await res[2].json().catch(() => null)),
  ];
  if (!users.success || !campaigns.success || !events.success) return <StatusScreen text={JOIN_ERRORS.nosignal} />;
  return <AdminView selfId={userId} users={users.data} campaigns={campaigns.data} events={events.data} />;
}
