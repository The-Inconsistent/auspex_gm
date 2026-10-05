"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  flatTree,
  placeTree,
  type FactionPreset,
  type HazardTable,
  type PlaceSummary,
  type SpaceHulkGenerator,
} from "@wg/shared";

import { FactionPicker } from "@/components/gm/codex/components/faction-picker/faction-picker";
import { HulkGenerator } from "@/components/gm/codex/components/hulk-generator/hulk-generator";
import { PlacePicker } from "@/components/gm/codex/components/place-picker/place-picker";
import { TAB_PARAM } from "@/components/gm/gm-app/constants";
import { RoomInvite } from "@/components/gm/party/components/room-invite/room-invite";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";
import { ThemeToggle } from "@/components/ui/theme-toggle/theme-toggle";
import { STEP_LABELS } from "@/components/ui/wizard-steps/constants";
import { WizardSteps } from "@/components/ui/wizard-steps/wizard-steps";
import { useTable } from "@/hooks/use-table/use-table";

import { AddByName } from "./components/add-by-name/add-by-name";
import { AFTER_CREATE, type SetupStep } from "./constants";

type CampaignSetupProps = {
  campaignId: string;
  places: PlaceSummary[];
  factionPresets: FactionPreset[];
  spaceHulk: SpaceHulkGenerator | null;
  hazards: HazardTable[];
};

const isSetupStep = (s: string): s is SetupStep => AFTER_CREATE.some((a) => a === s);

// NEW CAMPAIGN after CREATE: the setting, the factions and the players, each saved as it goes, through CODEX's and
// PARTY's own pickers and actions. Every step may be skipped; the SETUP tab lists what's left.
export function CampaignSetup({ campaignId, places, factionPresets, spaceHulk, hazards }: CampaignSetupProps) {
  const router = useRouter();
  const { state, codex, send, online } = useTable(campaignId);
  const [step, setStep] = useState<SetupStep>("setting");
  const [error, setError] = useState<string | null>(null);
  // OPEN THE CAMPAIGN pulses (aria-busy) from the tap until the GM app is up.
  const [pending, startTransition] = useTransition();
  if (!state || !codex) return <StatusScreen text="SYNCING COGITATOR…" />;
  const at = AFTER_CREATE.indexOf(step);
  const back = AFTER_CREATE[at - 1];
  const next = AFTER_CREATE[at + 1];

  // A step tab, BACK or NEXT: that step, from the top, with the last step's refusal gone.
  const go = (s: SetupStep) => {
    setError(null);
    setStep(s);
    window.scrollTo({ top: 0 });
  };

  // OPEN THE CAMPAIGN: the SETUP tab, which lists the steps still to do.
  const open = () => startTransition(() => router.push(`/c/${campaignId}?${TAB_PARAM}=setup`));

  return (
    <div className="bld">
      {!online && <div className="badge-offline">NO SIGNAL · RECONNECTING</div>}
      <header className="band torn bld-head">
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
      <main className="bld-main" style={{ margin: "0 auto" }}>
        {step === "setting" && (
          <>
            <div className="rule">WHERE DOES IT START?</div>
            <p className="dim">
              Keep the adventures to one limited area, so the players see their actions have consequences. Core Rulebook
              p.320
            </p>
            {places.length > 0 && <PlacePicker open places={places} codex={codex} send={send} onError={setError} />}
            {spaceHulk && (
              <HulkGenerator generator={spaceHulk} hazards={hazards} codex={codex} send={send} onError={setError} />
            )}
            <AddByName id="setup-place" kind="location" send={send} onError={setError} />
            <div className="field">
              <span className="label">IN THIS CAMPAIGN</span>
              {codex.locations.length === 0 && <i className="dim">No places yet.</i>}
              {flatTree(placeTree(codex.locations)).map(({ row, depth }) => (
                <div key={row.id} style={{ paddingLeft: depth * 16 }}>
                  {depth ? "› " : "• "}
                  {row.name}
                </div>
              ))}
            </div>
          </>
        )}
        {step === "factions" && (
          <>
            <div className="rule">WHO&apos;S OUT THERE?</div>
            <p className="dim">Who can work together, and who needs a reason. Core Rulebook pp.167, 317</p>
            {factionPresets.length > 0 && (
              <FactionPicker open presets={factionPresets} factions={codex.factions} send={send} onError={setError} />
            )}
            <AddByName id="setup-faction" kind="faction" send={send} onError={setError} />
            <div className="field">
              <span className="label">IN THIS CAMPAIGN</span>
              {codex.factions.length === 0 && <i className="dim">No factions yet.</i>}
              {codex.factions.map((f) => (
                <div key={f.id}>• {f.name}</div>
              ))}
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
  );
}
