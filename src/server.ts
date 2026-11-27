// Copyright (c) 2026 DPSystems, LLC.
// Entry point: loads settings, opens the store, and starts the public app and the
// loopback health endpoint. Run with: node src/server.ts

import { fileURLToPath } from "node:url";
import { loadServerSettings } from "./config/settings.ts";
import { loadTokensCss } from "./design/tokens-css.ts";
import { createApp } from "./http/app.ts";
import { createHealthApp } from "./http/health.ts";
import { createLogger } from "./log/logger.ts";
import { openStore } from "./store/db.ts";

const TOKENS_PATH = fileURLToPath(
  new URL("../docs/tokens.json", import.meta.url),
);

const settings = loadServerSettings();
const logger = createLogger(settings.logDir);
const store = openStore(settings.dataDir);
const startedAt = new Date();

const app = createApp({
  publicUrl: settings.publicUrl,
  householdPassword: settings.householdPassword,
  store,
  logger,
  tokensCss: loadTokensCss(TOKENS_PATH),
});

app.listen(settings.port, settings.host, () =>
  logger.log("info", "server_started", {
    listen: `${settings.host}:${settings.port}`,
    mcp_url: new URL("/mcp", settings.publicUrl).href,
  }),
);
createHealthApp(store, startedAt).listen(settings.healthPort, "127.0.0.1");

process.on("uncaughtException", (error) => {
  logger.log("error", "uncaught_exception", { detail: error.message });
  process.exit(1);
});
