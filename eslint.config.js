// Copyright (c) 2026 DPSystems, LLC.
// ESLint configuration: the recommended JavaScript and TypeScript rule sets, plus the
// architecture's one module boundary (ADR-004): only src/ebay/ talks to eBay directly.

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// The eBay client modules. Everything outside src/ebay/ must use src/ebay/gateway.ts.
const EBAY_CLIENTS = [
  "**/ebay/auth.ts",
  "**/ebay/graphql.ts",
  "**/ebay/media.ts",
  "**/ebay/listing-safety.ts",
];

export default defineConfig(
  { ignores: ["node_modules/"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    ignores: ["src/ebay/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: EBAY_CLIENTS,
              message:
                "Call eBay only through src/ebay/gateway.ts (architecture ADR-004).",
            },
          ],
        },
      ],
    },
  },
);
