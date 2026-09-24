import type { NextConfig } from "next";

// Proxy the API and socket through Next so the browser sees one origin (cookie + no CORS), in dev and in prod: Next
// forwards websocket upgrades on external rewrites. API_ORIGIN is read at build time here (the Docker build bakes in
// http://api:4000; docs/deploy.md).
const api = process.env.API_ORIGIN ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  transpilePackages: ["@wg/auth", "@wg/shared"],
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
