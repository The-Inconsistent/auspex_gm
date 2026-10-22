"use client";
import { useParams, useSelectedLayoutSegments } from "next/navigation";
import type { ReactNode } from "react";

import { CodexView } from "@/components/gm/codex/codex";
import { useGm } from "@/components/gm/gm-app/gm-context";
import { RUIN_ACTIONS_TABLE } from "@/components/ui/threat-builder/constants";
import { asCodexKind, THREATS_SEGMENT } from "@/lib/gm-path/gm-path";

type CodexParams = { kind?: string; entryId?: string; slug?: string };

// CODEX stays mounted across its own routes (a kind's list, an entry, its editor), so the search, the PRINT ticks and
// the folded places survive opening an editor. The pages below only give each URL its shape; this reads which is open.
export default function CodexLayout({ children }: { children: ReactNode }) {
  const gm = useGm();
  const { state, codex, send, presets } = gm;
  const { kind, entryId, slug } = useParams<CodexParams>();
  const [list, entry, leaf] = useSelectedLayoutSegments(); // /<kinds>/<entry or new>/edit
  const sub = list === THREATS_SEGMENT ? "threats" : (asCodexKind(kind ?? "") ?? "npc");
  const editId = entry === "new" ? "new" : leaf === "edit" ? entryId : undefined;
  return (
    <>
      <CodexView
        campaignId={gm.campaignId}
        codex={codex}
        characters={state.characters}
        send={send}
        sub={sub}
        openId={editId ? undefined : entryId}
        editId={editId}
        threatSlug={slug}
        factionPresets={gm.factionPresets}
        npcPresets={gm.npcPresets}
        flavour={gm.flavour}
        places={gm.places}
        hazards={presets.hazards}
        spaceHulk={presets.spaceHulk}
        ruinActions={presets.pools.find((t) => t.id === RUIN_ACTIONS_TABLE) ?? null}
        bestiary={gm.bestiary}
        tier={state.campaign.tier}
        players={state.characters.length}
        wargear={gm.wargear}
        loot={presets.loot}
        relics={presets.relics}
      />
      {children}
    </>
  );
}
