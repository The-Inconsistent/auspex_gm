// A track's fill: crimson for harm (Wounds, and Shock past its limit), ink for everything else.
export const TRACK_TONES = ["harm", "ink"] as const;
export type TrackTone = (typeof TRACK_TONES)[number];
