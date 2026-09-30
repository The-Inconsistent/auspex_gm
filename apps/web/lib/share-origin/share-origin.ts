// The origin to put in a QR code or invite link: the address the *phone* has to reach, which is not always the one
// the GM's browser is on. In dev the GM usually works at localhost, and a QR holding `http://localhost:3000/...`
// is unscannable — the phone resolves localhost to itself. NEXT_PUBLIC_DEV_HOST swaps in this machine's LAN address
// for those codes only. Unset in production, where the GM is already on the real hostname.
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

// A bare host and nothing else: a name or IPv4 ("192.168.1.86"), or IPv6 in brackets ("[fe80::1]", which a URL needs
// before a port). No scheme, no port, no path.
const BARE_HOST =
  /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*|\[[0-9A-Fa-f:.]+\])$/;

// Why this NEXT_PUBLIC_DEV_HOST can't be used, or null. It is checked at startup (next.config.ts) rather than when a
// code is shown, because the mistake is invisible to the GM: the value goes into a QR code, so a pasted
// "http://192.168.1.86:3000" would render a valid-looking code that no phone can open, and the first sign of it is a
// player at the table saying nothing happens.
export function devHostError(value: string | undefined): string | null {
  const host = value?.trim();
  if (!host) return null; // unset: QR codes use the address the GM's browser is on, which is the default
  if (BARE_HOST.test(host)) return null;
  // More than one colon is an IPv6 address, which needs brackets; one is a port. Checked in that order, because
  // "fe80::1" ends in a colon and a digit and would otherwise read as a port.
  const colons = host.match(/:/g)?.length ?? 0;
  const why = /:\/\//.test(host)
    ? "it has a scheme"
    : host.includes("/")
      ? "it has a path"
      : colons > 1
        ? "an IPv6 address needs square brackets, e.g. [fe80::1]"
        : colons === 1
          ? "it has a port (the browser's own port is kept)"
          : "it is not a bare host";
  return `NEXT_PUBLIC_DEV_HOST="${host}" can't go in a QR code: ${why}. Give one host, e.g. 192.168.1.86`;
}

type Origin = Pick<Location, "protocol" | "hostname" | "port" | "origin">;

export function shareOrigin(loc: Origin, devHost = process.env.NEXT_PUBLIC_DEV_HOST): string {
  // A bad value is refused at startup, so this only guards the case where that check was bypassed: better the GM's own
  // address, which at worst doesn't scan, than a malformed one that can't.
  if (!devHost || devHostError(devHost) || !LOOPBACK.has(loc.hostname)) return loc.origin;
  return `${loc.protocol}//${devHost.trim()}${loc.port ? `:${loc.port}` : ""}`;
}
