// ponytail: in-process fixed windows, assumes one api instance; Redis or pg counters if we ever scale out
export function limiter({ max, windowMs }: { max: number; windowMs: number }) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    const h = hits.get(key);
    if (h && now < h.reset) return ++h.n <= max;
    // Bounded memory: drop expired windows once the map gets big.
    if (hits.size > 10_000) for (const [k, v] of hits) if (now >= v.reset) hits.delete(k);
    hits.set(key, { n: 1, reset: now + windowMs });
    return true;
  };
}

// The caller's IP. Every hop (Cloudflare → Pangolin → Next) hides it from the api, but Cloudflare overwrites
// CF-Connecting-IP on each proxied request and Next's rewrites pass it through; Next's own server-side fetches forward
// it (apps/web/app/server-api.ts, join/[token]/route.ts). Without it (dev, smoke test): the socket's peer.
// ponytail: forgeable by a client that bypasses Cloudflare to hit Pangolin directly; allow only Cloudflare IPs there
export function clientIp(headers: Record<string, string | string[] | undefined>, fallback: string | undefined) {
  const cf = headers["cf-connecting-ip"];
  return (Array.isArray(cf) ? cf[0] : cf) ?? fallback ?? "unknown";
}
