import type { ProfileId } from "@wg/shared";

// One word per profile, because the entry row already carries a picker, a count, MOB, a marker and a visibility select.
// The full name, cite and effect ride in each chip's title (VoA p.126).
export const PROFILE_CHIP: Record<ProfileId, string> = {
  "heretical-strength": "STRENGTH",
  "xenos-cunning": "CUNNING",
  "enemy-within": "WITHIN",
};
