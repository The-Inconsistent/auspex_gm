import type { Beat } from "./types";

// A beat's editable fields: what `codex.save` takes as `data` (id and order are server-owned).
export const stripBeat = ({ id, order, ...rest }: Beat) => rest;

// A scene's number on screen: its place in the adventure, as two digits.
export const sceneNumber = (index: number) => String(index + 1).padStart(2, "0");
