// Copyright (c) 2026 DPSystems, LLC.
// PoC question 2: does createListing in VALIDATE mode check a whole listing without creating it?
//
// Run: node spikes/ebay-listing/q2-validate-listing.ts <eBay-hosted image URL> [minimal]
// "minimal" drops the schedule, package size, and return terms to isolate failures.
// Reads eBay settings from the file named by DRAFTMYLISTING_ENV_FILE. Uses the sandbox unless
// DRAFTMYLISTING_EBAY_ENV=production; VALIDATE mode never creates a listing in either.

import { getAccessToken, SCOPES } from "../../src/ebay/auth.ts";
import {
  parseEbayEnvironment,
  resolveEbayConfig,
} from "../../src/ebay/config.ts";
import { loadEnvFile } from "../../src/ebay/env-file.ts";
import { postGraphql } from "../../src/ebay/graphql.ts";
import { assertSafeCreateListingInput } from "../../src/ebay/listing-safety.ts";
import { buildPocListingInput } from "./poc-listing-input.ts";

const VALIDATE_MUTATION = `
mutation CreateListing($input: CreateListingInput!) {
  createListing(input: $input) {
    __typename
    ... on CreateListingValidationSuccess {
      listing {
        sku
        marketplace
        sellerProduct { title aspects { name values } categories { primaryCategory { id } } }
        items { itemTerms { pricingTerms { fixedPrice { original { value currency } } } } }
        listingTerms { listingFormat lifecycleTerms { listingDurationInDays startAt } }
      }
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

const envFile = process.env.DRAFTMYLISTING_ENV_FILE;
if (envFile === undefined || envFile === "") {
  throw new Error(
    "Set DRAFTMYLISTING_ENV_FILE to the settings file that holds your eBay keys.",
  );
}

const imageUrl = process.argv[2];
const minimal = process.argv[3] === "minimal";
if (imageUrl === undefined) {
  throw new Error(
    "Pass an eBay-hosted photo URL: run q6-upload-photo.ts first and use its imageUrl.",
  );
}

const config = resolveEbayConfig(
  loadEnvFile(envFile),
  parseEbayEnvironment(process.env.DRAFTMYLISTING_EBAY_ENV),
);
console.log(`eBay environment: ${config.environment}`);

const input = buildPocListingInput({
  imageUrl,
  operationMode: "VALIDATE",
  minimal,
  ...(minimal
    ? {}
    : {
        scheduledToStartAt: new Date(
          Date.now() + 24 * 60 * 60 * 1000,
        ).toISOString(),
      }),
});

assertSafeCreateListingInput(input, new Date());

const accessToken = await getAccessToken(config, [
  SCOPES.publicData,
  SCOPES.listing,
]);
console.log(`Token OK. Calling ${config.graphqlUrl} in VALIDATE mode...`);

const result = await postGraphql(config, accessToken, VALIDATE_MUTATION, {
  input,
});
console.log("createListing (VALIDATE) response:");
console.log(JSON.stringify(result, null, 2));
