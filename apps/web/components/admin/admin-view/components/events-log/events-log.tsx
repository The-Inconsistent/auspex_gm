import type { AdminCampaign, AdminEvent } from "@wg/shared";

import { stamp } from "@/lib/admin/admin";

type EventsLogProps = { events: AdminEvent[]; campaigns: AdminCampaign[]; names: Map<string, string> };

// The latest admin actions, newest first. The log keeps the game's name as it was, so a deleted game is still named.
export function EventsLog({ events, campaigns, names }: EventsLogProps) {
  const live = new Set(campaigns.map((c) => c.id));
  return (
    <section className="stack">
      <div className="rule">ADMIN LOG · LATEST {events.length}</div>
      <div className="list">
        {events.length === 0 && <div className="dim">Nothing yet.</div>}
        {events.map((e) => (
          <div key={e.id} className="item">
            <div className="admin-row">
              <b>{e.action.toUpperCase()}</b>
              {e.campaignName && (
                <span>
                  {e.campaignName.toUpperCase()}
                  {e.campaignId && !live.has(e.campaignId) ? " (DELETED)" : ""}
                </span>
              )}
              {e.targetUserId && <span>→ {(names.get(e.targetUserId) ?? e.targetUserId).toUpperCase()}</span>}
            </div>
            <div className="dim">
              {stamp(e.createdAt)} · BY {(names.get(e.actorUserId) ?? e.actorUserId).toUpperCase()}
              {e.detail ? ` · ${e.detail}` : ""}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
