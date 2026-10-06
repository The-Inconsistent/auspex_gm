// Clerk's global metadata and session-claim types, narrowed to what this app sets (docs/development.md, "Clerk").
// Referenced from src/api.ts and src/next.ts, so every consumer of @wg/auth gets them.
export {};

declare global {
  // Set by hand per user in the Clerk Dashboard (Users → public metadata). "creator" may start games in the lobby;
  // anyone else only joins by invite. "admin" is a creator who also reaches /admin and acts as GM at every table
  // (docs/architecture.md, "Access").
  interface UserPublicMetadata {
    role?: "creator" | "admin";
  }

  // The Dashboard's session-token template:
  //   { "metadata": "{{user.public_metadata}}", "name": "{{user.full_name}}", "username": "{{user.username}}" }
  // Values come from the token, so api.ts still checks them at runtime.
  interface CustomJwtSessionClaims {
    metadata?: UserPublicMetadata;
    name?: string | null;
    username?: string | null;
  }
}
