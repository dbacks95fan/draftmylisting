// Copyright (c) 2026 DPSystems, LLC.
// Sends one GraphQL request to eBay and returns its data and errors unchanged.

import type { EbayConfig } from "./config.ts";

export interface GraphqlResponse<T> {
  data?: T;
  errors?: { message: string; extensions?: Record<string, unknown> }[];
}

export async function postGraphql<T>(
  config: EbayConfig,
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<GraphqlResponse<T>> {
  const response = await fetch(config.graphqlUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `eBay GraphQL request failed (HTTP ${response.status}) at ${config.graphqlUrl}: ${text.slice(0, 2000)}`,
    );
  }
  return JSON.parse(text) as GraphqlResponse<T>;
}
