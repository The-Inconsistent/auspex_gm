// Where a RUN BY picker sits: the row's last column, or the side panel (issue #350).
export const RUN_BY_AS = { chip: "chip", button: "button" } as const;
export type RunByAs = (typeof RUN_BY_AS)[keyof typeof RUN_BY_AS];
