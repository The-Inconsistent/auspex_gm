// Server-side only: where Next reaches the api directly (the browser goes through the rewrites in next.config.ts).
export const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

// The httpOnly guest cookie the api sets on /api/join and guest invites (COOKIE in apps/api/src/auth/auth.service.ts).
export const TOKEN_COOKIE = "wg_token";

// Why /join/<token> bounced the caller back home, keyed by the `?join=` value.
export const JOIN_ERRORS = {
  invalid: "LINK INVALID OR REVOKED. ASK YOUR GM FOR A NEW QR CODE.",
  nosignal: "NO SIGNAL. CHECK THE CONNECTION AND RETRY.",
} as const;
export type JoinError = keyof typeof JOIN_ERRORS;

export const NO_ACCESS = "NO ACCESS. ASK YOUR GM FOR AN INVITE.";
