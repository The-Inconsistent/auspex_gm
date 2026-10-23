import type { NextConfig } from "next";

import { devHostError } from "./lib/share-origin/share-origin";

// Refuse a NEXT_PUBLIC_DEV_HOST that can't go in a URL, here at startup: it is baked into the client bundle and only
// ever seen inside a QR code, so a bad value would reach a player's phone as an unopenable link with nothing wrong on
// the GM's screen. `next dev` and `next build` both load this file, so neither can start with one.
const devHostProblem = devHostError(process.env.NEXT_PUBLIC_DEV_HOST);
if (devHostProblem) throw new Error(devHostProblem);

// Proxy the API and socket through Next so the browser sees one origin (cookie + no CORS), in dev and in prod: Next
// forwards websocket upgrades on external rewrites. API_ORIGIN is read at build time here (the Docker build bakes in
// http://api:4000; docs/deploy.md).
const api = process.env.API_ORIGIN ?? "http://localhost:4000";

// Dev only: phones and tablets open the app at the machine's LAN address, which the dev server refuses unless it is
// listed here. Script tags still load, because they send no Origin header, but the HMR websocket does and gets a 403 —
// and Turbopack bootstraps through it, so React never hydrates: the page renders server-side and then does nothing,
// leaving the table on SYNCING for ever. Comma-separated hosts, e.g. `DEV_ORIGINS=192.168.1.86` (docs/development.md).
const devOrigins = process.env.DEV_ORIGINS?.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  transpilePackages: ["@wg/auth", "@wg/data", "@wg/shared"],
  ...(devOrigins?.length ? { allowedDevOrigins: devOrigins } : {}),
  output: "standalone",
  skipTrailingSlashRedirect: true, // socket.io's path is "/socket.io/"; Next's slash-stripping 308 would break it
  // With a proxy.ts, Next buffers every request body (its matcher skipping /api changes nothing), cut at 10 MB by
  // default. IMPORT GAME carries a campaign's pictures as base64 (issue #199), so a backup runs past that.
  // ponytail: global, so any route may make Next hold up to 100 MB (Cloudflare's free-plan ceiling) for a request;
  // upload the pictures separately if that's ever a problem.
  experimental: { proxyClientMaxBodySize: "100mb" },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/socket.io/", destination: `${api}/socket.io/` },
      { source: "/socket.io/:path*", destination: `${api}/socket.io/:path*` },
    ];
  },
};

export default nextConfig;
