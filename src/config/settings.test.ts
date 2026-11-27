// Copyright (c) 2026 DPSystems, LLC.
// Tests for reading server settings from the environment.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadServerSettings } from "./settings.ts";

const BASE = {
  DRAFTMYLISTING_PUBLIC_URL: "https://listings.example.net:1519",
  DRAFTMYLISTING_HOUSEHOLD_PASSWORD: "correct horse battery",
  DRAFTMYLISTING_DATA_DIR: "/data",
};

describe("loadServerSettings", () => {
  it("applies defaults for host, ports and log folder", () => {
    const s = loadServerSettings({ ...BASE });
    assert.equal(s.host, "127.0.0.1");
    assert.equal(s.port, 8430);
    assert.equal(s.healthPort, 8431);
    assert.equal(s.logDir, "/data/logs");
    assert.equal(s.publicUrl.href, "https://listings.example.net:1519/");
  });

  it("refuses a password shorter than 12 characters", () => {
    assert.throws(
      () =>
        loadServerSettings({
          ...BASE,
          DRAFTMYLISTING_HOUSEHOLD_PASSWORD: "short",
        }),
      /at least 12/,
    );
  });

  it("refuses a public address that is not https, except on localhost", () => {
    assert.throws(
      () =>
        loadServerSettings({
          ...BASE,
          DRAFTMYLISTING_PUBLIC_URL: "http://example.net",
        }),
      /https/,
    );
    assert.equal(
      loadServerSettings({
        ...BASE,
        DRAFTMYLISTING_PUBLIC_URL: "http://127.0.0.1:8430",
      }).publicUrl.protocol,
      "http:",
    );
  });

  it("refuses a port that is not a number", () => {
    assert.throws(
      () => loadServerSettings({ ...BASE, DRAFTMYLISTING_PORT: "eighty" }),
      /port number/,
    );
  });

  it("requires a data folder", () => {
    assert.throws(
      () => loadServerSettings({ ...BASE, DRAFTMYLISTING_DATA_DIR: "" }),
      /DATA_DIR/,
    );
  });
});
