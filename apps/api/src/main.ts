import "reflect-metadata";
import { createHash } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE, bearerOf } from "@wg/auth/api";
import { AppModule } from "./app.module.ts";
import { readCookie } from "./auth/auth.service.ts";
import { runMigrations } from "./core/db.ts";
import { clientIp, limiter } from "./core/rate-limit.ts";

await runMigrations();
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.setGlobalPrefix("api");
// IMPORT GAME posts a whole campaign file; Express's 100 kB default is smaller than the volkus pack.
app.useBodyParser("json", { limit: "2mb" });
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
  ["/api/library", "/api/creation", "/api/rules", "/api/campaigns/import"],
  (req: Request, res: Response, next: NextFunction) => {
    if (allowLibrary(libraryKey(req))) return next();
    res.status(429).json({ message: "Too many requests. Wait a minute." });
  },
);

await app.listen(Number(process.env.PORT ?? 4000));
