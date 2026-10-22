// Which edge of its button a header popover's panel hangs from.
export const POPOVER_ALIGNS = ["start", "end"] as const;
export type PopoverAlign = (typeof POPOVER_ALIGNS)[number];
