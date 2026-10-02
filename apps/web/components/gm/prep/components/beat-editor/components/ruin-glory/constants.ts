import type { Pool } from "@wg/shared";

// The spend toggle's order: Ruin first, since most planned spends are the GM's.
export const SPEND_POOLS: readonly Pool[] = ["ruin", "glory"];
