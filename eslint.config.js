// Copyright (c) 2026 DPSystems, LLC.
// ESLint configuration: the recommended JavaScript and TypeScript rule sets, nothing more.

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["node_modules/"] },
  js.configs.recommended,
  tseslint.configs.recommended,
);
