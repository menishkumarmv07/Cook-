import test from "node:test";
import assert from "node:assert/strict";
import { isPublicIPAddress, RemoteSourceError, validateExternalSourceUrl } from "../lib/remote-source";

test("rejects IPv6 documentation and protocol-specific destinations", () => {
  for (const address of [
    "2001:0::1",
    "2001:1::4",
    "2001:100::1",
    "2001:1ff:ffff::1",
    "2001:2::1",
    "2001:3::1",
    "2001:4:112::1",
    "2001:20::1",
    "2001:2f:ffff::1",
    "2001:30::1",
    "2001:3f:ffff::1",
    "2620:4f:8000::1",
    "3fff::1",
    "3fff:f::1",
    "3fff:10::1",
    "3fff:fff::1",
    "2001:db8::1",
    "2002::1",
    "fc00::1",
    "fe80::1",
    "::1",
  ]) {
    assert.equal(isPublicIPAddress(address), false, address);
  }
});

test("accepts ordinary globally reachable IP addresses", () => {
  for (const address of [
    "8.8.8.8",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
    "2001:1::1",
    "2001:1::2",
    "2001:1::3",
  ]) {
    assert.equal(isPublicIPAddress(address), true, address);
  }
});

test("accepts standard HTTP(S) recipe URLs and strips fragments", () => {
  const url = validateExternalSourceUrl("https://www.foodsite.com/recipe#instructions");
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "www.foodsite.com");
  assert.equal(url.hash, "");
});

test("rejects malformed, credential-bearing, non-HTTP(S), custom-port, and local URLs", () => {
  const cases: Array<[string, RemoteSourceError["code"]]> = [
    ["not a URL", "INVALID_URL"],
    ["ftp://www.foodsite.com/recipe", "INVALID_URL"],
    ["https://user:secret@www.foodsite.com/recipe", "INVALID_URL"],
    ["https://www.foodsite.com:8443/recipe", "INVALID_URL"],
    ["http://localhost", "BLOCKED_HOST"],
    ["http://127.0.0.1", "BLOCKED_HOST"],
    ["https://www.foodsite.example/recipe", "BLOCKED_HOST"],
  ];

  for (const [input, expectedCode] of cases) {
    assert.throws(
      () => validateExternalSourceUrl(input),
      (error: unknown) => error instanceof RemoteSourceError && error.code === expectedCode,
      input,
    );
  }
});

test("rejects private, link-local, and documentation IPv4 destinations", () => {
  for (const address of [
    "0.0.0.0",
    "10.0.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "192.0.2.1",
    "192.31.196.1",
    "192.52.193.1",
    "192.168.1.1",
    "192.175.48.1",
    "198.51.100.10",
    "203.0.113.10",
    "not-an-ip",
  ]) {
    assert.equal(isPublicIPAddress(address), false, address);
  }
});
