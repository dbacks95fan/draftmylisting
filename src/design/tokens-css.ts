// Copyright (c) 2026 DPSystems, LLC.
// Turns docs/tokens.json (W3C DTCG) into the CSS custom properties the web
// pages use, so tokens.json stays the single source of design values.

import { readFileSync } from "node:fs";

interface TokenLeaf {
  $type: string;
  $value: string | number | string[];
}

type TokenTree = { [key: string]: TokenTree | TokenLeaf | string };

const isLeaf = (node: unknown): node is TokenLeaf =>
  typeof node === "object" && node !== null && "$value" in node;

function cssValue(leaf: TokenLeaf): string {
  if (Array.isArray(leaf.$value)) {
    return leaf.$value
      .map((part) => (part.includes(" ") ? `"${part}"` : part))
      .join(", ");
  }
  return String(leaf.$value);
}

/** Flattens a token group into `--path-to-token: value;` declarations, skipping `mode`. */
function declarations(tree: TokenTree, path: string[] = []): string[] {
  const out: string[] = [];
  for (const [key, node] of Object.entries(tree)) {
    if (key.startsWith("$") || (path.length === 0 && key === "mode")) {
      continue;
    }
    if (isLeaf(node)) {
      out.push(`--${[...path, key].join("-")}: ${cssValue(node)};`);
    } else if (typeof node === "object") {
      out.push(...declarations(node, [...path, key]));
    }
  }
  return out;
}

/** Light values on :root, dark values under prefers-color-scheme (design.md §2). */
export function tokensToCss(tokens: TokenTree): string {
  const light = declarations(tokens);
  if (light.length === 0) {
    throw new Error("tokens.json produced no CSS variables.");
  }
  const mode = tokens.mode;
  const dark =
    typeof mode === "object" &&
    !isLeaf(mode) &&
    typeof mode.dark === "object" &&
    !isLeaf(mode.dark)
      ? declarations(mode.dark as TokenTree)
      : [];
  let css = `:root{${light.join("")}}`;
  if (dark.length > 0) {
    css += `@media (prefers-color-scheme: dark){:root{${dark.join("")}}}`;
  }
  return css;
}

export function loadTokensCss(path: string): string {
  return tokensToCss(JSON.parse(readFileSync(path, "utf8")) as TokenTree);
}
