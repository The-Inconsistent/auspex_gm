"use client";
import type { LiveState } from "@wg/shared";

import { SpendRequests } from "@/components/gm/spend-requests/spend-requests";
import type { Send } from "@/hooks/use-table/use-table";

import { Popover } from "../popover/popover";

type SpendBadgeProps = { state: LiveState; send: Send };

// `n SPEND ASKED` in the header, only while players have asked; it opens the request list (ACCEPT / DENY).
export function SpendBadge({ state, send }: SpendBadgeProps) {
  const n = state.spendRequests.length;
  if (n === 0) return null;
  return (
    <Popover
      className="btn primary"
      button={`${n} SPEND ASKED`}
      label={`${n} spend ${n === 1 ? "request" : "requests"} asked. Tap to answer`}
      title="Spend requests"
    >
      {() => <SpendRequests state={state} send={send} />}
    </Popover>
  );
}
