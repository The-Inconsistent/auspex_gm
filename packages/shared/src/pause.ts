// The pause card (issue #194, rules-flow §11.157): any player's phone tells the GM "someone asked to stop". A socket
// event outside the action path (table.gateway.ts), like the book relay: it changes no state and is never stored.
// Its payload is the moment only, never who sent it.
export type PauseSignal = { at: string };

// One tap per phone per window; the phone keeps its PAUSE button disabled for as long, so a tap it shows as sent is one
// the server took.
export const PAUSE_WINDOW_MS = 10_000;
// Across the whole table: enough to be heard, not enough to drown the GM's tablet.
export const PAUSE_TABLE_MAX = 6;
export const PAUSE_TABLE_WINDOW_MS = 60_000;
