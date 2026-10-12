import assert from "node:assert/strict";
import test from "node:test";
import { signOwnerSession, verifyOwnerPassword, verifyOwnerSession } from "../lib/owner-session";

test("owner session accepts a correctly signed unexpired token", () => {
  process.env.COOKING_SESSION_SECRET = "test-only-secret-with-at-least-32-characters";
  const now = 1_800_000_000_000;
  const expiresAt = now + 60_000;
  const token = `${expiresAt}.${signOwnerSession(expiresAt)}`;
  assert.equal(verifyOwnerSession(token, now), true);
});

test("owner session rejects expired, malformed, and tampered tokens", () => {
  process.env.COOKING_SESSION_SECRET = "test-only-secret-with-at-least-32-characters";
  const now = 1_800_000_000_000;
  const expired = now - 1;
  assert.equal(verifyOwnerSession(`${expired}.${signOwnerSession(expired)}`, now), false);
  assert.equal(verifyOwnerSession("not-a-token", now), false);
  const expiry = now + 60_000;
  assert.equal(verifyOwnerSession(`${expiry}.${"0".repeat(64)}`, now), false);
});

test("owner password check only accepts the configured password", () => {
  process.env.COOKING_OWNER_PASSWORD = "local-test-password";
  assert.equal(verifyOwnerPassword("local-test-password"), true);
  assert.equal(verifyOwnerPassword("incorrect-password"), false);
});
