import type { Overrides, RequisitionKind } from "@wg/shared";

// Session-end XP awards, Core p.321.
export const XP_AWARDS = [8, 10, 12] as const;
export const DEFAULT_XP = 10;

// Join QR code edge, in CSS px.
export const QR_SIZE = 320;

// How long invites stay live: the room QR covers one evening at the table; a character link a week of lead time.
export const ROOM_INVITE_HOURS = 12;
export const CHARACTER_INVITE_HOURS = 168;

// Button labels for the requisition kinds (Core p.205, p.229).
export const REQUISITION_KINDS = {
  wargear: "WARGEAR",
  ammo: "AMMO",
  grenade: "GRENADES / MISSILES",
} as const satisfies Record<RequisitionKind, string>;

// The Traits a GM override can pin (Core pp.36–37), in sheet order; a blank field keeps the derived value.
export const OVERRIDE_LABELS = {
  maxWounds: "MAX WOUNDS",
  maxShock: "MAX SHOCK",
  defence: "DEFENCE",
  resilience: "RESILIENCE",
  resolve: "RESOLVE",
  conviction: "CONVICTION",
  influence: "INFLUENCE",
  speed: "SPEED",
  determination: "DETERMINATION",
} as const satisfies Record<keyof Overrides, string>;
