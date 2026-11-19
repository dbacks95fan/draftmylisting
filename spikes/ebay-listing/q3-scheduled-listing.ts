// Copyright (c) 2026 DPSystems, LLC.
// PoC question 3: does a createListing EXECUTE with a 24-hour start create a SCHEDULED listing,
// and can it be read back and ended before it ever goes live?
//
// Run:
//   node spikes/ebay-listing/q3-scheduled-listing.ts create <eBay-hosted image URL>
//   node spikes/ebay-listing/q3-scheduled-listing.ts status <listingId>
//   node spikes/ebay-listing/q3-scheduled-listing.ts retitle <listingId>   (question 5)
//   node spikes/ebay-listing/q3-scheduled-listing.ts end <listingId>
// Reads eBay settings from DRAFTMYLISTING_ENV_FILE. "create" makes a REAL listing on the
// account (scheduled 24 hours out); end it before its start time.

import { getAccessToken, SCOPES } from "../../src/ebay/auth.ts";
import {
  parseEbayEnvironment,
  resolveEbayConfig,
} from "../../src/ebay/config.ts";
import { loadEnvFile } from "../../src/ebay/env-file.ts";
import { postGraphql } from "../../src/ebay/graphql.ts";
import { assertSafeCreateListingInput } from "../../src/ebay/listing-safety.ts";
import { buildPocListingInput } from "./poc-listing-input.ts";

const LIFECYCLE_FIELDS =
  "lifecycleTerms { listingStatus startAt scheduledEndAt actualEndAt endListingReason }";

const CREATE_MUTATION = `
mutation CreateListing($input: CreateListingInput!) {
  createListing(input: $input) {
    __typename
    ... on CreateListingSuccess {
      listing { listingId sku sellerProduct { title } listingTerms { ${LIFECYCLE_FIELDS} } }
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

// Title, photos, and price show whether an edit (Seller Hub or updateListing) took effect.
const LISTING_READ_FIELDS = `
  sellerProduct { title images { ebayImageUrl order } }
  items { itemTerms { pricingTerms { fixedPrice { original { value currency } } } } }
  listingTerms { ${LIFECYCLE_FIELDS} }`;

const STATUS_QUERY = `
query SellerListings($input: SellerListingsInput!) {
  sellerListings(input: $input) {
    __typename
    ... on ListingsSuccess {
      listings {
        __typename
        ... on ListingSuccess {
          listingId
          listing { ${LISTING_READ_FIELDS} }
        }
        ... on ListingPartialSuccess {
          listingId
          listing { ${LISTING_READ_FIELDS} }
          errors { errorCode errorMessage }
        }
      }
    }
    ... on ListingIdsMaxLimitError { errorCode errorMessage maxAllowed }
  }
}`;

const END_MUTATION = `
mutation EndListing($input: EndListingInput!) {
  endListing(input: $input) {
    __typename
    ... on EndListingSuccess {
      listing { listingId listingTerms { ${LIFECYCLE_FIELDS} } }
      warnings { warningCode warningMessage }
    }
    ... on EndListingValidationError {
      errorCode
      errorMessage
      violations { inputPath violationCode violationDescription }
      warnings { warningCode warningMessage }
    }
  }
}`;

// Question 5: an edit through the API must keep the same listing ID (no relist).
const UPDATE_MUTATION = `
mutation UpdateListing($input: UpdateListingInput!) {
  updateListing(input: $input) {
    __typename
    ... on UpdateListingSuccess {
      listing { listingId sku sellerProduct { title } listingTerms { ${LIFECYCLE_FIELDS} } }
      listingFees { listingFeeType feeAmount { value currency } promotionalDiscount { value currency } }
      warnings { warningCode warningMessage }
    }
    ... on UpdateListingValidationError {
      errorCode
      errorMessage
      violations { inputPath violationCode violationDescription }
      warnings { warningCode warningMessage }
    }
  }
}`;

const EDITED_TITLE =
  "DraftMyListing PoC Sneakers Men's Size 10 (edited by API)";

const USAGE =
  "Usage: q3-scheduled-listing.ts create <image URL> | status <listingId> | retitle <listingId> | end <listingId>";

const envFile = process.env.DRAFTMYLISTING_ENV_FILE;
if (envFile === undefined || envFile === "") {
  throw new Error(
    "Set DRAFTMYLISTING_ENV_FILE to the settings file that holds your eBay keys.",
  );
}
const [command, argument] = process.argv.slice(2);
if (argument === undefined) {
  throw new Error(USAGE);
}

const config = resolveEbayConfig(
  loadEnvFile(envFile),
  parseEbayEnvironment(process.env.DRAFTMYLISTING_EBAY_ENV),
);
console.log(`eBay environment: ${config.environment}`);

let query: string;
let variables: Record<string, unknown>;
let scopes: string[];
switch (command) {
  case "create": {
    const input = buildPocListingInput({
      imageUrl: argument,
      operationMode: "EXECUTE",
      scheduledToStartAt: new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
    // Refuses to send unless the start time is at least 23 hours out.
    assertSafeCreateListingInput(input, new Date());
    query = CREATE_MUTATION;
    variables = { input };
    scopes = [SCOPES.publicData, SCOPES.listing];
    break;
  }
  case "status":
    query = STATUS_QUERY;
    variables = { input: { listings: [{ listingId: argument }] } };
    scopes = [SCOPES.publicData, SCOPES.listingRead];
    break;
  case "retitle":
    query = UPDATE_MUTATION;
    variables = {
      input: {
        listingIdentifier: { listingId: argument },
        marketplace: "EBAY_US",
        // Only the title is sent: eBay changes just the fields provided, and leaving out
        // listingTerms keeps the scheduled start time untouched.
        product: { title: EDITED_TITLE },
        // updateListing also defaults to EXECUTE; say so explicitly.
        options: { operationMode: "EXECUTE" },
      },
    };
    scopes = [SCOPES.publicData, SCOPES.listing];
    break;
  case "end":
    query = END_MUTATION;
    variables = {
      input: {
        listingIdentifier: { listingId: argument },
        // Closest eBay reason for a test listing: the item is not actually for sale.
        endListingReason: "NOT_AVAILABLE",
      },
    };
    scopes = [SCOPES.publicData, SCOPES.listing];
    break;
  default:
    throw new Error(USAGE);
}

const accessToken = await getAccessToken(config, scopes);
const result = await postGraphql(config, accessToken, query, variables);
console.log(`${command} response:`);
console.log(JSON.stringify(result, null, 2));
