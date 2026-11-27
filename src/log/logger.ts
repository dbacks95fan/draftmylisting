// Copyright (c) 2026 DPSystems, LLC.
// Structured logging (architecture §8.4): one JSON object per line, to stdout and
// to a daily file. Callers pass facts only, never passwords, tokens, photos or chat text.

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, string | number | boolean | undefined>;

export interface Logger {
  log(level: LogLevel, event: string, fields?: LogFields): void;
}

export function createLogger(
  logDir: string | undefined,
  now: () => Date = () => new Date(),
  // Where each line goes besides the file; tests pass a no-op to keep output clean.
  write: (line: string) => void = (line) => console.log(line),
): Logger {
  if (logDir !== undefined) {
    mkdirSync(logDir, { recursive: true });
  }
  return {
    log(level, event, fields = {}) {
      const time = now();
      const line = JSON.stringify({
        time: time.toISOString(),
        level,
        event,
        ...fields,
      });
      write(line);
      if (logDir !== undefined) {
        try {
          appendFileSync(
            join(logDir, `${time.toISOString().slice(0, 10)}.jsonl`),
            line + "\n",
          );
        } catch (error) {
          // A full or missing disk must not take the server down; stdout still has the line.
          console.error(
            JSON.stringify({
              level: "error",
              event: "log_write_failed",
              detail: String(error),
            }),
          );
        }
      }
    },
  };
}
