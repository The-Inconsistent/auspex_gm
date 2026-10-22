"use client";
import { useGm } from "@/components/gm/gm-app/gm-context";
import { CodexView } from "@/components/gm/codex/codex";
import { RUIN_ACTIONS_TABLE } from "@/components/ui/threat-builder/constants";

export default function CodexPage() {
  const gm = useGm();
  const { state, codex, send, presets } = gm;
  return (
    <CodexView
      codex={codex}
      characters={state.characters}
      send={send}
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
  );
}
