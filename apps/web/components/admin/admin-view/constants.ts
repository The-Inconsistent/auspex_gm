export const ADMIN_TABS = ["USERS", "GAMES"] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

// Role changes are made in Clerk (publicMetadata.role), never in the app (docs/development.md, §Clerk).
export const CLERK_DASHBOARD = "https://dashboard.clerk.com/";
