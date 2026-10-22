// The two ways STORY shows an adventure: its scenes hung on a spine, or one scene as a book spread.
export const STORY_VIEWS = { board: "BOARD", page: "PAGE" } as const;
export type StoryView = keyof typeof STORY_VIEWS;
