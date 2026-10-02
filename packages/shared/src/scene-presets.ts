import { z } from "zod";
import { Source } from "./source.ts";
import { SKILLS, type Skill } from "./state.ts";

// GM-only book data for building scenes (GitHub issue #39), served by /api/campaigns/:id/scene-presets.

// Skills and DN (Core pp.122–126): one printed example per Skill and DN, shown under the scene editor's DN chips.
// Psychic Mastery has none. Book text, so it never reaches a player.
export const SkillDn = z.object({
  skill: z.enum(Object.keys(SKILLS) as [Skill, ...Skill[]]),
  dn: z.number().int().min(1),
  source: Source,
  page: z.number().int().positive(), // printed page
  example: z.string().min(1).max(200), // as printed
});
export type SkillDn = z.infer<typeof SkillDn>;

export const ScenePresets = z.object({ skillDns: z.array(SkillDn) });
export type ScenePresets = z.infer<typeof ScenePresets>;
