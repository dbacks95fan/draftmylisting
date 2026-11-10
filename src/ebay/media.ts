// Copyright (c) 2026 DPSystems, LLC.
// Uploads a photo to eBay's picture hosting (Media API) and returns the URL listings can use.

import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { EbayConfig } from "./config.ts";

export interface UploadedImage {
  imageUrl: string;
  expirationDate: string;
}

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function uploadImageFromFile(
  config: EbayConfig,
  accessToken: string,
  path: string,
): Promise<UploadedImage> {
  const contentType = CONTENT_TYPES[extname(path).toLowerCase()];
  if (contentType === undefined) {
    throw new Error(
      `Unsupported photo type for ${basename(path)}. Use JPG, PNG, GIF, or WEBP.`,
    );
  }
  const form = new FormData();
  form.append(
    "image",
    new Blob([await readFile(path)], { type: contentType }),
    basename(path),
  );
  const response = await fetch(
    `${config.mediaBaseUrl}/commerce/media/v1_beta/image/create_image_from_file`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `eBay photo upload failed for ${basename(path)} (HTTP ${response.status}): ${text.slice(0, 2000)}`,
    );
  }
  return JSON.parse(text) as UploadedImage;
}
