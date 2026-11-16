"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  flatTree,
  placeTree,
  type FactionKeyword,
  type FactionPreset,
  type HazardTable,
  type PlaceNode,
  type PlaceSummary,
  type SpaceHulkGenerator,
} from "@wg/shared";

import { CodexEditor } from "@/components/gm/codex/components/codex-editor/codex-editor";
import { FactionPicker } from "@/components/gm/codex/components/faction-picker/faction-picker";
import { HulkGenerator } from "@/components/gm/codex/components/hulk-generator/hulk-generator";
import { PlacePicker } from "@/components/gm/codex/components/place-picker/place-picker";
import { RoomInvite } from "@/components/gm/party/components/room-invite/room-invite";
import { PictureProvider } from "@/components/ui/codex-picture/codex-picture";
import { MentionsProvider } from "@/components/ui/mentions/mentions-provider";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";
import { ThemeToggle } from "@/components/ui/theme-toggle/theme-toggle";
import { STEP_LABELS } from "@/components/ui/wizard-steps/constants";
import { WizardSteps } from "@/components/ui/wizard-steps/wizard-steps";
import { useTable } from "@/hooks/use-table/use-table";
import { gmPath } from "@/lib/gm-path/gm-path";

import { AddByName } from "./components/add-by-name/add-by-name";
import { InCampaign, type InCampaignRow } from "./components/in-campaign/in-campaign";
import { AFTER_CREATE, type SetupStep, type TypedKind } from "./constants";

type CampaignSetupProps = {
  campaignId: string;
  places: PlaceSummary[];
  factionPresets: FactionPreset[];
  keywords: readonly FactionKeyword[]; // the books' Keywords a faction's panel suggests
  spaceHulk: SpaceHulkGenerator | null;
  hazards: HazardTable[];
};

// Each place with the ids under it, deepest first (reversed pre-order puts every place before its parent), so REMOVE
// takes the whole branch.
const placeRows = (nodes: PlaceNode<{ id: string; name: string }>[], depth = 0): InCampaignRow[] =>
  nodes.flatMap((n) => [
    {
      id: n.row.id,
      name: n.row.name,
      depth,
      inside: flatTree(n.children)
        .map((f) => f.row.id)
        .reverse(),
    },
    ...placeRows(n.children, depth + 1),
  ]);

const isSetupStep = (s: string): s is SetupStep => AFTER_CREATE.some((a) => a === s);

