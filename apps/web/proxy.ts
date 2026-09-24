import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk session handling on every page. Nothing is blocked here: each page decides whether it needs a signed-in user,
// because guest players join by QR without an account. /api and /socket.io are proxied to the Nest api, which checks
// the Clerk token itself (apps/api/src/auth/clerk.ts).
export default clerkMiddleware();

export const config = {
  matcher: ["/((?!_next|api/|socket\\.io|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)"],
};
