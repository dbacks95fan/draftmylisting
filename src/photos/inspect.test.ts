// Copyright (c) 2026 DPSystems, LLC.
// Tests for reading image format and size from file headers.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectImage } from "./inspect.ts";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** A minimal JPEG header: SOI, an APP0 segment, then SOF0 with the given size. */
function jpegHeader(width: number, height: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  const sof0 = Buffer.alloc(11);
  sof0.set([0xff, 0xc0, 0x00, 0x0b, 0x08]);
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    app0,
    sof0,
    Buffer.alloc(4),
  ]);
}

describe("inspectImage", () => {
  it("reads a PNG's size", () => {
    assert.deepEqual(inspectImage(PNG_1X1), {
      format: "png",
      width: 1,
      height: 1,
    });
  });

  it("reads a JPEG's size from its frame header, past other segments", () => {
    assert.deepEqual(inspectImage(jpegHeader(4032, 3024)), {
      format: "jpeg",
      width: 4032,
      height: 3024,
    });
  });

  it("recognizes iPhone HEIC by its file-type brand", () => {
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from("ftypheic", "ascii"),
      Buffer.alloc(12),
    ]);
    assert.equal(inspectImage(heic).format, "heic");
  });

  it("says unknown for anything else", () => {
    assert.deepEqual(inspectImage(Buffer.from("not an image")), {
      format: "unknown",
    });
  });
});
