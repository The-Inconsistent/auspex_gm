import type { Request, Response } from "express";

// A body built and gzipped once at first use (the creation catalogue: about 2 MB of JSON).
export type CachedPayload = { json: Buffer; gzip: Buffer; etag: string };

// Serves a CachedPayload: the ETag lets a phone revalidate instead of downloading it again, and gzip goes out when the
// caller takes it. `private` because the body depends on who's asking (the books their table allows).
export function sendCached({ req, res, payload }: { req: Request; res: Response; payload: CachedPayload }) {
  res.set({
    "content-type": "application/json",
    "cache-control": "private, no-cache",
    vary: "accept-encoding",
    etag: payload.etag,
  });
  if (req.headers["if-none-match"] === payload.etag) return void res.status(304).end();
  if (/\bgzip\b/.test(req.headers["accept-encoding"] ?? ""))
    return void res.set("content-encoding", "gzip").send(payload.gzip);
  res.send(payload.json);
}
