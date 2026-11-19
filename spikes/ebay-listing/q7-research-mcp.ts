// Copyright (c) 2026 DPSystems, LLC.
// PoC question 7: does eBay's read-only MCP server return category, item specifics, and comparable listings?
//
// Run:
//   node spikes/ebay-listing/q7-research-mcp.ts list
//   node spikes/ebay-listing/q7-research-mcp.ts run <steps.json> [extra OAuth scope ...]
// steps.json is an array of { "name": <tool>, "arguments": {...} }, run in order in one server
// session, as an assistant would chain a spec search and a call. (A file, because Windows
// PowerShell 5.1 strips the double quotes inside JSON passed as a program argument.)
// The server keeps no state between calls: call_ebay_api fetches the named spec from eBay's
// spec service (api.ebay.com/developer/mcp/v1/search/<specTitle>?operationId=...) each time.
// Starts @ebay/npm-public-api-mcp over stdio, as ChatGPT or Claude would, with the production
// app keys only (application token, never the user refresh token). Reads DRAFTMYLISTING_ENV_FILE.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolveEbayConfig } from "../../src/ebay/config.ts";
import { loadEnvFile } from "../../src/ebay/env-file.ts";

// Pinned so the server under test cannot change between runs.
const SERVER_PACKAGE = "@ebay/npm-public-api-mcp@1.2.0";
const TIMEOUT_MS = 180_000;
// Spec searches return whole OpenAPI documents; only their start is worth printing.
const MAX_QUERY_CHARS = 1_500;
const MAX_CALL_CHARS = 20_000;

const envFile = process.env.DRAFTMYLISTING_ENV_FILE;
if (envFile === undefined || envFile === "") {
  throw new Error(
    "Set DRAFTMYLISTING_ENV_FILE to the settings file that holds your eBay keys.",
  );
}
interface ToolStep {
  name: string;
  arguments: Record<string, unknown>;
}
const [command, stepsFile, ...extraScopes] = process.argv.slice(2);
let steps: ToolStep[] = [];
if (command === "run" && stepsFile !== undefined) {
  steps = JSON.parse(readFileSync(stepsFile, "utf8")) as ToolStep[];
} else if (command !== "list") {
  throw new Error(
    "Usage: q7-research-mcp.ts list | run <steps.json> [extra OAuth scope ...]",
  );
}

// The server has no sandbox, so only production keys apply.
const config = resolveEbayConfig(loadEnvFile(envFile), "production");
const redact = (text: string): string =>
  text
    .replaceAll(config.clientSecret, "[client secret]")
    .replaceAll(config.clientId, "[app id]");

const scopes = ["https://api.ebay.com/oauth/api_scope", ...extraScopes];
// Windows needs a shell to start npx.cmd. The command is one fixed string, with no
// arguments array for the shell to concatenate.
const server = spawn(`npx -y ${SERVER_PACKAGE}`, {
  shell: true,
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    EBAY_CLIENT_ID: config.clientId,
    EBAY_CLIENT_SECRET: config.clientSecret,
    EBAY_API_ENV: "production",
    EBAY_TOKEN_TYPE: "application",
    EBAY_REQUIRED_SCOPES: scopes.join(" "),
  },
});

let serverLog = "";
server.stderr.on("data", (chunk: Buffer) => {
  serverLog += chunk.toString();
});

// MCP over stdio: one JSON-RPC message per line in each direction.
const pending = new Map<number, (message: JsonRpcResponse) => void>();
interface JsonRpcResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}
createInterface({ input: server.stdout }).on("line", (line) => {
  let message: JsonRpcResponse;
  try {
    message = JSON.parse(line) as JsonRpcResponse;
  } catch {
    serverLog += `${line}\n`; // Non-protocol output; keep it for diagnosis.
    return;
  }
  pending.get(message.id)?.(message);
  pending.delete(message.id);
});

let nextId = 1;
function request(method: string, params: unknown): Promise<JsonRpcResponse> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    server.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
    );
  });
}

const timer = setTimeout(() => {
  console.error(
    `No answer from ${SERVER_PACKAGE} within ${TIMEOUT_MS / 1000} s. Server log:\n${redact(serverLog).slice(-3000)}`,
  );
  process.exit(1);
}, TIMEOUT_MS);

const init = await request("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "draftmylisting-poc", version: "0.0.0" },
});
if (init.error) {
  throw new Error(`initialize failed: ${redact(JSON.stringify(init.error))}`);
}
server.stdin.write(
  `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
);

function print(label: string, response: JsonRpcResponse, maxChars: number) {
  const output = redact(JSON.stringify(response, null, 2));
  console.log(`=== ${label}`);
  console.log(
    output.length > maxChars
      ? `${output.slice(0, maxChars)}\n... [${output.length - maxChars} more characters]`
      : output,
  );
}

let failed = false;
if (command === "list") {
  const response = await request("tools/list", {});
  print("tools/list", response, MAX_CALL_CHARS);
  failed = response.error !== undefined;
}
for (const [index, step] of steps.entries()) {
  const response = await request("tools/call", step);
  print(
    `step ${index + 1}: ${step.name}`,
    response,
    step.name.startsWith("query_") ? MAX_QUERY_CHARS : MAX_CALL_CHARS,
  );
  failed ||= response.error !== undefined;
}
clearTimeout(timer);

if (serverLog.trim() !== "") {
  console.log(
    `--- server log (last 1500 chars)\n${redact(serverLog).slice(-1500)}`,
  );
}
server.stdin.end();
process.exit(failed ? 1 : 0);
