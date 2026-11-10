// Copyright (c) 2026 DPSystems, LLC.
// Reads KEY=VALUE settings files so eBay keys and tokens can live outside the repository.

import { readFileSync } from "node:fs";

/**
 * Parses KEY=VALUE text. Blank lines and lines starting with # are ignored.
 * Error messages name the line number only, never the line's content, because
 * these files hold secrets.
 */
export function parseEnvText(text: string): Map<string, string> {
  const values = new Map<string, string>();
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      return;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match === null) {
      throw new Error(
        `Settings file line ${index + 1} is not in KEY=VALUE form.`,
      );
    }
    const [, key = "", rawValue = ""] = match;
    values.set(key, stripMatchingQuotes(rawValue.trim()));
  });
  return values;
}

function stripMatchingQuotes(value: string): string {
  const quoted =
    value.length >= 2 &&
    (value.startsWith('"') || value.startsWith("'")) &&
    value.endsWith(value.charAt(0));
  return quoted ? value.slice(1, -1) : value;
}

/** Loads a settings file, explaining how to point at it when it is missing. */
export function loadEnvFile(path: string): Map<string, string> {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Settings file not found at ${path}. Set DRAFTMYLISTING_ENV_FILE to the file that holds your eBay keys.`,
        { cause: error },
      );
    }
    throw error;
  }
  return parseEnvText(text);
}
