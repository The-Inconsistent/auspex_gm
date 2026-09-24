import { authMiddleware } from "@wg/auth/next";

// Clerk session handling on every page. Nothing is blocked here: each page decides whether it needs a signed-in user,
// because guest players join by QR without an account. /api and /socket.io are proxied to the Nest api, which checks
// the Clerk token itself (packages/auth/src/api.ts).
export default authMiddleware();

export const config = {
  matcher: ["/((?!_next|api/|socket\\.io|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)"],
};
