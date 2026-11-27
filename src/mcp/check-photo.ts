// Copyright (c) 2026 DPSystems, LLC.
// The walking skeleton's one tool, and the probe for risk check WS-3: it reports
// exactly what photo arrived (format, pixel size, bytes) so we can see whether an
// assistant passes chat photos at full quality. No image data is kept.

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { inspectImage } from "../photos/inspect.ts";
import type { Store } from "../store/db.ts";

/** 12 photos of a modern phone stay well under this; anything bigger is refused. */
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export const CHECK_PHOTO_TOOL: Tool = {
  name: "check_photo",
  title: "Check a photo",
  description:
    "Test tool. When the member shares a photo and asks to check it, send that photo here at its " +
    "original quality. Send the image itself as image_base64 (with mime_type) if you can; " +
    "otherwise send a link to it as image_url. Report back what the tool says it received.",
  inputSchema: {
    type: "object",
    properties: {
      image_base64: {
        type: "string",
        description:
          "The photo's file contents, base64-encoded, unchanged from what the member sent.",
      },
      mime_type: {
        type: "string",
        description: "The photo's type, for example image/jpeg.",
      },
      image_url: {
        type: "string",
        description:
          "An https link to the photo, if you can't send its contents.",
      },
    },
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
};

export interface ToolResult {
  text: string;
  isError: boolean;
}

export interface CheckPhotoDeps {
  store: Store;
  fetch?: typeof fetch;
  now?: () => Date;
}

async function download(url: URL, fetchImpl: typeof fetch): Promise<Buffer> {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`the link answered HTTP ${response.status}`);
  }
  if (new URL(response.url).protocol !== "https:") {
    throw new Error("the link redirected away from https");
  }
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_PHOTO_BYTES) {
    throw new Error("the photo is larger than 25 MB");
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_PHOTO_BYTES) {
    throw new Error("the photo is larger than 25 MB");
  }
  return body;
}

export async function checkPhoto(
  args: Record<string, unknown> | undefined,
  deps: CheckPhotoDeps,
): Promise<ToolResult> {
  const base64 =
    typeof args?.image_base64 === "string" ? args.image_base64 : undefined;
  const link = typeof args?.image_url === "string" ? args.image_url : undefined;
  const mimeType =
    typeof args?.mime_type === "string" ? args.mime_type : undefined;
  if ((base64 === undefined) === (link === undefined)) {
    return {
      text: "Send exactly one of image_base64 or image_url.",
      isError: true,
    };
  }

  let bytes: Buffer;
  let source: "base64" | "url";
  if (base64 !== undefined) {
    source = "base64";
    // Data URLs ("data:image/jpeg;base64,...") are accepted too.
    bytes = Buffer.from(base64.replace(/^data:[^,]*,/, ""), "base64");
    if (bytes.length > MAX_PHOTO_BYTES) {
      return { text: "That photo is larger than 25 MB.", isError: true };
    }
  } else {
    source = "url";
    let url: URL;
    try {
      url = new URL(link ?? "");
    } catch {
      return { text: "image_url is not a valid link.", isError: true };
    }
    if (url.protocol !== "https:") {
      return { text: "image_url must be an https link.", isError: true };
    }
    try {
      bytes = await download(url, deps.fetch ?? fetch);
    } catch (error) {
      return {
        text: `Couldn't fetch the photo: ${(error as Error).message}.`,
        isError: true,
      };
    }
  }
  if (bytes.length === 0) {
    return { text: "The photo arrived empty.", isError: true };
  }

  const info = inspectImage(bytes);
  deps.store
    .prepare(
      `INSERT INTO photo_probes (received_at, source, declared_mime_type, byte_size, format, width, height)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      (deps.now ?? (() => new Date()))().toISOString(),
      source,
      mimeType ?? null,
      bytes.length,
      info.format,
      info.width ?? null,
      info.height ?? null,
    );
  const size =
    info.width !== undefined && info.height !== undefined
      ? `${info.width} × ${info.height} pixels`
      : "pixel size not readable for this format";
  return {
    text: `Received a ${info.format.toUpperCase()} photo by ${source}: ${size}, ${bytes.length.toLocaleString("en-US")} bytes.`,
    isError: false,
  };
}
