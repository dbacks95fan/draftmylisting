// Copyright (c) 2026 DPSystems, LLC.
// Exchanges the saved eBay refresh token for a short-lived access token.

import type { EbayConfig } from "./config.ts";

export const SCOPES = {
  publicData: "https://api.ebay.com/oauth/api_scope",
  listing: "https://api.ebay.com/oauth/api_scope/sell.listing",
  listingRead: "https://api.ebay.com/oauth/api_scope/sell.listing.read",
  inventory: "https://api.ebay.com/oauth/api_scope/sell.inventory",
} as const;

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export async function getAccessToken(
  config: EbayConfig,
  scopes: readonly string[],
): Promise<string> {
  const basic = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.refreshToken,
      scope: scopes.join(" "),
    }),
  });
  if (!response.ok) {
    // eBay's OAuth error bodies carry an error code and description, never the token.
    const detail = await response.text();
    throw new Error(
      `eBay token refresh failed (HTTP ${response.status}): ${detail}. If the refresh token expired or was revoked, sign in again to get a new one.`,
    );
  }
  const body = (await response.json()) as TokenResponse;
  return body.access_token;
}
