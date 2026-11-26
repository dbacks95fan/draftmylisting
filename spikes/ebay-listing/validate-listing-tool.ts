// Copyright (c) 2026 DPSystems, LLC.
// The PoC's one MCP tool, validate_listing: runs createListing in VALIDATE mode only, so it can
// never change the eBay account. Shared by the question 8 servers (no sign-in and with sign-in).

import { getAccessToken, SCOPES } from "../../src/ebay/auth.ts";
import type { EbayConfig } from "../../src/ebay/config.ts";
import { postGraphql } from "../../src/ebay/graphql.ts";
import { assertSafeCreateListingInput } from "../../src/ebay/listing-safety.ts";
import { buildPocListingInput } from "./poc-listing-input.ts";

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

export const VALIDATE_LISTING_TOOL = {
  name: "validate_listing",
  title: "Check an eBay listing (dry run)",
  description:
    "Asks eBay to check a fixed-price eBay US listing without creating it (VALIDATE mode) and " +
    "returns either the estimated fees or the problems eBay found. Nothing is ever listed. " +
    "Uses a test photo already on eBay.",
  inputSchema: {
    type: "object" as const,
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

export interface ToolResult {
  text: string;
  isError: boolean;
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

/**
 * Returns a function that runs validate_listing for one call. Bad arguments and eBay or token
 * failures come back as error results the assistant can read, never as thrown errors.
 */
export function createValidateListing(
  config: EbayConfig,
  imageUrl: string,
): (args: unknown, caller: string) => Promise<ToolResult> {
  let cachedToken: { value: string; fetchedAt: number } | undefined;
  async function accessToken(): Promise<string> {
    if (
      cachedToken === undefined ||
      Date.now() - cachedToken.fetchedAt > ACCESS_TOKEN_REUSE_MS
    ) {
      cachedToken = {
        value: await getAccessToken(config, [
          SCOPES.publicData,
          SCOPES.listing,
        ]),
        fetchedAt: Date.now(),
      };
    }
    return cachedToken.value;
  }

  async function validate(args: ValidateArguments, caller: string) {
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
      result.data as
        | {
            createListing?: {
              __typename?: string;
              violations?: { violationCode?: string; inputPath?: string }[];
            };
          }
        | undefined
    )?.createListing;
    const valid = outcome?.__typename === "CreateListingValidationSuccess";
    // Logs eBay's verdict and violation codes to show what assistants sent; no secrets.
    console.log(
      `  result ${outcome?.__typename ?? "no createListing result"} by=${caller} title="${args.title}" category=${args.categoryId} price=${args.price} condition=${args.conditionId ?? "1000"} aspects=${args.aspects.map((a) => a.name).join("|")}` +
        (outcome?.violations ?? [])
          .map((v) => ` ${v.violationCode}@${v.inputPath}`)
          .join(""),
    );
    const summary = valid
      ? "eBay accepted this listing in a dry run. Nothing was created."
      : "eBay did not accept this listing. Nothing was created. Details below.";
    return {
      text: `${summary}\n${JSON.stringify(result, null, 2)}`,
      isError: !valid,
    };
  }

  return async (args, caller) => {
    const problem = argumentProblem(args);
    if (problem !== undefined) {
      return { text: problem, isError: true };
    }
    try {
      return await validate(args as ValidateArguments, caller);
    } catch (error) {
      // eBay and token errors carry codes and descriptions, never credentials.
      const text = error instanceof Error ? error.message : String(error);
      console.error(`tool error: ${text}`);
      return { text: `The dry run failed: ${text}`, isError: true };
    }
  };
}
