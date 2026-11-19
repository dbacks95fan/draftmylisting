// Copyright (c) 2026 DPSystems, LLC.
// PoC question 8, stage 1: a remote MCP server Claude and ChatGPT can connect to, with one
// tool that only runs createListing in VALIDATE mode, so it can never change the eBay account.
//
// Run: node spikes/ebay-listing/q8-mcp-server.ts <eBay-hosted image URL>
// then expose it with:  cloudflared tunnel --url http://localhost:8787
// Reads DRAFTMYLISTING_ENV_FILE; uses production (VALIDATE is a dry run there too).
// Stage 1 has NO sign-in: run it only while testing, behind a temporary tunnel address.

import { createServer, type IncomingMessage } from "node:http";
import { getAccessToken, SCOPES } from "../../src/ebay/auth.ts";
import { resolveEbayConfig } from "../../src/ebay/config.ts";
import { loadEnvFile } from "../../src/ebay/env-file.ts";
import { postGraphql } from "../../src/ebay/graphql.ts";
import { assertSafeCreateListingInput } from "../../src/ebay/listing-safety.ts";
import { buildPocListingInput } from "./poc-listing-input.ts";

const PORT = 8787;
const MAX_BODY_BYTES = 1_000_000;
// Caps how many dry runs anyone who found the temporary address could trigger.
const MAX_TOOL_CALLS = 50;
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const ACCESS_TOKEN_REUSE_MS = 90 * 60 * 1000; // eBay access tokens last 2 hours.

const VALIDATE_MUTATION = `
mutation CreateListing($input: CreateListingInput!) {
  createListing(input: $input) {
    __typename
    ... on CreateListingValidationSuccess {
      listingFees { listingFeeType feeAmount { value currency } promotionalDiscount { value currency } }
      warnings { warningCode warningMessage }
    }
    ... on CreateListingValidationError {
      errorMessage
      errorCode
      violations { inputPath violationCode violationDescription }
      warnings { warningCode warningMessage }
    }
  }
}`;

const TOOL = {
  name: "validate_listing",
  title: "Check an eBay listing (dry run)",
  description:
    "Asks eBay to check a fixed-price eBay US listing without creating it (VALIDATE mode) and " +
    "returns either the estimated fees or the problems eBay found. Nothing is ever listed. " +
    "Uses a test photo already on eBay.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", maxLength: 80, description: "Listing title." },
      categoryId: {
        type: "string",
        description:
          "eBay US leaf category ID, e.g. 15709 for Men's Athletic Shoes.",
      },
      price: {
        type: "number",
        minimum: 0.99,
        description: "Fixed price in US dollars.",
      },
      conditionId: {
        type: "string",
        description:
          "eBay condition ID: 1000 = New, 3000 = Used. Defaults to 1000.",
      },
      aspects: {
        type: "array",
        description:
          "Item specifics, e.g. Brand, Size, Color, as name and values.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            values: { type: "array", items: { type: "string" } },
          },
          required: ["name", "values"],
        },
      },
    },
    required: ["title", "categoryId", "price", "aspects"],
  },
  // True: VALIDATE never changes the account. Also lets read-only ChatGPT plans call it.
  annotations: { readOnlyHint: true, destructiveHint: false },
};

interface ValidateArguments {
  title: string;
  categoryId: string;
  price: number;
  conditionId?: string;
  aspects: { name: string; values: string[] }[];
}

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

let toolCalls = 0;
let cachedToken: { value: string; fetchedAt: number } | undefined;
async function accessToken(): Promise<string> {
  if (
    cachedToken === undefined ||
    Date.now() - cachedToken.fetchedAt > ACCESS_TOKEN_REUSE_MS
  ) {
    cachedToken = {
      value: await getAccessToken(config, [SCOPES.publicData, SCOPES.listing]),
      fetchedAt: Date.now(),
    };
  }
  return cachedToken.value;
}

function argumentProblem(args: unknown): string | undefined {
  if (typeof args !== "object" || args === null) {
    return "Arguments must be an object.";
  }
  const a = args as Record<string, unknown>;
  if (typeof a.title !== "string" || a.title === "" || a.title.length > 80) {
    return "title must be a non-empty string of at most 80 characters.";
  }
  if (typeof a.categoryId !== "string" || !/^\d+$/.test(a.categoryId)) {
    return "categoryId must be a numeric eBay category ID, as a string.";
  }
  if (typeof a.price !== "number" || !(a.price >= 0.99)) {
    return "price must be a number of at least 0.99.";
  }
  if (a.conditionId !== undefined && typeof a.conditionId !== "string") {
    return "conditionId must be a string such as 1000 or 3000.";
  }
  const aspectsOk =
    Array.isArray(a.aspects) &&
    a.aspects.every(
      (x: unknown) =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as Record<string, unknown>).name === "string" &&
        Array.isArray((x as Record<string, unknown>).values) &&
        ((x as Record<string, unknown>).values as unknown[]).every(
          (v) => typeof v === "string",
        ),
    );
  return aspectsOk
    ? undefined
    : "aspects must be a list of { name, values: [strings] }.";
}

async function validateListing(
  args: ValidateArguments,
): Promise<{ text: string; isError: boolean }> {
  const input = buildPocListingInput({
    imageUrl,
    operationMode: "VALIDATE",
    scheduledToStartAt: new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    ).toISOString(),
  });
  input.product.title = args.title;
  input.product.categories.primaryCategoryId = args.categoryId;
  input.product.aspects = args.aspects;
  input.product.itemCondition.conditionId = args.conditionId ?? "1000";
  input.listingItems.items[0]!.itemTerms.pricingTerms.fixedPrice = args.price;
  // The tool only ever validates; this check would refuse anything else.
  assertSafeCreateListingInput(input, new Date());

  const result = await postGraphql(
    config,
    await accessToken(),
    VALIDATE_MUTATION,
    { input },
  );
  const outcome = (
    result.data as { createListing?: { __typename?: string } } | undefined
  )?.createListing;
  const valid = outcome?.__typename === "CreateListingValidationSuccess";
  // Logs eBay's verdict and violation codes (no listing content) to show what assistants sent.
  const violations =
    (
      outcome as
        | { violations?: { violationCode?: string; inputPath?: string }[] }
        | undefined
    )?.violations ?? [];
  console.log(
    `  result ${outcome?.__typename ?? "no createListing result"} title="${args.title}" category=${args.categoryId} price=${args.price} condition=${args.conditionId ?? "1000"} aspects=${args.aspects.map((a) => a.name).join("|")}` +
      violations.map((v) => ` ${v.violationCode}@${v.inputPath}`).join(""),
  );
  const summary = valid
    ? "eBay accepted this listing in a dry run. Nothing was created."
    : "eBay did not accept this listing. Nothing was created. Details below.";
  return {
    text: `${summary}\n${JSON.stringify(result, null, 2)}`,
    isError: !valid,
  };
}

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
      const problem = argumentProblem(params.arguments);
      if (problem !== undefined) {
        return reply({
          content: [{ type: "text", text: problem }],
          isError: true,
        });
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
      try {
        const { text, isError } = await validateListing(
          params.arguments as ValidateArguments,
        );
        return reply({ content: [{ type: "text", text }], isError });
      } catch (error) {
        // eBay and token errors carry codes and descriptions, never credentials.
        const text = error instanceof Error ? error.message : String(error);
        console.error(`tool error: ${text}`);
        return reply({
          content: [{ type: "text", text: `The dry run failed: ${text}` }],
          isError: true,
        });
      }
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
