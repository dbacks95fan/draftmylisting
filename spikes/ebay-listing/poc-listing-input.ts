// Copyright (c) 2026 DPSystems, LLC.
// The one test listing the PoC spikes send to createListing, so VALIDATE and EXECUTE runs test the same thing.

import { randomUUID } from "node:crypto";

export interface PocListingOptions {
  imageUrl: string;
  operationMode: "VALIDATE" | "EXECUTE";
  /** ISO date-time the listing starts; omitted only by the "minimal" VALIDATE run. */
  scheduledToStartAt?: string;
  /** Drops package size and return terms to isolate validation failures. */
  minimal?: boolean;
}

// Based on eBay's own createListing example (public-api-migration-skills).
// The title says it is a test, in case it is ever seen in Seller Hub.
export function buildPocListingInput(options: PocListingOptions) {
  const {
    imageUrl,
    operationMode,
    scheduledToStartAt,
    minimal = false,
  } = options;
  return {
    sku: `dml-poc-${Date.now()}`,
    // eBay requires exactly 32 hex characters (0-9, A-F): a UUID without its dashes.
    idempotencyKey: randomUUID().replaceAll("-", "").toUpperCase(),
    marketplace: "EBAY_US",
    product: {
      title: "DraftMyListing PoC Sneakers Men's Size 10",
      description:
        "Proof-of-concept test only. This listing is ended before it starts.",
      categories: { primaryCategoryId: "15709" },
      aspects: [
        { name: "Brand", values: ["Unbranded"] },
        { name: "US Shoe Size", values: ["10"] },
        { name: "Color", values: ["Orange"] },
        { name: "Department", values: ["Men's"] },
      ],
      // An eBay-hosted photo URL from q6-upload-photo.ts. eBay's sample placeholder
      // URL made the sandbox return LSTNG_INTERNAL_SERVER_ERROR.
      imageUrls: [imageUrl],
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
      // Input field is scheduledToStartAt; the response reports it back as startAt.
      lifecycleTerms:
        scheduledToStartAt === undefined
          ? { listingDurationInDays: "GTC" }
          : { listingDurationInDays: "GTC", scheduledToStartAt },
      fulfillmentTerms: {
        ...(minimal
          ? {}
          : {
              packageSpecifications: {
                measurementSystem: "ENGLISH",
                packageDimensions: { length: 12, width: 9, height: 3 },
                packageWeight: { majorUnit: 1, minorUnit: 5 },
              },
            }),
        shippingTerms: {
          handlingTimeDuration: "DAYS_1",
          shippingServices: [
            {
              shippingCost: 10.0,
              rank: 1,
              shippingServiceCode: "USPSPriority",
            },
          ],
          marketplaceShippingOptions: { costType: "FLAT" },
        },
      },
      ...(minimal
        ? {}
        : {
            returnTerms: {
              domesticReturnTerms: {
                refundMethod: "MONEY_BACK",
                returnAccepted: true,
                returnDuration: "DAYS_30",
                returnShipmentInvoicee: "BUYER",
              },
            },
          }),
      itemLocation: {
        location: "Phoenix, AZ",
        postalCode: "85001",
        country: "US",
      },
    },
    options: { operationMode },
  };
}
