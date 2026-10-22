"use client";
import { useRouter } from "next/navigation";

import { useGm } from "@/components/gm/gm-app/gm-context";
import type { TabTarget } from "@/components/gm/setup/components/setup-panel/constants";
import { Setup } from "@/components/gm/setup/setup";
import { gmPath } from "@/lib/gm-path/gm-path";

export default function SetupPage() {
  const { campaignId, state, codex, send, frameworks, onDeleted } = useGm();
  const router = useRouter();

  // SETUP's GO TO: the tab's URL (CODEX on the step's kind), with the panel to open as its #anchor.
  const openTab = ({ tab, kind, anchor }: TabTarget) => {
    const path = tab === "CODEX" && kind ? gmPath.codex({ campaignId, kind }) : gmPath.tab(campaignId, tab);
    router.push(anchor ? `${path}#${anchor}` : path);
  };

  return (
    <Setup state={state} codex={codex} send={send} frameworks={frameworks} onTab={openTab} onDeleted={onDeleted} />
  );
}
