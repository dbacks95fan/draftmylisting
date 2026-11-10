// Copyright (c) 2026 DPSystems, LLC.
// Last check before any createListing call, so nothing can ever go live without the review window.

/** The only fields of a createListing input this check needs to read. */
export interface ListingSafetyFields {
  options?: { operationMode?: string };
  listingTerms?: { lifecycleTerms?: { startAt?: string } };
}

/**
 * Listings are scheduled 24 hours out. The check accepts 23 hours so that the
 * seconds spent building and sending a request, or a small clock difference
 * with eBay, never reject a correctly scheduled listing.
 */
export const MIN_SCHEDULE_LEAD_MS = 23 * 60 * 60 * 1000;

/**
 * Throws if sending this createListing input could create a listing buyers see
 * before the household has had its review window.
 *
 * eBay's createListing defaults to EXECUTE (a real listing) when
 * options.operationMode is omitted, so an explicit mode is always required.
 */
export function assertSafeCreateListingInput(
  input: ListingSafetyFields,
  now: Date,
): void {
  const mode = input.options?.operationMode;
  if (mode === "VALIDATE") {
    return;
  }
  if (mode !== "EXECUTE") {
    throw new Error(
      "createListing blocked: options.operationMode must be set explicitly to VALIDATE or EXECUTE.",
    );
  }

  const startAt = input.listingTerms?.lifecycleTerms?.startAt;
  if (startAt === undefined) {
    throw new Error(
      "createListing blocked: EXECUTE needs listingTerms.lifecycleTerms.startAt, or the listing goes live immediately.",
    );
  }
  const startMs = new Date(startAt).getTime();
  if (Number.isNaN(startMs)) {
    throw new Error(
      `createListing blocked: startAt "${startAt}" is not a valid date-time.`,
    );
  }
  if (startMs - now.getTime() < MIN_SCHEDULE_LEAD_MS) {
    throw new Error(
      `createListing blocked: startAt ${startAt} is less than 23 hours away. Schedule listings 24 hours ahead so there is time to review them.`,
    );
  }
}
