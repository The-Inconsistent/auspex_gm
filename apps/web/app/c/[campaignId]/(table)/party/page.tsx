"use client";
import { useGm } from "@/components/gm/gm-app/gm-context";
import { Party } from "@/components/gm/party/party";

export default function PartyPage() {
  const { state, codex, send, wargear, presets } = useGm();
  return <Party state={state} codex={codex} send={send} wargear={wargear} mutations={presets.mutations} />;
}
