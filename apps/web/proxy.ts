import type { NextFetchEvent, NextRequest } from "next/server";

import { SESSION_COOKIE, authMiddleware } from "@wg/auth/next";

import { TOKEN_COOKIE } from "@/app/constants";

const clerk = authMiddleware();

// Clerk session handling on every page. Nothing is blocked here: each page decides whether it needs a signed-in user,
// because guest players join by QR without an account. /api and /socket.io are proxied to the Nest api, which checks
// the Clerk token itself (packages/auth/src/api.ts).
//
// A guest is skipped entirely. Clerk has no account to resolve for them, so on a development instance it keeps
// redirecting to finish its browser handshake — which on iOS can never complete, because the cookie that handshake
// needs is third-party and WebKit blocks it. The table page then reloads in a loop and the socket never lives long
// enough to take its first snapshot, so the player sits on SYNCING forever. Skipping is safe precisely because this
// proxy protects nothing: a guest gets an empty Clerk context, which is exactly what they are. A signed-in user still
// carries `__session`, so the GM keeps full Clerk handling even on a device that once held a QR seat.
export default function proxy(req: NextRequest, event: NextFetchEvent) {
  const guest = req.cookies.has(TOKEN_COOKIE) && !req.cookies.has(SESSION_COOKIE);
  return guest ? undefined : clerk(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|api/|socket\\.io|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)",
  ],
};
