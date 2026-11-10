// Copyright (c) 2026 DPSystems, LLC.
// Tests the photo upload's local checks, which run before anything is sent to eBay.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveEbayConfig } from "./config.ts";
import { uploadImageFromFile } from "./media.ts";

const CONFIG = resolveEbayConfig(
  new Map([
    ["EBAY_SANDBOX_APP_ID", "id"],
    ["EBAY_SANDBOX_CLIENT_SECRET", "secret"],
    ["EBAY_SANDBOX_REFRESH_TOKEN", "refresh"],
  ]),
  "sandbox",
);

describe("uploadImageFromFile", () => {
  it("rejects unsupported file types before reading or sending anything", async () => {
    await assert.rejects(
      uploadImageFromFile(CONFIG, "token", "C:/photos/item.heic"),
      /Unsupported photo type for item\.heic/,
    );
  });
});
