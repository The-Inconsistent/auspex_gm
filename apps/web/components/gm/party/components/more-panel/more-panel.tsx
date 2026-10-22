"use client";
import { useState } from "react";

import type { ActionResult, LiveState } from "@wg/shared";

import { usePrint } from "@/components/ui/print-dialog/print-dialog";
import type { Send } from "@/hooks/use-table/use-table";
import { shareOrigin } from "@/lib/share-origin/share-origin";

import { AddAgent } from "../add-agent/add-agent";
import { joinQr, QrDialog, type JoinQr } from "../qr-dialog/qr-dialog";
import { TableAccess } from "../table-access/table-access";

type MorePanelProps = {
  state: LiveState;
  active: Set<string>; // ids of the Agents holding a seat
  send: Send;
  onResult: (r: ActionResult, ok: string) => void;
  onClose: () => void;
};

// MORE: everything PARTY does rarely, in one disclosure with its own CLOSE: ADD AGENT and NEW FROM BUILDER, the
// printed tents (fold-over name cards behind each miniature, #203), the table screen and TABLE ACCESS.
export function MorePanel({ state, active, send, onResult, onClose }: MorePanelProps) {
  const [qr, setQr] = useState<JoinQr | null>(null);
  const { print } = usePrint();
  const groups = [
    ["ACTIVE", state.characters.filter((c) => active.has(c.id))],
    ["IN RESERVE", state.characters.filter((c) => !active.has(c.id))],
  ] as const;

  // TABLE SCREEN: a read-only guest seat for the TV in the middle of the table; its browser keeps the token in a cookie.
  const showScreenQr = async () => {
    const r = await send({ type: "screen.issue" });
    if (!r.ok || !r.token) return onResult(r, "");
    try {
      setQr(await joinQr({ title: "Table screen", url: `${shareOrigin(window.location)}/join/${r.token}` }));
    } catch (e) {
      onResult({ ok: false, error: `QR code failed: ${e instanceof Error ? e.message : "unknown error"}` }, "");
    }
  };

  // REVOKE SCREENS: every table screen token dies and the TVs disconnect.
  const revokeScreens = async () => onResult(await send({ type: "screen.revoke" }), "TABLE SCREENS REVOKED");

  return (
    <section id="party-more" className="panel pad stack" aria-label="More">
      <div className="rule">
        <span>MORE</span>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={onClose}>
          CLOSE
        </button>
      </div>
      <AddAgent campaignId={state.campaign.id} send={send} onResult={onResult} />
      <div className="keys" style={{ alignItems: "center" }}>
        <span className="label">PRINT TENTS</span>
        {groups.map(
          ([label, list]) =>
            list.length > 0 && (
              <button key={label} className="btn" onClick={() => print({ agents: list.map((c) => c.id) })}>
                {label} · {list.length}
              </button>
            ),
        )}
        <span className="label">TABLE SCREEN</span>
        <button className="btn" onClick={showScreenQr}>
          SCREEN QR
        </button>
        <button className="btn danger" onClick={revokeScreens}>
          REVOKE SCREENS
        </button>
      </div>
      <details className="item">
        <summary className="label">TABLE ACCESS</summary>
        <TableAccess state={state} send={send} onResult={onResult} />
      </details>
      {qr && <QrDialog qr={qr} onClose={() => setQr(null)} />}
    </section>
  );
}
