// Copyright (c) 2026 DPSystems, LLC.
// Tests for reading KEY=VALUE settings files without leaking their contents in errors.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadEnvFile, parseEnvText } from "./env-file.ts";

describe("parseEnvText", () => {
  it("reads keys and values, skipping blanks and comments", () => {
    const values = parseEnvText("# note\n\nA=1\r\nB = two words \n");
    assert.deepEqual(
      [...values],
      [
        ["A", "1"],
        ["B", "two words"],
      ],
    );
  });

  it("strips a byte-order mark and matching surrounding quotes", () => {
    const values = parseEnvText('\uFEFFA="quoted"\nB=\'single\'\nC="open');
    assert.equal(values.get("A"), "quoted");
    assert.equal(values.get("B"), "single");
    assert.equal(values.get("C"), '"open');
  });

  it("keeps everything after the first equals sign", () => {
    assert.equal(parseEnvText("T=v^1.1#i^1=x").get("T"), "v^1.1#i^1=x");
  });

  it("allows empty values", () => {
    assert.equal(parseEnvText("EMPTY=").get("EMPTY"), "");
  });

  it("reports a malformed line by number without echoing its content", () => {
    assert.throws(
      () => parseEnvText("A=1\nsecret-without-equals"),
      (error: Error) =>
        error.message.includes("line 2") &&
        !error.message.includes("secret-without-equals"),
    );
  });
});

describe("loadEnvFile", () => {
  it("loads a file from disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "dml-env-"));
    try {
      const path = join(dir, "runtime.env");
      writeFileSync(path, "KEY=value\n");
      assert.equal(loadEnvFile(path).get("KEY"), "value");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("explains how to point at the file when it is missing", () => {
    assert.throws(
      () => loadEnvFile(join(tmpdir(), "dml-does-not-exist", "runtime.env")),
      /DRAFTMYLISTING_ENV_FILE/,
    );
  });
});
