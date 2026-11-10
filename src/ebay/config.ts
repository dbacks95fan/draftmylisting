// Copyright (c) 2026 DPSystems, LLC.
// Turns settings-file values into the eBay credentials and endpoints for one environment.

export type EbayEnvironment = "sandbox" | "production";

export interface EbayConfig {
  environment: EbayEnvironment;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  tokenUrl: string;
  graphqlUrl: string;
  restBaseUrl: string;
}

// Sandbox settings carry an EBAY_SANDBOX_ prefix; production settings use the
// bare EBAY_ prefix, matching the household's settings file.
const SETTING_PREFIX: Record<EbayEnvironment, string> = {
  sandbox: "EBAY_SANDBOX_",
  production: "EBAY_",
};

const ENDPOINTS: Record<
  EbayEnvironment,
  Pick<EbayConfig, "tokenUrl" | "graphqlUrl" | "restBaseUrl">
> = {
  sandbox: {
    tokenUrl: "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
    // The sandbox GraphQL host resolves in DNS; the PoC confirms it serves the Listing API.
    graphqlUrl: "https://graphqlapi.sandbox.ebay.com/graphql",
    restBaseUrl: "https://api.sandbox.ebay.com",
  },
  production: {
    tokenUrl: "https://api.ebay.com/identity/v1/oauth2/token",
    graphqlUrl: "https://graphqlapi.ebay.com/graphql",
    restBaseUrl: "https://api.ebay.com",
  },
};

export function resolveEbayConfig(
  settings: Map<string, string>,
  environment: EbayEnvironment,
): EbayConfig {
  const prefix = SETTING_PREFIX[environment];
  const required = (suffix: string): string => {
    const name = prefix + suffix;
    const value = settings.get(name);
    if (value === undefined || value === "") {
      throw new Error(`Missing setting ${name} in the settings file.`);
    }
    return value;
  };
  return {
    environment,
    clientId: required("APP_ID"),
    clientSecret: required("CLIENT_SECRET"),
    refreshToken: required("REFRESH_TOKEN"),
    ...ENDPOINTS[environment],
  };
}
