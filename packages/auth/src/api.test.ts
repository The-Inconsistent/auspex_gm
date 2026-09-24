import { test } from "node:test";
import assert from "node:assert/strict";

// api.ts reads CLERK_TEST_SECRET at load, so set it before the import.
process.env.CLERK_TEST_SECRET = "s3cret";
const { bearerOf, testSessionToken, verifySession } = await import("./api.ts");

test("bearerOf takes only a Bearer header", () => {
  assert.equal(bearerOf("Bearer abc"), "abc");
  assert.equal(bearerOf("Basic abc"), undefined);
  assert.equal(bearerOf(undefined), undefined);
});

test("test tokens need the right secret", async () => {
  assert.deepEqual(await verifySession(testSessionToken({ secret: "s3cret", userId: "gm", role: "creator" })), { userId: "gm", name: "gm", creator: true });
  assert.equal((await verifySession(testSessionToken({ secret: "s3cret", userId: "ana" })))?.creator, false);
  assert.equal(await verifySession(testSessionToken({ secret: "wrong", userId: "gm", role: "creator" })), null);
});

test("empty or malformed tokens are signed out", async () => {
  assert.equal(await verifySession(undefined), null);
  assert.equal(await verifySession(""), null);
  assert.equal(await verifySession("test."), null);
  assert.equal(await verifySession("not-a-jwt"), null);
});
