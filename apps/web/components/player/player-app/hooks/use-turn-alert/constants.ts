// How long the YOUR TURN overlay (or, under reduced motion, the banner's border) stays up. One flash and one fade per
// turn, far under the WCAG 2.3.1 ceiling of three flashes a second.
export const TURN_FLASH_MS = 1200;

// The optional tone: two short rising sine notes, quiet, so a table of phones doesn't chime over the GM.
export const TURN_TONE = { notes: [660, 880], noteSeconds: 0.125, peak: 0.08 } as const;

// Per device, in localStorage. Off by default: each player opts in once.
export const TURN_SOUND_KEY = "wg-turn-sound";
