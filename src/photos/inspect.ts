// Copyright (c) 2026 DPSystems, LLC.
// Reads an image's format and pixel size from its first bytes, without decoding
// it. Used by the check_photo probe to see exactly what an assistant delivered.

export type ImageFormat = "jpeg" | "png" | "heic" | "webp" | "gif" | "unknown";

export interface ImageInfo {
  format: ImageFormat;
  width?: number;
  height?: number;
}

function jpegSize(buf: Buffer): { width: number; height: number } | undefined {
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      return undefined;
    }
    const marker = buf[offset + 1] ?? 0;
    const length = buf.readUInt16BE(offset + 2);
    // SOF0..SOF15 carry the frame size, except DHT (C4), JPG (C8) and DAC (CC).
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        height: buf.readUInt16BE(offset + 5),
        width: buf.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return undefined;
}

export function inspectImage(buf: Buffer): ImageInfo {
  if (
    buf.length >= 4 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return { format: "jpeg", ...jpegSize(buf) };
  }
  if (
    buf.length >= 24 &&
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return {
      format: "png",
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
      return { format: "heic" };
    }
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { format: "webp" };
  }
  if (buf.length >= 10 && buf.toString("ascii", 0, 3) === "GIF") {
    return {
      format: "gif",
      width: buf.readUInt16LE(6),
      height: buf.readUInt16LE(8),
    };
  }
  return { format: "unknown" };
}
