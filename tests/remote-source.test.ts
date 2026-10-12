import test from "node:test";
import assert from "node:assert/strict";
import { isPublicIPAddress } from "../lib/remote-source";

test("rejects IPv6 documentation and protocol-specific destinations", () => {
  for (const address of [
    "2001:0::1",
    "2001:1::1",
    "2001:30::1",
    "2001:3f:ffff::1",
    "3fff::1",
    "3fff:f::1",
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
  ]) {
    assert.equal(isPublicIPAddress(address), true, address);
  }
});

test("rejects private, link-local, and documentation IPv4 destinations", () => {
  for (const address of [
    "0.0.0.0",
    "10.0.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.51.100.10",
    "203.0.113.10",
    "not-an-ip",
  ]) {
    assert.equal(isPublicIPAddress(address), false, address);
  }
});
