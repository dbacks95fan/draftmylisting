// Copyright (c) 2026 DPSystems, LLC.
// The admin CLI (architecture ADR-010), run inside the container over SSH:
//   node src/cli/dml.ts health   server + eBay connection, for the admin
//   node src/cli/dml.ts ping     server only, for Docker's health check
// Later features add password, signout-all and connect-ebay.

import { loadServerSettings } from "../config/settings.ts";
import { checkEbayConnection } from "../ebay/gateway.ts";

async function health(): Promise<number> {
  const settings = loadServerSettings();
  let failed = false;
  try {
    const response = await fetch(
      `http://127.0.0.1:${settings.healthPort}/healthz`,
      {
        signal: AbortSignal.timeout(5000),
      },
    );
    const body = (await response.json()) as {
      ok?: boolean;
      schema_version?: number;
      started_at?: string;
    };
    if (response.ok && body.ok === true) {
      console.log(
        `Server: running since ${body.started_at}, database schema ${body.schema_version}.`,
      );
    } else {
      failed = true;
      console.log(
        `Server: answered but reports a problem (HTTP ${response.status}).`,
      );
    }
  } catch {
    failed = true;
    console.log("Server: not answering. Check that the container is running.");
  }
  const ebay = await checkEbayConnection(settings.all);
  console.log(`eBay: ${ebay.message}`);
  return failed || !ebay.ok ? 1 : 0;
}

/** Server only: an eBay outage must not make Docker restart or flag the container. */
async function ping(): Promise<number> {
  const settings = loadServerSettings();
  try {
    const response = await fetch(
      `http://127.0.0.1:${settings.healthPort}/healthz`,
      { signal: AbortSignal.timeout(4000) },
    );
    return response.ok ? 0 : 1;
  } catch {
    return 1;
  }
}

const commands: Record<string, () => Promise<number>> = { health, ping };
const name = process.argv[2] ?? "";
const command = commands[name];
if (command === undefined) {
  console.error(
    `Usage: dml <command>\nCommands: ${Object.keys(commands).join(", ")}`,
  );
  process.exitCode = 2;
} else {
  process.exitCode = await command();
}
