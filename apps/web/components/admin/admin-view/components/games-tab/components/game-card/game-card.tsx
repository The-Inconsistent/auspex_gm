"use client";
import Link from "next/link";
import { useState, type ChangeEvent } from "react";

import type { AdminActionInput, AdminCampaign, AdminUser } from "@wg/shared";

import { ConfirmAction } from "@/components/ui/confirm-action/confirm-action";
import { DeleteGame } from "@/components/ui/delete-game/delete-game";
import { adminAction, stamp } from "@/lib/admin/admin";

import type { useAdminCall } from "../../../../hooks/use-admin-call/use-admin-call";

type GameCardProps = { campaign: AdminCampaign; users: AdminUser[]; call: ReturnType<typeof useAdminCall> };

// One game: what it is, then what an admin can do to it.
export function GameCard({ campaign: c, users, call }: GameCardProps) {
  const [pick, setPick] = useState("");
  const archived = !!c.archivedAt;
  const gms = users.filter((u) => u.seats.some((s) => s.campaignId === c.id && s.role === "gm"));
  const candidates = users.filter((u) => !gms.some((g) => g.id === u.id));
  const line = [
    `T${c.tier}`,
    `GM ${c.gms.length ? c.gms.join(", ").toUpperCase() : "NONE"}`,
    `${c.players} AGENTS`,
    c.session ? `SESSION ${c.session.number} OPEN SINCE ${stamp(c.session.startedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // One housekeeping action at this game; `ok` is the success line.
  const act = ({ key, ok, action }: { key: string; ok: string; action: AdminActionInput }) =>
    call.run({ key: `${key}:${c.id}`, ok, work: () => adminAction({ campaignId: c.id, action }) });
  const busy = (key: string) => call.isBusy(`${key}:${c.id}`);

  // ADD GM: seats the picked user as this game's GM, then clears the picker.
  const handleAddGm = () => {
    const user = users.find((u) => u.id === pick);
    if (!user) return;
    act({ key: "seat", ok: `${user.name.toUpperCase()} IS NOW GM`, action: { type: "member.seat", userId: user.id } });
    setPick("");
  };

  // The picker: a user to seat as GM.
  const handlePick = (e: ChangeEvent<HTMLSelectElement>) => setPick(e.target.value);

  return (
    <div className="item">
      <div className="admin-row">
        <b className="admin-name">{c.name.toUpperCase()}</b>
        {archived && <span className="chip warn">ARCHIVED</span>}
        {c.session && <span className="chip">LIVE</span>}
      </div>
      <div className="dim">{line}</div>
      <div className="dim">LAST ACTIVITY {stamp(c.lastActivity)}</div>

      <div className="admin-row">
        <Link className="btn sm primary" href={`/c/${c.id}`}>
          OPEN AS ADMIN
        </Link>
        <a className="btn sm" href={`/api/campaigns/${c.id}/export`} download>
          EXPORT
        </a>
        {archived ? (
          <button
            className="btn sm"
            aria-busy={busy("unarchive")}
            disabled={call.pending}
            onClick={() => act({ key: "unarchive", ok: "UNARCHIVED", action: { type: "campaign.unarchive" } })}
          >
            UNARCHIVE
          </button>
        ) : (
          <ConfirmAction
            label="ARCHIVE"
            prompt="Archive this game? It turns read-only and any session in progress ends with no XP."
            busy={busy("archive")}
            disabled={call.pending}
            onConfirm={() => act({ key: "archive", ok: "ARCHIVED", action: { type: "campaign.archive" } })}
          />
        )}
        {c.session && (
          <ConfirmAction
            label="END SESSION"
            prompt={`End session ${c.session.number} with no XP?`}
            busy={busy("abandon")}
            disabled={call.pending}
            onConfirm={() => act({ key: "abandon", ok: "SESSION ENDED · NO XP", action: { type: "session.abandon" } })}
          />
        )}
      </div>

      <div className="label">GMS</div>
      <div className="admin-row">
        {gms.length === 0 && <span className="dim">NONE</span>}
        {gms.map((g) => (
          <span key={g.id} className="admin-gm">
            <span className="chip">{g.name.toUpperCase()}</span>
            <ConfirmAction
              label={`REMOVE ${g.name.toUpperCase()}`}
              prompt={`Remove ${g.name} as GM?`}
              busy={busy(`gm:${g.id}`)}
              disabled={call.pending}
              onConfirm={() =>
                act({
                  key: `gm:${g.id}`,
                  ok: `${g.name.toUpperCase()} REMOVED`,
                  action: { type: "member.remove", userId: g.id },
                })
              }
            />
          </span>
        ))}
      </div>
      <div className="admin-row">
        <select className="input admin-pick" aria-label={`Add a GM to ${c.name}`} value={pick} onChange={handlePick}>
          <option value="">PICK A USER</option>
          {candidates.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name.toUpperCase()}
            </option>
          ))}
        </select>
        <button className="btn sm" disabled={!pick || call.pending} aria-busy={busy("seat")} onClick={handleAddGm}>
          ADD GM
        </button>
      </div>

      <div className="admin-row">
        <DeleteGame
          name={c.name}
          exportHref={`/api/campaigns/${c.id}/export`}
          busy={busy("delete")}
          onDelete={(name) =>
            act({ key: "delete", ok: `${c.name.toUpperCase()} DELETED`, action: { type: "campaign.delete", name } })
          }
        />
      </div>
    </div>
  );
}
