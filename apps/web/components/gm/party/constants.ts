import type { AscensionKind, RequisitionKind } from "@wg/shared";

// Session-end XP awards, Core p.321.
export const XP_AWARDS = [8, 10, 12] as const;
export const DEFAULT_XP = 10;

// The two Ascensions (Core pp.147–148), as PARTY offers them, one per `AscensionKind`.
export const ASCEND_KINDS = {
  experience: {
    label: "EXPERIENCE ASCENSION",
    cite: "Core pp.147–148",
    gist: "Every character has earned 100 XP or more in this Tier, and the group decides together. One character past 100 does not Ascend alone (house rule §11.66).",
  },
  milestone: {
    label: "MILESTONE ASCENSION",
    cite: "Core p.148",
    gist: "Your call, at a turn in the story: every character gains 100 XP, takes an Ascension Package (or you waive it), and the Tier goes up.",
  },
} as const satisfies Record<AscensionKind, { label: string; cite: string; gist: string }>;
export type AscendKind = AscensionKind;

// How long invites stay live: the room QR covers one evening at the table; a character link a week of lead time.
export const ROOM_INVITE_HOURS = 12;
export const CHARACTER_INVITE_HOURS = 168;

// Button labels for the requisition kinds (Core p.205, p.229).
export const REQUISITION_KINDS = {
  wargear: "WARGEAR",
  ammo: "AMMO",
  grenade: "GRENADES / MISSILES",
} as const satisfies Record<RequisitionKind, string>;

// A report line (what an action did, or "! why it was refused"). `id` counts up, so a dialog can tell a line sent
// since it opened from one left over.
export type PartyMsg = { text: string; id: number };

// The dossier's four tabs (a tab's label carries a value, so the label itself is built in the dossier).
export const DOSSIER_TABS = ["status", "gear", "advance", "seat"] as const;
export type DossierTab = (typeof DOSSIER_TABS)[number];
