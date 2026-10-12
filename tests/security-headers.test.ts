import test from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../next.config";

test("applies baseline security headers to all routes", async () => {
  const rules = await nextConfig.headers?.();
  assert.ok(rules, "security header rules should be configured");

  const allRoutes = rules.find((rule) => rule.source === "/:path*");
  assert.ok(allRoutes, "security headers should cover every route");

  const values = new Map(allRoutes.headers.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.equal(values.get("x-content-type-options"), "nosniff");
  assert.equal(values.get("x-frame-options"), "DENY");
  assert.equal(values.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(values.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
});
