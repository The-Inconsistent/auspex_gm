"use client";
import type { AdminUser } from "@wg/shared";

import { ConfirmAction } from "@/components/ui/confirm-action/confirm-action";
import { removeSeats, stamp } from "@/lib/admin/admin";

import { CLERK_DASHBOARD } from "../../constants";
import type { useAdminCall } from "../../hooks/use-admin-call/use-admin-call";

type UsersTabProps = { selfId: string; users: AdminUser[]; call: ReturnType<typeof useAdminCall> };

const ROLE_LABEL = { admin: "ADMIN", creator: "CREATOR" } as const;

// USERS: who has signed in, their Clerk role as of their last visit, and the seats they hold.
export function UsersTab({ selfId, users, call }: UsersTabProps) {
  // REMOVE FROM ALL GAMES: one member.remove per seat, so the user is kicked from every table at once.
  const handleRemoveSeats = (u: AdminUser) =>
    call.run({ key: `seats:${u.id}`, ok: `${u.name.toUpperCase()} REMOVED`, work: () => removeSeats(u.id) });

  return (
    <>
      <div className="keys" style={{ alignItems: "center", paddingTop: 0 }}>
        <a className="btn sm" href={CLERK_DASHBOARD} target="_blank" rel="noreferrer">
          OPEN CLERK DASHBOARD
        </a>
        <span className="dim">Roles (creator, admin) are set there, in each user&apos;s public metadata.</span>
      </div>
      <div className="list">
        {users.length === 0 && <div className="dim">Nobody has signed in yet.</div>}
        {users.map((u) => (
          <div key={u.id} className="item">
            <div className="admin-row">
              <b className="admin-name">{u.name.toUpperCase()}</b>
              <span className={`chip ${u.role === "admin" ? "bad" : ""}`}>
                {u.role ? ROLE_LABEL[u.role] : "NO ROLE"}
              </span>
              {u.id === selfId && <span className="chip">YOU</span>}
            </div>
            <div className="dim">LAST SEEN {stamp(u.lastSeenAt)}</div>
            <div className="admin-row">
              {u.seats.length === 0 && <span className="dim">NO GAMES</span>}
              {u.seats.map((s) => (
                <span key={s.campaignId} className="chip">
                  {s.campaignName.toUpperCase()} · {s.role === "gm" ? "GM" : "PLAYER"}
                </span>
              ))}
            </div>
            {u.seats.length > 0 && u.id !== selfId && (
              <div className="admin-row">
                <ConfirmAction
                  label="REMOVE FROM ALL GAMES"
                  prompt={`Remove ${u.name} from ${u.seats.length} ${u.seats.length === 1 ? "game" : "games"}?`}
                  busy={call.isBusy(`seats:${u.id}`)}
                  disabled={call.pending}
                  onConfirm={() => handleRemoveSeats(u)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
