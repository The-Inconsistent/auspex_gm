// The two layers of SCENE: the scene as printed, and the fight inside it (the tracker). The switch shows only while a
// fight is live.
export const SCENE_LAYERS = ["scene", "fight"] as const;
export type SceneLayer = (typeof SCENE_LAYERS)[number];
