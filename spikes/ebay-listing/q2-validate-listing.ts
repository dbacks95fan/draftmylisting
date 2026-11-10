// Copyright (c) 2026 DPSystems, LLC.
// PoC question 2: does createListing in VALIDATE mode check a whole listing without creating it?
//
// Run: node spikes/ebay-listing/q2-validate-listing.ts
// Reads eBay settings from the file named by DRAFTMYLISTING_ENV_FILE. Sandbox only.

import { randomUUID } from "node:crypto";
import { getAccessToken, SCOPES } from "../../src/ebay/auth.ts";
import { resolveEbayConfig } from "../../src/ebay/config.ts";
import { loadEnvFile } from "../../src/ebay/env-file.ts";
import { postGraphql } from "../../src/ebay/graphql.ts";
import { assertSafeCreateListingInput } from "../../src/ebay/listing-safety.ts";

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
    }
    ... on CreateListingValidationError {
      errorMessage
      errorCode
      violations { inputPath violationCode violationDescription }
      warnings { warningCode warningMessage }
    }
  }
}`;

// Asks the schema which fields a validation success carries, to find where fee estimates live.
const VALIDATION_SUCCESS_FIELDS = `
query { __type(name: "CreateListingValidationSuccess") { fields { name type { name kind } } } }`;

const envFile = process.env.DRAFTMYLISTING_ENV_FILE;
if (envFile === undefined || envFile === "") {
  throw new Error(
    "Set DRAFTMYLISTING_ENV_FILE to the settings file that holds your eBay keys.",
  );
}

const config = resolveEbayConfig(loadEnvFile(envFile), "sandbox");
const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

// Based on eBay's own createListing example (public-api-migration-skills),
// with VALIDATE set explicitly and a start time 24 hours out.
const input = {
  sku: `dml-poc-${Date.now()}`,
  idempotencyKey: randomUUID(),
  marketplace: "EBAY_US",
  product: {
    title: "DraftMyListing PoC Sneakers Men's Size 10",
    description:
      "Proof-of-concept validation only. This listing is never created.",
    categories: { primaryCategoryId: "15709" },
    aspects: [
      { name: "Brand", values: ["Unbranded"] },
      { name: "US Shoe Size", values: ["10"] },
      { name: "Color", values: ["Orange"] },
      { name: "Department", values: ["Men's"] },
    ],
    itemCondition: { conditionId: "1000" },
  },
  listingItems: {
    items: [
      {
        itemTerms: {
          availability: { quantityAvailable: 1 },
          pricingTerms: { fixedPrice: 49.99 },
        },
      },
    ],
  },
  listingTerms: {
    listingFormat: "FIXED_PRICE",
    lifecycleTerms: { listingDurationInDays: "GTC", startAt },
    fulfillmentTerms: {
      packageSpecifications: {
        measurementSystem: "ENGLISH",
        packageDimensions: { length: 12, width: 9, height: 3 },
        packageWeight: { majorUnit: 1, minorUnit: 5 },
      },
      shippingTerms: {
        handlingTimeDuration: "DAYS_1",
        shippingServices: [
          { shippingCost: 10.0, rank: 1, shippingServiceCode: "USPSPriority" },
        ],
        marketplaceShippingOptions: { costType: "FLAT" },
      },
    },
    returnTerms: {
      domesticReturnTerms: {
        refundMethod: "MONEY_BACK",
        returnAccepted: true,
        returnDuration: "DAYS_30",
        returnShipmentInvoicee: "BUYER",
      },
    },
    itemLocation: {
      location: "Phoenix, AZ",
      postalCode: "85001",
      country: "US",
    },
  },
  options: { operationMode: "VALIDATE" },
};

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

const schema = await postGraphql(
  config,
  accessToken,
  VALIDATION_SUCCESS_FIELDS,
);
console.log("CreateListingValidationSuccess fields (introspection):");
console.log(JSON.stringify(schema, null, 2));
