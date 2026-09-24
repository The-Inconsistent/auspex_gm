import type { NextConfig } from "next";

// Dev: proxy the API and socket through Next so the browser sees one origin (cookie + no CORS).
// Prod: Caddy routes /api and /socket.io to the api container, so these rewrites aren't hit.
const api = process.env.API_ORIGIN ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  transpilePackages: ["@wg/shared"],
  output: "standalone",
  skipTrailingSlashRedirect: true, // socket.io's path is "/socket.io/"; Next's slash-stripping 308 would break it
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/socket.io/", destination: `${api}/socket.io/` },
      { source: "/socket.io/:path*", destination: `${api}/socket.io/:path*` },
    ];
  },
};

export default nextConfig;
