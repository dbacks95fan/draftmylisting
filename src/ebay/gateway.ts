// Copyright (c) 2026 DPSystems, LLC.
// The eBay gateway (architecture ADR-004): the only entry point other modules use
// to reach eBay. The skeleton exposes just a connection check; listing calls and
// their safety guards are added here, and only here, by later features.

import { getAccessToken, SCOPES } from "./auth.ts";
import { resolveEbayConfig } from "./config.ts";

export interface ConnectionCheck {
  ok: boolean;
  message: string;
}

/**
 * Confirms the household's eBay connection works by renewing a read-only user
 * access token. Never returns or logs the token itself.
 */
export async function checkEbayConnection(
  settings: Map<string, string>,
): Promise<ConnectionCheck> {
  let config;
  try {
    config = resolveEbayConfig(settings, "production");
  } catch (error) {
    return {
      ok: false,
      message: `eBay is not set up: ${(error as Error).message}`,
    };
  }
  try {
    await getAccessToken(config, [SCOPES.listingRead]);
    return { ok: true, message: "eBay connection works." };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
