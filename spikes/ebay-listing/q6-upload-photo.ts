// Copyright (c) 2026 DPSystems, LLC.
// PoC question 6: can our own photo be uploaded to eBay's picture hosting for use in a listing?
//
// Run: node spikes/ebay-listing/q6-upload-photo.ts [path-to-photo]
// Defaults to the generated test image. Reads settings from DRAFTMYLISTING_ENV_FILE. Sandbox only.

import { fileURLToPath } from "node:url";
import { getAccessToken, SCOPES } from "../../src/ebay/auth.ts";
import { resolveEbayConfig } from "../../src/ebay/config.ts";
import { loadEnvFile } from "../../src/ebay/env-file.ts";
import { uploadImageFromFile } from "../../src/ebay/media.ts";

const envFile = process.env.DRAFTMYLISTING_ENV_FILE;
if (envFile === undefined || envFile === "") {
  throw new Error(
    "Set DRAFTMYLISTING_ENV_FILE to the settings file that holds your eBay keys.",
  );
}

const photoPath =
  process.argv[2] ??
  fileURLToPath(new URL("./fixtures/poc-test-image.jpg", import.meta.url));

const config = resolveEbayConfig(loadEnvFile(envFile), "sandbox");
const accessToken = await getAccessToken(config, [
  SCOPES.publicData,
  SCOPES.inventory,
]);
const image = await uploadImageFromFile(config, accessToken, photoPath);
console.log("Uploaded:");
console.log(JSON.stringify(image, null, 2));
