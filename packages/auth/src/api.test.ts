import { test } from "node:test";
import assert from "node:assert/strict";

// api.ts reads CLERK_TEST_SECRET at load, so set it before the import.
process.env.CLERK_TEST_SECRET = "s3cret";
const { bearerOf, pemBody, testSessionToken, verifySession } = await import("./api.ts");

test("bearerOf takes only a Bearer header", () => {
  assert.equal(bearerOf("Bearer abc"), "abc");
  assert.equal(bearerOf("Basic abc"), undefined);
  assert.equal(bearerOf(undefined), undefined);
});

test("test tokens need the right secret", async () => {
  assert.deepEqual(await verifySession(testSessionToken({ secret: "s3cret", userId: "gm", role: "creator" })), {
    userId: "gm",
    name: "gm",
    creator: true,
    admin: false,
  });
  assert.equal((await verifySession(testSessionToken({ secret: "s3cret", userId: "ana" })))?.creator, false);
  // An admin is also a creator.
  const admin = await verifySession(testSessionToken({ secret: "s3cret", userId: "root", role: "admin" }));
  assert.deepEqual([admin?.creator, admin?.admin], [true, true]);
  assert.equal(await verifySession(testSessionToken({ secret: "wrong", userId: "gm", role: "creator" })), null);
});

test("empty or malformed tokens are signed out", async () => {
  assert.equal(await verifySession(undefined), null);
  assert.equal(await verifySession(""), null);
  assert.equal(await verifySession("test."), null);
  assert.equal(await verifySession("not-a-jwt"), null);
});

test("pemBody survives however the PEM was pasted", () => {
  const body = "MIIBIjAN" + "BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwWyB" + "IDAQAB";
  const pem = `-----BEGIN PUBLIC KEY-----\n${body.slice(0, 8)}\n${body.slice(8, 48)}\n${body.slice(48)}\n-----END PUBLIC KEY-----\n`;
  assert.equal(pemBody(pem), body);
  assert.equal(pemBody(pem.replace(/\n/g, " ")), body); // newlines turned into spaces by an env editor
  assert.equal(pemBody(body), body);
  assert.equal(pemBody(undefined), undefined);
  assert.equal(pemBody(""), undefined);
});
