// Copyright (c) 2026 DPSystems, LLC.
// PoC question 8, stage 2: the remote MCP server with OAuth sign-in. Claude and ChatGPT send each
// family member to our sign-in page once, then call the tools with a pass the server checks.
//
// Run: node spikes/ebay-listing/q8-mcp-auth-server.ts <public https URL> <eBay-hosted image URL>
// The public URL is where the server is reachable, e.g. a cloudflared tunnel address.
// Reads DRAFTMYLISTING_ENV_FILE: production eBay keys plus DRAFTMYLISTING_LOGIN_USERNAME and
// DRAFTMYLISTING_LOGIN_PASSWORD for the one household member of this test.

import express, { type Response } from "express";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { resolveEbayConfig } from "../../src/ebay/config.ts";
import { loadEnvFile } from "../../src/ebay/env-file.ts";
import { HouseholdAuthProvider } from "../../src/mcp/household-auth.ts";
import {
  createValidateListing,
  VALIDATE_LISTING_TOOL,
} from "./validate-listing-tool.ts";

const PORT = 8787;

const envFile = process.env.DRAFTMYLISTING_ENV_FILE;
if (envFile === undefined || envFile === "") {
  throw new Error(
    "Set DRAFTMYLISTING_ENV_FILE to the settings file that holds your eBay keys.",
  );
}
const [publicArgument, imageArgument] = process.argv.slice(2);
if (publicArgument === undefined || imageArgument === undefined) {
  throw new Error(
    "Usage: q8-mcp-auth-server.ts <public https URL> <eBay-hosted image URL>",
  );
}
const publicUrl = new URL(publicArgument);
const mcpUrl = new URL("/mcp", publicUrl);

const settings = loadEnvFile(envFile);
const username = settings.get("DRAFTMYLISTING_LOGIN_USERNAME");
const password = settings.get("DRAFTMYLISTING_LOGIN_PASSWORD");
if (!username || !password || password.length < 12) {
  throw new Error(
    "Set DRAFTMYLISTING_LOGIN_USERNAME and DRAFTMYLISTING_LOGIN_PASSWORD (12+ characters) in the settings file.",
  );
}
const validateListing = createValidateListing(
  resolveEbayConfig(settings, "production"),
  imageArgument,
);

const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

function sendPage(res: Response, status: number, body: string): void {
  res
    .status(status)
    .set({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      // No scripts or outside resources on the sign-in page.
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
    })
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<title>DraftMyListing sign-in</title><style>` +
        `body{font-family:system-ui,sans-serif;max-width:22rem;margin:3rem auto;padding:0 1rem;color:#1a1a1a;background:#fff}` +
        `label{display:block;margin:.8rem 0 .2rem}input{width:100%;padding:.6rem;font-size:1rem;box-sizing:border-box}` +
        `button{margin-top:1.2rem;width:100%;padding:.7rem;font-size:1rem}.msg{color:#b00020}` +
        `</style></head><body>${body}</body></html>`,
    );
}

function renderSignInPage(
  res: Response,
  requestId: string,
  clientName: string,
  message?: string,
): void {
  sendPage(
    res,
    message === undefined ? 200 : 401,
    `<h1>DraftMyListing</h1>` +
      `<p>${escapeHtml(clientName)} wants to use DraftMyListing for you. Sign in to allow it.</p>` +
      (message === undefined
        ? ""
        : `<p class="msg">${escapeHtml(message)}</p>`) +
      `<form method="post" action="/sign-in">` +
      `<input type="hidden" name="request_id" value="${escapeHtml(requestId)}">` +
      `<label for="u">Name</label><input id="u" name="username" autocomplete="username" required>` +
      `<label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required>` +
      `<button type="submit">Sign in</button></form>`,
  );
}

const provider = new HouseholdAuthProvider(
  [{ username, password }],
  renderSignInPage,
);

const app = express();
// cloudflared is the one proxy in front, so the client address comes from its header.
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.on("finish", () =>
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.path} -> ${res.statusCode} ua=${req.get("user-agent") ?? "-"}`,
    ),
  );
  next();
});

// OAuth: metadata, client registration, /authorize (shows our page), /token, /revoke.
app.use(
  mcpAuthRouter({
    provider,
    issuerUrl: publicUrl,
    resourceServerUrl: mcpUrl,
    scopesSupported: ["listing:check"],
    resourceName: "DraftMyListing (proof of concept)",
  }),
);

app.post(
  "/sign-in",
  express.urlencoded({ extended: false, limit: "10kb" }),
  (req, res) => {
    const body = req.body as Record<string, unknown>;
    const field = (name: string) =>
      typeof body[name] === "string" ? body[name] : "";
    const requestId = field("request_id");
    const result = provider.signIn(
      requestId,
      field("username"),
      field("password"),
    );
    console.log(`  sign-in ${result.kind} name="${field("username")}"`);
    if (result.kind === "redirect") {
      res.redirect(302, result.location);
    } else if (result.kind === "retry") {
      renderSignInPage(res, requestId, "An assistant", result.message);
    } else {
      sendPage(
        res,
        400,
        `<h1>DraftMyListing</h1><p class="msg">${escapeHtml(result.message)}</p>`,
      );
    }
  },
);

// Every MCP request needs a valid pass; without one the reply points to the sign-in metadata.
const requirePass = requireBearerAuth({
  verifier: provider,
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
});

app.post(
  "/mcp",
  requirePass,
  express.json({ limit: "1mb" }),
  async (req, res) => {
    const caller = String(req.auth?.extra?.username ?? "unknown");
    // Stateless: a fresh MCP server and transport per request, answered as plain JSON.
    const server = new Server(
      { name: "draftmylisting-poc", version: "0.0.0" },
      {
        capabilities: { tools: {} },
        instructions:
          "Test server for DraftMyListing. Its only tool checks a listing with eBay without creating it.",
      },
    );
    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: [VALIDATE_LISTING_TOOL],
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.log(`  tool ${request.params.name} by=${caller}`);
      if (request.params.name !== VALIDATE_LISTING_TOOL.name) {
        return {
          content: [
            { type: "text", text: `Unknown tool: ${request.params.name}` },
          ],
          isError: true,
        };
      }
      const { text, isError } = await validateListing(
        request.params.arguments,
        caller,
      );
      return { content: [{ type: "text", text }], isError };
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
  },
);

// No server-initiated stream (SSE); clients then use plain POSTs.
app.all("/mcp", (_req, res) => {
  res.set("Allow", "POST").status(405).send("Method not allowed");
});

// Loopback only: the tunnel is the one way in from outside.
app.listen(PORT, "127.0.0.1", () => {
  console.log(
    `DraftMyListing PoC MCP server with sign-in on http://127.0.0.1:${PORT}/mcp, public ${mcpUrl.href}`,
  );
});
