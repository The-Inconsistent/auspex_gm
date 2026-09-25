import { SOURCES, type Threat } from "@wg/shared";

// Threat books that aren't creation/wargear sources, so they have no SOURCES entry (CLAUDE.md cite style).
const THREAT_ONLY_CITES: Record<string, string> = { "threat-assessment": "TA", "gutshivas-kommandos": "GK" };

// "Core p.339", "TA p.8": the page cite at the right of a stat block's title bar.
export const threatCite = (t: Threat) =>
  `${t.source in SOURCES ? SOURCES[t.source as keyof typeof SOURCES].cite : (THREAT_ONLY_CITES[t.source] ?? t.source)} p.${t.page}`;
