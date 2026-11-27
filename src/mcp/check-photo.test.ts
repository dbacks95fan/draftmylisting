// Copyright (c) 2026 DPSystems, LLC.
// Tests for the check_photo probe tool, against a real SQLite store in a temp folder.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { openStore, type Store } from "../store/db.ts";
import { checkPhoto, MAX_PHOTO_BYTES } from "./check-photo.ts";

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let dir: string;
let store: Store;
const count = () =>
  Number(store.prepare("SELECT COUNT(*) AS n FROM photo_probes").get()?.n);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dml-photo-"));
  store = openStore(dir);
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("checkPhoto", () => {
  it("reports a base64 photo's format and size and records the probe", async () => {
    const result = await checkPhoto(
      { image_base64: PNG_1X1, mime_type: "image/png" },
      { store },
    );
    assert.equal(result.isError, false);
    assert.match(result.text, /PNG photo by base64: 1 × 1 pixels/);
    assert.equal(count(), 1);
  });

  it("accepts a data URL", async () => {
    const result = await checkPhoto(
      { image_base64: `data:image/png;base64,${PNG_1X1}` },
      { store },
    );
    assert.match(result.text, /1 × 1 pixels/);
  });

  it("fetches an https link", async () => {
    // Response.url is read-only, so the fake sets it the way fetch would.
    const fakeFetch = (async () =>
      Object.defineProperty(
        new Response(Buffer.from(PNG_1X1, "base64")),
        "url",
        { value: "https://files.example/p.png" },
      )) as typeof fetch;
    const result = await checkPhoto(
      { image_url: "https://files.example/p.png" },
      { store, fetch: fakeFetch },
    );
    assert.match(result.text, /PNG photo by url/);
  });

  it("refuses a link that is not https", async () => {
    const result = await checkPhoto(
      { image_url: "http://files.example/p.png" },
      { store },
    );
    assert.equal(result.isError, true);
    assert.equal(count(), 0);
  });

  it("refuses both or neither input", async () => {
    assert.equal((await checkPhoto({}, { store })).isError, true);
    assert.equal(
      (
        await checkPhoto(
          { image_base64: PNG_1X1, image_url: "https://x.example" },
          { store },
        )
      ).isError,
      true,
    );
  });

  it("refuses a photo over the size limit", async () => {
    const big = Buffer.alloc(MAX_PHOTO_BYTES + 1).toString("base64");
    const result = await checkPhoto({ image_base64: big }, { store });
    assert.equal(result.isError, true);
    assert.match(result.text, /25 MB/);
  });
});
