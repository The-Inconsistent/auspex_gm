import "reflect-metadata";
import { createHash } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import express, { type NextFunction, type Request, type Response } from "express";
import { SESSION_COOKIE, bearerOf, verifySession } from "@wg/auth/api";
import { IMAGE_MIMES, IMPORT_MAX_BYTES } from "@wg/shared";
import { AppModule } from "./app.module.ts";
import { readCookie } from "./auth/auth.service.ts";
import { runMigrations } from "./core/db.ts";
import { clientIp, limiter } from "./core/rate-limit.ts";

await runMigrations();
const app = await NestFactory.create(AppModule);
app.setGlobalPrefix("api");
app.enableShutdownHooks();

// The unauthenticated door: guest QR joins, the guest lookup and invites. 60/min leaves room for a whole table of
// phones behind one NAT.
const allowDoor = limiter({ max: 60, windowMs: 60_000 });
app.use(["/api/join", "/api/guest", "/api/invites"], (req: Request, res: Response, next: NextFunction) => {
  if (allowDoor(clientIp(req.headers, req.socket.remoteAddress))) return next();
  res.status(429).json({ message: "Too many requests. Wait a minute." });
});

// The character library (issue #14): signed in, and the builder autosaves, so it gets its own window, per caller rather
// than per IP. A whole table building together sits behind one NAT, and one shared bucket would cut their autosaves off;
// each has their own session. Callers with no session (all of these answer 401) fall back to the IP.
// ponytail: the session token rotates about every 60s, so a determined caller gets a fresh bucket; key it by the Clerk
// user id once the middleware can see one without a DB write
const allowLibrary = limiter({ max: 120, windowMs: 60_000 });
const libraryKey = (req: Request) => {
  const session = bearerOf(req.headers.authorization) ?? readCookie(req.headers.cookie, SESSION_COOKIE);
  return session
    ? `s:${createHash("sha256").update(session).digest("base64url")}` // hashed: tokens don't belong in memory whole
    : `ip:${clientIp(req.headers, req.socket.remoteAddress)}`;
};
app.use(
  ["/api/library", "/api/creation", "/api/rules", "/api/frameworks", "/api/campaigns/import", "/api/admin"],
  (req: Request, res: Response, next: NextFunction) => {
    if (allowLibrary(libraryKey(req))) return next();
    res.status(429).json({ message: "Too many requests. Wait a minute." });
  },
);

// IMPORT GAME posts a whole campaign file, far bigger than the 100 kB default: its pictures ride in it as base64 (issue
// #199), where the text alone runs to about 120 kB. Only that route, after its rate limit, and only for a verified
// creator: the limiter's key is an unverified token, so without this anyone could make the api parse 100 MB at will.
// Wrapped so the handler isn't named `jsonParser`: Nest skips its own global parser if it finds one by that name, and
// every other route would lose its body.
// ponytail: 100 MB, as Next's proxy buffer (next.config.ts) and Cloudflare's free plan allow, is about 75 MB of
// pictures, under the 100 MB a campaign may hold: past that, EXPORT WITHOUT PICTURES; upload them separately if it bites.
const importJson = express.json({ limit: IMPORT_MAX_BYTES });
app.use("/api/campaigns/import", async (req: Request, res: Response, next: NextFunction) => {
  const user = await verifySession(
    bearerOf(req.headers.authorization) ?? readCookie(req.headers.cookie, SESSION_COOKIE),
  );
  if (!user) return res.status(401).json({ message: "Unauthorized" });
  if (!user.creator) return res.status(403).json({ message: "Only creators can start a game" });
  importJson(req, res, next);
});

// A codex picture (issue #199) is raw bytes, not JSON: the browser shrinks it to well under the 1 MB cap first. Uploads
// get their own window per caller, after which only that route parses a raw body.
const IMAGES = "/api/campaigns/:id/images";
const allowImages = limiter({ max: 20, windowMs: 60_000 });
app.use(IMAGES, (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "POST" || allowImages(libraryKey(req))) return next();
  res.status(429).json({ message: "Too many uploads. Wait a minute." });
});
const imageRaw = express.raw({ type: [...IMAGE_MIMES], limit: "1mb" });
app.use(IMAGES, (req: Request, res: Response, next: NextFunction) => imageRaw(req, res, next));

await app.listen(Number(process.env.PORT ?? 4000));
