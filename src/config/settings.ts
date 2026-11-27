// Copyright (c) 2026 DPSystems, LLC.
// Server settings: read from the environment, with an optional settings file
// (DRAFTMYLISTING_ENV_FILE) for secrets. Nothing is hard-coded per machine.

import { loadEnvFile } from "../ebay/env-file.ts";

export interface ServerSettings {
  /** The public HTTPS address assistants use; the MCP endpoint is <publicUrl>/mcp. */
  publicUrl: URL;
  /** Interface the server listens on. Loopback in production, behind DSM's reverse proxy. */
  host: string;
  port: number;
  /** Loopback-only port for the admin health check; never proxied. */
  healthPort: number;
  /** Holds the SQLite file and, later, photos. */
  dataDir: string;
  /** Holds the JSON log files. */
  logDir: string;
  householdPassword: string;
  /** Every value from the settings file and the environment, for the eBay config. */
  all: Map<string, string>;
}

const MIN_PASSWORD_LENGTH = 12;

function requirePort(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `${name} must be a port number from 1 to 65535, not "${value}".`,
    );
  }
  return port;
}

function requirePublicUrl(value: string | undefined): URL {
  if (value === undefined || value === "") {
    throw new Error(
      "Set DRAFTMYLISTING_PUBLIC_URL to the address assistants use, e.g. https://listings.example.net:1519",
    );
  }
  const url = new URL(value);
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  // Plain HTTP is only for running on this machine; anything public goes through HTTPS.
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error(
      "DRAFTMYLISTING_PUBLIC_URL must start with https:// (http:// only for localhost).",
    );
  }
  return url;
}

/**
 * Builds the settings from process environment variables, overlaid on the
 * settings file named by DRAFTMYLISTING_ENV_FILE when it is set. Environment
 * variables win, so a container can override single values.
 */
export function loadServerSettings(
  env: NodeJS.ProcessEnv = process.env,
): ServerSettings {
  const all = new Map<string, string>();
  const file = env.DRAFTMYLISTING_ENV_FILE;
  if (file !== undefined && file !== "") {
    for (const [key, value] of loadEnvFile(file)) {
      all.set(key, value);
    }
  }
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && key.startsWith("DRAFTMYLISTING_")) {
      all.set(key, value);
    }
  }
  const get = (name: string): string | undefined => all.get(name);

  const householdPassword = get("DRAFTMYLISTING_HOUSEHOLD_PASSWORD") ?? "";
  if (householdPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Set DRAFTMYLISTING_HOUSEHOLD_PASSWORD (at least ${MIN_PASSWORD_LENGTH} characters) in the settings file.`,
    );
  }
  const dataDir = get("DRAFTMYLISTING_DATA_DIR") ?? "";
  if (dataDir === "") {
    throw new Error(
      "Set DRAFTMYLISTING_DATA_DIR to the folder that holds DraftMyListing's data.",
    );
  }
  return {
    publicUrl: requirePublicUrl(get("DRAFTMYLISTING_PUBLIC_URL")),
    host: get("DRAFTMYLISTING_HOST") ?? "127.0.0.1",
    port: requirePort("DRAFTMYLISTING_PORT", get("DRAFTMYLISTING_PORT"), 8430),
    healthPort: requirePort(
      "DRAFTMYLISTING_HEALTH_PORT",
      get("DRAFTMYLISTING_HEALTH_PORT"),
      8431,
    ),
    dataDir,
    logDir: get("DRAFTMYLISTING_LOG_DIR") ?? `${dataDir}/logs`,
    householdPassword,
    all,
  };
}
