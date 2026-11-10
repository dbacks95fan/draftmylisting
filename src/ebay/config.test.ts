// Copyright (c) 2026 DPSystems, LLC.
// Tests that sandbox and production settings resolve to the right names and endpoints.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveEbayConfig } from "./config.ts";

const SETTINGS = new Map([
  ["EBAY_SANDBOX_APP_ID", "sandbox-id"],
  ["EBAY_SANDBOX_CLIENT_SECRET", "sandbox-secret"],
  ["EBAY_SANDBOX_REFRESH_TOKEN", "sandbox-refresh"],
  ["EBAY_APP_ID", "prod-id"],
  ["EBAY_CLIENT_SECRET", "prod-secret"],
  ["EBAY_REFRESH_TOKEN", "prod-refresh"],
]);

describe("resolveEbayConfig", () => {
  it("uses EBAY_SANDBOX_ settings and sandbox hosts for sandbox", () => {
    const config = resolveEbayConfig(SETTINGS, "sandbox");
    assert.equal(config.clientId, "sandbox-id");
    assert.equal(config.refreshToken, "sandbox-refresh");
    assert.match(config.tokenUrl, /api\.sandbox\.ebay\.com/);
    assert.match(config.graphqlUrl, /graphqlapi\.sandbox\.ebay\.com/);
  });

  it("uses bare EBAY_ settings and production hosts for production", () => {
    const config = resolveEbayConfig(SETTINGS, "production");
    assert.equal(config.clientId, "prod-id");
    assert.equal(config.clientSecret, "prod-secret");
    assert.equal(config.graphqlUrl, "https://graphqlapi.ebay.com/graphql");
  });

  it("names the missing setting, but never a value", () => {
    const partial = new Map([["EBAY_SANDBOX_APP_ID", "sandbox-id"]]);
    assert.throws(
      () => resolveEbayConfig(partial, "sandbox"),
      (error: Error) =>
        error.message.includes("EBAY_SANDBOX_CLIENT_SECRET") &&
        !error.message.includes("sandbox-id"),
    );
  });

  it("treats an empty value as missing", () => {
    const empty = new Map([...SETTINGS, ["EBAY_REFRESH_TOKEN", ""]]);
    assert.throws(
      () => resolveEbayConfig(empty, "production"),
      /EBAY_REFRESH_TOKEN/,
    );
  });
});
