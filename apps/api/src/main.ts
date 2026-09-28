import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module.ts";
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

// The character library (issue #14): signed in, but the builder autosaves, so it gets its own, wider window. A debounced
// autosave is a handful a minute; this leaves room for several tabs and the catalogue fetch behind one NAT.
const allowLibrary = limiter({ max: 240, windowMs: 60_000 });
app.use(["/api/library", "/api/creation", "/api/rules"], (req: Request, res: Response, next: NextFunction) => {
  if (allowLibrary(clientIp(req.headers, req.socket.remoteAddress))) return next();
  res.status(429).json({ message: "Too many requests. Wait a minute." });
});

await app.listen(Number(process.env.PORT ?? 4000));
