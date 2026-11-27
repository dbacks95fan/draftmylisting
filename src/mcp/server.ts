// Copyright (c) 2026 DPSystems, LLC.
// The MCP endpoint: a fresh stateless MCP server per request (as in the PoC),
// answering in plain JSON. Tools are registered here; features add theirs.

import type { Request, Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Logger } from "../log/logger.ts";
import type { Store } from "../store/db.ts";
import { CHECK_PHOTO_TOOL, checkPhoto } from "./check-photo.ts";

export const SERVER_INFO = {
  name: "draftmylisting",
  version: "0.1.0",
} as const;

export interface McpDeps {
  store: Store;
  logger: Logger;
}

export function createMcpHandler(deps: McpDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const server = new Server(SERVER_INFO, {
      capabilities: { tools: {} },
      instructions:
        "DraftMyListing helps a household list items on eBay from photos. This early version only has a photo check.",
    });
    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: [CHECK_PHOTO_TOOL],
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const started = Date.now();
      const name = request.params.name;
      const result =
        name === CHECK_PHOTO_TOOL.name
          ? await checkPhoto(request.params.arguments, { store: deps.store })
          : { text: `Unknown tool: ${name}`, isError: true };
      deps.logger.log(result.isError ? "warn" : "info", "tool_call", {
        tool: name,
        ok: !result.isError,
        duration_ms: Date.now() - started,
        client: String(req.auth?.clientId ?? "unknown"),
      });
      return {
        content: [{ type: "text", text: result.text }],
        isError: result.isError,
      };
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };
}
