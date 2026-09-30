import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { devHostError, shareOrigin } from "./share-origin.ts";

const loc = (hostname: string, port = "3000", protocol = "http:") => ({
  protocol,
  hostname,
  port,
  origin: `${protocol}//${hostname}${port ? `:${port}` : ""}`,
});

describe("shareOrigin", () => {
  test("swaps a loopback host for the dev host, keeping the port", () => {
    assert.equal(shareOrigin(loc("localhost"), "192.168.1.86"), "http://192.168.1.86:3000");
    assert.equal(shareOrigin(loc("127.0.0.1"), "192.168.1.86"), "http://192.168.1.86:3000");
    assert.equal(shareOrigin(loc("[::1]"), "192.168.1.86"), "http://192.168.1.86:3000");
  });

  test("leaves a non-loopback host alone, so the LAN and production are untouched", () => {
    assert.equal(shareOrigin(loc("192.168.1.86"), "10.0.0.5"), "http://192.168.1.86:3000");
    assert.equal(
      shareOrigin(loc("auspex.ydothien.work", "", "https:"), "192.168.1.86"),
      "https://auspex.ydothien.work",
    );
  });

  test("without a dev host configured it is the browser's own origin", () => {
    assert.equal(shareOrigin(loc("localhost"), undefined), "http://localhost:3000");
    assert.equal(shareOrigin(loc("localhost"), ""), "http://localhost:3000");
  });

  test("drops the colon when the origin has no explicit port", () => {
    assert.equal(shareOrigin(loc("localhost", ""), "192.168.1.86"), "http://192.168.1.86");
  });

  // A value the startup check would have refused never reaches a QR code as a malformed URL.
  test("a host that isn't usable falls back to the browser's own origin", () => {
    assert.equal(shareOrigin(loc("localhost"), "http://192.168.1.86:3000"), "http://localhost:3000");
    assert.equal(shareOrigin(loc("localhost"), "192.168.1.86/"), "http://localhost:3000");
  });
});

// next.config.ts throws on these when the dev server or the build starts: the value ends up inside a QR code, where a
// mistake is invisible until a player's phone won't open it.
describe("devHostError", () => {
  test("a bare host is what it wants, and unset is fine", () => {
    for (const ok of ["192.168.1.86", "auspex.local", "tablet", "[fe80::1]", "10.0.0.5"])
      assert.equal(devHostError(ok), null, ok);
    assert.equal(devHostError(undefined), null);
    assert.equal(devHostError(""), null);
    assert.equal(devHostError("  "), null);
  });

  test("it says which mistake was made", () => {
    assert.match(devHostError("http://192.168.1.86")!, /has a scheme/);
    assert.match(devHostError("192.168.1.86:3000")!, /has a port/);
    assert.match(devHostError("192.168.1.86/join")!, /has a path/);
    assert.match(devHostError("192.168.1.86/")!, /has a path/);
    assert.match(devHostError("fe80::1")!, /square brackets/);
    assert.match(devHostError("not a host")!, /not a bare host/);
    // The value is quoted back, so the GM can see what the shell or the .env file actually passed.
    assert.ok(devHostError("http://192.168.1.86")!.includes('NEXT_PUBLIC_DEV_HOST="http://192.168.1.86"'));
  });
});
