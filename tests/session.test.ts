import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionToken,
  isAuthConfigurationReady,
  SESSION_TTL_SECONDS,
  verifySessionToken,
} from "../lib/session";

const secret = "unit-test-secret-that-is-at-least-32-bytes-long";
const now = 1_800_000_000;

test("owner access configuration requires a long owner password and a 32-byte secret", () => {
  assert.equal(isAuthConfigurationReady("a-long-test-owner-password", secret), true);
  assert.equal(isAuthConfigurationReady("short", secret), false);
  assert.equal(isAuthConfigurationReady("a-long-test-owner-password", "too-short"), false);
  assert.equal(isAuthConfigurationReady("", secret), false);
});

test("signed owner sessions verify only for the expected secret and while unexpired", async () => {
  const token = await createSessionToken(secret, now + SESSION_TTL_SECONDS);
  assert.equal(await verifySessionToken(token, secret, now), true);
  assert.equal(await verifySessionToken(token, "a-different-session-secret-that-is-at-least-32-bytes-long", now), false);
  assert.equal(await verifySessionToken(token, secret, now + SESSION_TTL_SECONDS), false);
});

test("tampered and malformed owner session tokens are rejected", async () => {
  const token = await createSessionToken(secret, now + SESSION_TTL_SECONDS);
  const [expires, signature] = token.split(".");
  const replacement = signature.startsWith("A") ? "B" : "A";
  assert.equal(await verifySessionToken(`${expires}.${replacement}${signature.slice(1)}`, secret, now), false);
  assert.equal(await verifySessionToken("not-a-session", secret, now), false);
  assert.equal(await verifySessionToken(undefined, secret, now), false);
  assert.equal(await verifySessionToken(token, undefined, now), false);
});

test("session creation rejects short secrets and invalid expirations", async () => {
  await assert.rejects(() => createSessionToken("short", now + SESSION_TTL_SECONDS));
  await assert.rejects(() => createSessionToken(secret, 0));
});