// NEW CAMPAIGN after CREATE: the setting, the factions and the players, each saved as it goes, through CODEX's and
// PARTY's own pickers and actions. Every step may be skipped; the SETUP tab lists what's left.
export function CampaignSetup({
  campaignId,
  places,
  factionPresets,
  keywords,
  spaceHulk,
  hazards,
}: CampaignSetupProps) {
  const router = useRouter();
  const { state, codex, send, online } = useTable(campaignId);
  const [step, setStep] = useState<SetupStep>("setting");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // the place or faction whose panel is open
  // OPEN THE CAMPAIGN pulses (aria-busy) from the tap until the GM app is up.
  const [pending, startTransition] = useTransition();
  if (!state || !codex) return <StatusScreen text="SYNCING COGITATOR…" />;
  const at = AFTER_CREATE.indexOf(step);
  const back = AFTER_CREATE[at - 1];
  const next = AFTER_CREATE[at + 1];

  // A step tab, BACK or NEXT: that step, from the top, with the last step's refusal gone.
  const go = (s: SetupStep) => {
    setError(null);
    setEditing(null);
    setStep(s);
    window.scrollTo({ top: 0 });
  };

  // OPEN THE CAMPAIGN: the SETUP tab, which lists the steps still to do.
  const open = () => startTransition(() => router.push(gmPath.tab(campaignId, "SETUP")));

  // The writing panel beside IN THIS CAMPAIGN: CODEX's own form (its quick-edit sheet), so a place gets its DESCRIPTION,
  // GM NOTES and hazards and a faction its STANCE, Keywords, NOTES and SECRETS. DONE saves; a removed entry closes it.
  const panel = (kind: TypedKind) => {
    const row = (kind === "location" ? codex.locations : codex.factions).find((r) => r.id === editing);
    return (
      row && (
        <section className="plate stack" aria-label={`Write ${row.name}`}>
          <CodexEditor
            key={row.id}
            kind={kind}
            codex={codex}
            characters={state.characters}
            send={send}
            row={row}
            keywords={keywords}
            bestiary={[]}
            tier={state.campaign.tier}
            flavour={[]}
            hazards={hazards}
            wargear={[]}
            onDone={() => setEditing(null)}
            sheet={{ codexHref: gmPath.codex({ campaignId, kind, entryId: row.id, edit: true }) }}
          />
        </section>
      )
    );
  };

  return (
    // CODEX's form links mentions and shows pictures, so it needs the providers GmApp gives it.
    <PictureProvider campaignId={campaignId}>
      <MentionsProvider codex={codex} missing="(removed)">
        <div className="bld">
          <header className="band torn bld-head">
            {!online && <div className="badge-offline">NO SIGNAL · RECONNECTING</div>}
            <Link href={`/c/${campaignId}`} aria-label="Open the campaign" className="btn sq">
              ◂
            </Link>
            <div className="display gm-title">
              {state.campaign.name.toUpperCase()}
              <span className="dim"> · SET-UP</span>
            </div>
            <ThemeToggle />
          </header>
          <WizardSteps step={step} here={AFTER_CREATE} onStep={(s) => isSetupStep(s) && go(s)} />
          <main className="bld-main wide">
            {step === "setting" && (
              <>
                <div className="rule">WHERE DOES IT START?</div>
                <p className="dim">
                  Keep the adventures to one limited area, so the players see their actions have consequences. Core
                  Rulebook p.320
                </p>
                {places.length > 0 && <PlacePicker open places={places} codex={codex} send={send} onError={setError} />}
                {spaceHulk && (
                  <HulkGenerator generator={spaceHulk} hazards={hazards} codex={codex} send={send} onError={setError} />
                )}
                <div className="su-split">
                  <div className="stack">
                    <AddByName id="setup-place" kind="location" send={send} onError={setError} />
                    <InCampaign
                      kind="location"
                      rows={placeRows(placeTree(codex.locations))}
                      empty="No places yet."
                      editing={editing}
                      onEdit={setEditing}
                      send={send}
                      onError={setError}
                    />
                  </div>
                  {panel("location")}
                </div>
              </>
            )}
            {step === "factions" && (
              <>
                <div className="rule">WHO&apos;S OUT THERE?</div>
                <p className="dim">Who can work together, and who needs a reason. Core Rulebook pp.167, 317</p>
                {factionPresets.length > 0 && (
                  <FactionPicker
                    open
                    presets={factionPresets}
                    factions={codex.factions}
                    send={send}
                    onError={setError}
                  />
                )}
                <div className="su-split">
                  <div className="stack">
                    <AddByName id="setup-faction" kind="faction" send={send} onError={setError} />
                    <InCampaign
                      kind="faction"
                      rows={codex.factions.map((f) => ({ id: f.id, name: f.name, depth: 0, inside: [] }))}
                      empty="No factions yet."
                      editing={editing}
                      onEdit={setEditing}
                      send={send}
                      onError={setError}
                    />
                  </div>
                  {panel("faction")}
                </div>
              </>
            )}
            {step === "players" && (
              <>
                <div className="rule">INVITE YOUR PLAYERS</div>
                <RoomInvite send={send} onError={setError} />
                <p className="dim">
                  There are no Agents yet: once seated, each player builds one, or brings one from their library. Core
                  Rulebook p.17
                </p>
              </>
            )}
            {error && (
              <div className="red" role="alert">
                ! {error}
              </div>
            )}
            <div className="keys" style={{ justifyContent: "space-between" }}>
              {back ? (
                <button className="btn" onClick={() => go(back)}>
                  ◂ BACK
                </button>
              ) : (
                <span />
              )}
              {next ? (
                <button className="btn primary" onClick={() => go(next)}>
                  NEXT: {STEP_LABELS[next]} ▸
                </button>
              ) : (
                <button className="btn primary" aria-busy={pending} onClick={open}>
                  OPEN THE CAMPAIGN ▸
                </button>
              )}
            </div>
            <i className="dim">Nothing here is required: the campaign&apos;s SETUP tab lists whatever is left.</i>
          </main>
        </div>
      </MentionsProvider>
    </PictureProvider>
  );
}
