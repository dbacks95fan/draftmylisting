// Copyright (c) 2026 DPSystems, LLC.
// The admin health endpoint (NFR-OBS-002). It listens on its own loopback port,
// which DSM's reverse proxy never forwards, so it is not reachable from outside.

import express, { type Express } from "express";
import { schemaVersion, type Store } from "../store/db.ts";

export function createHealthApp(store: Store, startedAt: Date): Express {
  const app = express();
  app.disable("x-powered-by");
  app.get("/healthz", (_req, res) => {
    try {
      res.json({
        ok: true,
        schema_version: schemaVersion(store),
        started_at: startedAt.toISOString(),
      });
    } catch (error) {
      res.status(503).json({ ok: false, error: String(error) });
    }
  });
  return app;
}
