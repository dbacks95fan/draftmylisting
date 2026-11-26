// Copyright (c) 2026 DPSystems, LLC.
// PoC question 8, stage 1: a remote MCP server Claude and ChatGPT can connect to, with one
// tool that only runs createListing in VALIDATE mode, so it can never change the eBay account.
//
// Run: node spikes/ebay-listing/q8-mcp-server.ts <eBay-hosted image URL>
// then expose it with:  cloudflared tunnel --url http://localhost:8787
// Reads DRAFTMYLISTING_ENV_FILE; uses production (VALIDATE is a dry run there too).
// Stage 1 has NO sign-in: run it only while testing, behind a temporary tunnel address.

import { createServer, type IncomingMessage } from "node:http";
import { resolveEbayConfig } from "../../src/ebay/config.ts";
import { loadEnvFile } from "../../src/ebay/env-file.ts";
import {
  createValidateListing,
  VALIDATE_LISTING_TOOL as TOOL,
} from "./validate-listing-tool.ts";

const PORT = 8787;
const MAX_BODY_BYTES = 1_000_000;
// Caps how many dry runs anyone who found the temporary address could trigger.
const MAX_TOOL_CALLS = 50;
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const envFile = process.env.DRAFTMYLISTING_ENV_FILE;
if (envFile === undefined || envFile === "") {
  throw new Error(
    "Set DRAFTMYLISTING_ENV_FILE to the settings file that holds your eBay keys.",
  );
}
const imageArgument = process.argv[2];
if (imageArgument === undefined) {
  throw new Error(
    "Pass an eBay-hosted photo URL: run q6-upload-photo.ts first and use its imageUrl.",
  );
}
const imageUrl: string = imageArgument;
const config = resolveEbayConfig(loadEnvFile(envFile), "production");
const validateListing = createValidateListing(config, imageUrl);

let toolCalls = 0;

async function handle(message: JsonRpcMessage): Promise<object | undefined> {
  const { id, method, params } = message;
  // Notifications (no id) get no response.
  if (id === undefined) {
    return undefined;
  }
  const reply = (result: object) => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, text: string) => ({
    jsonrpc: "2.0",
    id,
    error: { code, message: text },
  });

  switch (method) {
    case "initialize": {
      const requested = params?.protocolVersion;
      const protocolVersion =
        typeof requested === "string" &&
        SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[1];
      return reply({
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "draftmylisting-poc", version: "0.0.0" },
        instructions:
          "Test server for DraftMyListing. Its only tool checks a listing with eBay without creating it.",
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: [TOOL] });
    case "tools/call": {
      if (params?.name !== TOOL.name) {
        return fail(-32602, `Unknown tool: ${String(params?.name)}`);
      }
      toolCalls += 1;
      if (toolCalls > MAX_TOOL_CALLS) {
        return reply({
          content: [
            {
              type: "text",
              text: "This test server's call limit is used up. Restart it to test more.",
            },
          ],
          isError: true,
        });
      }
      const { text, isError } = await validateListing(
        params.arguments,
        "no-sign-in",
      );
      return reply({ content: [{ type: "text", text }], isError });
    }
    default:
      return fail(-32601, `Method not found: ${String(method)}`);
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

const server = createServer((request, response) => {
  const path = (request.url ?? "/").split("?")[0];
  const agent = request.headers["user-agent"] ?? "-";
  console.log(
    `${new Date().toISOString()} ${request.method} ${path} ua=${agent}`,
  );

  if (path !== "/mcp") {
    // Includes OAuth discovery probes: a 404 there tells clients this server has no sign-in.
    response.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }
  if (request.method !== "POST") {
    // No server-initiated stream (SSE) in stage 1; clients then use plain POSTs.
    response
      .writeHead(405, { Allow: "POST", "Content-Type": "text/plain" })
      .end("Method not allowed");
    return;
  }

  readBody(request)
    .then(async (body) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        response.writeHead(400, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          }),
        );
        return;
      }
      const messages = (
        Array.isArray(parsed) ? parsed : [parsed]
      ) as JsonRpcMessage[];
      for (const m of messages) {
        const tool =
          m.method === "tools/call" ? ` tool=${String(m.params?.name)}` : "";
        console.log(`  rpc ${String(m.method)}${tool}`);
      }
      const replies = (await Promise.all(messages.map(handle))).filter(
        (r) => r !== undefined,
      );
      if (replies.length === 0) {
        response.writeHead(202).end();
        return;
      }
      response
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify(Array.isArray(parsed) ? replies : replies[0]));
    })
    .catch((error: unknown) => {
      const text = error instanceof Error ? error.message : String(error);
      console.error(`request error: ${text}`);
      if (!response.headersSent) {
        response.writeHead(413, { "Content-Type": "text/plain" }).end(text);
      }
    });
});

// Loopback only: the tunnel is the one way in from outside.
server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `DraftMyListing PoC MCP server (VALIDATE only, no sign-in) on http://127.0.0.1:${PORT}/mcp`,
  );
});
