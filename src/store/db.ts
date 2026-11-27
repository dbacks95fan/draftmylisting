// Copyright (c) 2026 DPSystems, LLC.
// The SQLite store (architecture ADR-005): opens the database file in the data
// folder and applies numbered migrations once each, in order, at start-up.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Store = DatabaseSync;

interface Migration {
  version: number;
  description: string;
  sql: string;
}

// Append only: a migration that has shipped is never edited or renumbered.
const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: "photo probe results for risk check WS-3 (no image data kept)",
    sql: `CREATE TABLE photo_probes (
            id INTEGER PRIMARY KEY,
            received_at TEXT NOT NULL,
            source TEXT NOT NULL,
            declared_mime_type TEXT,
            byte_size INTEGER NOT NULL,
            format TEXT NOT NULL,
            width INTEGER,
            height INTEGER
          );`,
  },
];

export const DATABASE_FILE = "draftmylisting.db";

/** Opens (creating if needed) the store in dataDir and brings its schema up to date. */
export function openStore(dataDir: string): Store {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, DATABASE_FILE));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY,
       description TEXT NOT NULL,
       applied_at TEXT NOT NULL
     );`,
  );
  const applied = new Set(
    db
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((row) => Number(row.version)),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) {
      continue;
    }
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      db.prepare(
        "INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)",
      ).run(migration.version, migration.description, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(
        `Database migration ${migration.version} failed: ${String(error)}`,
        {
          cause: error,
        },
      );
    }
  }
  return db;
}

/** The highest migration applied, for the health check. */
export function schemaVersion(db: Store): number {
  const row = db
    .prepare("SELECT MAX(version) AS version FROM schema_migrations")
    .get();
  return Number(row?.version ?? 0);
}
