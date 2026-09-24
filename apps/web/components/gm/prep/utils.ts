import type { Beat } from "./types";

// A beat's editable fields: what `codex.save` takes as `data` (id and order are server-owned).
export const stripBeat = ({ id, order, ...rest }: Beat) => rest;
