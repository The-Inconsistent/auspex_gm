"use client";
import { useParams, useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";

import { useGm } from "@/components/gm/gm-app/gm-context";
import { Party } from "@/components/gm/party/party";
import { asDossierTab } from "@/lib/gm-path/gm-path";

type PartyParams = { characterId?: string; tab?: string };

// PARTY stays mounted under its dossier and RESPITE routes, so its line of news reaches the open sheet. The pages below
// only give each URL its shape; this reads which sheet is open.
export default function PartyLayout({ children }: { children: ReactNode }) {
  const { state, codex, send, wargear, presets } = useGm();
  const { characterId, tab } = useParams<PartyParams>();
  return (
    <>
      <Party
        state={state}
        codex={codex}
        send={send}
        wargear={wargear}
        mutations={presets.mutations}
        dossierId={characterId}
        dossierTab={asDossierTab(tab ?? "") ?? "status"}
        resting={useSelectedLayoutSegment() === "respite"}
      />
      {children}
    </>
  );
}
