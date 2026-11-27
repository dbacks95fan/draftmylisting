// Copyright (c) 2026 DPSystems, LLC.
// Walking-skeleton end-to-end test: starts the real app on a local port with a
// fresh data folder, signs in through the real OAuth flow and the household
// sign-in page, then calls check_photo with the official MCP client.

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadServerSettings } from "../../src/config/settings.ts";
import { loadTokensCss } from "../../src/design/tokens-css.ts";
import { createApp } from "../../src/http/app.ts";
import { createLogger } from "../../src/log/logger.ts";
import { openStore, type Store } from "../../src/store/db.ts";

const PASSWORD = "e2e-household-password";
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const REDIRECT = "http://127.0.0.1/callback";

let dataDir: string;
let store: Store;
let server: Server;
let base: URL;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "dml-e2e-"));
  server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  // Settings come from environment-style values, as in production.
  const settings = loadServerSettings({
    DRAFTMYLISTING_PUBLIC_URL: base.href,
    DRAFTMYLISTING_HOUSEHOLD_PASSWORD: PASSWORD,
    DRAFTMYLISTING_DATA_DIR: dataDir,
  });
  store = openStore(settings.dataDir);
  const app = createApp({
    publicUrl: settings.publicUrl,
    householdPassword: settings.householdPassword,
    store,
    logger: createLogger(undefined, undefined, () => {}),
    tokensCss: loadTokensCss(
      fileURLToPath(new URL("../../docs/tokens.json", import.meta.url)),
    ),
  });
  server.on("request", app);
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
  rmSync(dataDir, { recursive: true, force: true });
});

async function signIn(): Promise<{ accessToken: string; signInPage: string }> {
  const registration = await fetch(new URL("/register", base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "e2e test",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  assert.equal(registration.status, 201);
  const clientId = ((await registration.json()) as { client_id: string })
    .client_id;

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorize = new URL("/authorize", base);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "e2e-state",
  }).toString();
  const page = await fetch(authorize);
  assert.equal(page.status, 200);
  const signInPage = await page.text();
  const requestId = /name="request_id" value="([^"]+)"/.exec(signInPage)?.[1];
  assert.ok(requestId, "sign-in page carries a request id");

  const wrong = await fetch(new URL("/sign-in", base), {
    method: "POST",
    body: new URLSearchParams({
      request_id: requestId,
      password: "not the password",
    }),
    redirect: "manual",
  });
  assert.equal(wrong.status, 401);
  assert.match(await wrong.text(), /That password isn&#39;t right/);

  const right = await fetch(new URL("/sign-in", base), {
    method: "POST",
    body: new URLSearchParams({ request_id: requestId, password: PASSWORD }),
    redirect: "manual",
  });
  assert.equal(right.status, 302);
  const callback = new URL(right.headers.get("location") ?? "");
  assert.equal(callback.searchParams.get("state"), "e2e-state");
  const code = callback.searchParams.get("code") ?? "";

  const token = await fetch(new URL("/token", base), {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: REDIRECT,
    }),
  });
  assert.equal(token.status, 200);
  return {
    accessToken: ((await token.json()) as { access_token: string })
      .access_token,
    signInPage,
  };
}

describe("walking skeleton", () => {
  it("refuses MCP calls without a sign-in", async () => {
    const response = await fetch(new URL("/mcp", base), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert.equal(response.status, 401);
    assert.match(
      response.headers.get("www-authenticate") ?? "",
      /resource_metadata/,
    );
  });

  it("answers 404 for paths it does not serve", async () => {
    assert.equal((await fetch(new URL("/admin", base))).status, 404);
  });

  it("signs in, then checks a photo through MCP and records it in the store", async () => {
    const { accessToken, signInPage } = await signIn();
    // The page is styled from tokens.json, not hand-copied values.
    assert.match(signInPage, /--color-primary: #1F5FBF;/);

    const client = new Client({ name: "e2e", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL("/mcp", base), {
        requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
      }),
    );
    try {
      const tools = await client.listTools();
      assert.deepEqual(
        tools.tools.map((t) => t.name),
        ["check_photo"],
      );
      const result = await client.callTool({
        name: "check_photo",
        arguments: { image_base64: PNG_1X1, mime_type: "image/png" },
      });
      assert.equal(result.isError, false);
      const text =
        (result.content as { type: string; text: string }[])[0]?.text ?? "";
      assert.match(text, /PNG photo by base64: 1 × 1 pixels/);
    } finally {
      await client.close();
    }
    // node:sqlite rows have no prototype; copy them into plain objects to compare.
    const probes = store
      .prepare("SELECT format, width, height FROM photo_probes")
      .all()
      .map((row) => ({ ...row }));
    assert.deepEqual(probes, [{ format: "png", width: 1, height: 1 }]);
  });
});
