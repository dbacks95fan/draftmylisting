// Copyright (c) 2026 DPSystems, LLC.
// The public HTTP app: OAuth sign-in (MCP SDK router + our page), the MCP
// endpoint, and nothing else. Unknown paths get 404 (NFR-SEC-002).

import express, { type Express, type Response } from "express";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { HouseholdAuthProvider } from "../auth/household-auth.ts";
import type { Logger } from "../log/logger.ts";
import { createMcpHandler } from "../mcp/server.ts";
import { messageBody, sendPage, signInBody } from "../pages/page.ts";
import type { Store } from "../store/db.ts";

/** The shared sign-in has no member names; the provider still needs one identity. */
export const HOUSEHOLD_IDENTITY = "household";

export interface AppDeps {
  publicUrl: URL;
  householdPassword: string;
  store: Store;
  logger: Logger;
  tokensCss: string;
}

export function createApp(deps: AppDeps): Express {
  const mcpUrl = new URL("/mcp", deps.publicUrl);

  const renderSignIn = (
    res: Response,
    requestId: string,
    clientName: string,
    message?: string,
  ): void =>
    sendPage(res, {
      status: message === undefined ? 200 : 401,
      title: "Sign in",
      body: signInBody(requestId, clientName, message),
      tokensCss: deps.tokensCss,
    });

  const provider = new HouseholdAuthProvider(
    [{ username: HOUSEHOLD_IDENTITY, password: deps.householdPassword }],
    renderSignIn,
  );

  const app = express();
  app.disable("x-powered-by");
  // DSM's reverse proxy is the one proxy in front.
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.on("finish", () => {
      const body = req.body as { method?: unknown } | undefined;
      deps.logger.log(
        res.statusCode >= 500
          ? "error"
          : res.statusCode >= 400
            ? "warn"
            : "info",
        "http_request",
        {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          // Risk R-8: record which MCP method drew a 4xx.
          mcp_method:
            typeof body?.method === "string" ? body.method : undefined,
          user_agent: req.get("user-agent"),
        },
      );
    });
    next();
  });

  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: deps.publicUrl,
      resourceServerUrl: mcpUrl,
      scopesSupported: ["listings"],
      resourceName: "DraftMyListing",
    }),
  );

  app.post(
    "/sign-in",
    express.urlencoded({ extended: false, limit: "10kb" }),
    (req, res) => {
      const body = req.body as Record<string, unknown>;
      const requestId =
        typeof body.request_id === "string" ? body.request_id : "";
      const password = typeof body.password === "string" ? body.password : "";
      const result = provider.signIn(requestId, HOUSEHOLD_IDENTITY, password);
      deps.logger.log(result.kind === "redirect" ? "info" : "warn", "sign_in", {
        result: result.kind,
      });
      if (result.kind === "redirect") {
        res.redirect(302, result.location);
      } else if (result.kind === "retry") {
        renderSignIn(
          res,
          requestId,
          "Your assistant",
          "That password isn't right. Try again.",
        );
      } else {
        sendPage(res, {
          status: 400,
          title: "Sign in",
          body: messageBody("Sign in", `${result.message}`),
          tokensCss: deps.tokensCss,
        });
      }
    },
  );

  const requirePass = requireBearerAuth({
    verifier: provider,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
  });
  // Photos can travel base64-encoded inside the request.
  app.post(
    "/mcp",
    requirePass,
    express.json({ limit: "40mb" }),
    createMcpHandler({ store: deps.store, logger: deps.logger }),
  );
  // No server-initiated stream (SSE); clients use plain POSTs.
  app.all("/mcp", (_req, res) => {
    res.set("Allow", "POST").status(405).send("Method not allowed");
  });
  return app;
}
