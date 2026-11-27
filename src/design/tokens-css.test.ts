// Copyright (c) 2026 DPSystems, LLC.
// Tests that docs/tokens.json becomes the CSS variables the pages use.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadTokensCss, tokensToCss } from "./tokens-css.ts";

const TOKENS = fileURLToPath(
  new URL("../../docs/tokens.json", import.meta.url),
);
const PAGE_SOURCE = fileURLToPath(new URL("../pages/page.ts", import.meta.url));

describe("tokensToCss", () => {
  it("puts light values on :root and dark values under prefers-color-scheme", () => {
    const css = tokensToCss({
      color: { primary: { $type: "color", $value: "#111111" } },
      mode: {
        dark: { color: { primary: { $type: "color", $value: "#eeeeee" } } },
      },
    });
    assert.equal(
      css,
      ":root{--color-primary: #111111;}@media (prefers-color-scheme: dark){:root{--color-primary: #eeeeee;}}",
    );
  });

  it("quotes font names that contain spaces", () => {
    const css = tokensToCss({
      font: {
        family: {
          sans: { $type: "fontFamily", $value: ["system-ui", "Segoe UI"] },
        },
      },
    });
    assert.match(css, /--font-family-sans: system-ui, "Segoe UI";/);
  });

  it("defines every CSS variable the pages use, from the real tokens.json", () => {
    const css = loadTokensCss(TOKENS);
    const used = new Set(
      readFileSync(PAGE_SOURCE, "utf8").match(/var\(--[a-z0-9-]+\)/g) ?? [],
    );
    assert.ok(used.size > 10, "expected the page CSS to use the tokens");
    for (const reference of used) {
      const name = reference.slice(4, -1);
      assert.ok(
        css.includes(`${name}:`),
        `${name} is used by the pages but missing from tokens.json`,
      );
    }
  });
});
