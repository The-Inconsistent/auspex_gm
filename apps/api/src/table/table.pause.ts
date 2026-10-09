import { PAUSE_TABLE_MAX, PAUSE_TABLE_WINDOW_MS, PAUSE_WINDOW_MS, type PauseSignal, type Role } from "@wg/shared";
import { limiter } from "../core/rate-limit.ts";

type PauseTap = { role: Role; campaignId: string; socketId: string };

// The pause card's rules (issue #194), apart from the gateway so they're testable without a socket server. Returns
// what the GM room receives, or null for a tap that goes nowhere. Only a player seat (member or guest) sends one: the
// GM has no need to, and the table screen is nobody. An over-limit tap is dropped silently, never refused, so no answer
// hints at who else just tapped. The signal carries the moment and nothing else: no socket, user or character id ever
// enters it, and nothing is stored or logged.
export function pauseRelay() {
  const bySocket = limiter({ max: 1, windowMs: PAUSE_WINDOW_MS });
  const byTable = limiter({ max: PAUSE_TABLE_MAX, windowMs: PAUSE_TABLE_WINDOW_MS });
  return ({ role, campaignId, socketId }: PauseTap): PauseSignal | null => {
    if (role !== "player") return null;
    // The socket's own window first, so a phone tapping again doesn't use up the table's budget.
    if (!bySocket(socketId) || !byTable(campaignId)) return null;
    return { at: new Date().toISOString() };
  };
}
