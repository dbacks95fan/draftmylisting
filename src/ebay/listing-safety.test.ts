// Copyright (c) 2026 DPSystems, LLC.
// Tests that the createListing safety check blocks anything that could go live too soon.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertSafeCreateListingInput,
  MIN_SCHEDULE_LEAD_MS,
  type ListingSafetyFields,
} from "./listing-safety.ts";

const NOW = new Date("2026-11-10T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

function executeAt(startAt: string | undefined): ListingSafetyFields {
  return {
    options: { operationMode: "EXECUTE" },
    listingTerms: { lifecycleTerms: { scheduledToStartAt: startAt } },
  };
}

function hoursFromNow(hours: number): string {
  return new Date(NOW.getTime() + hours * HOUR_MS).toISOString();
}

describe("assertSafeCreateListingInput", () => {
  it("rejects a missing operation mode, because eBay defaults to EXECUTE", () => {
    assert.throws(() => assertSafeCreateListingInput({}, NOW));
  });

  it("rejects an unknown operation mode", () => {
    assert.throws(() =>
      assertSafeCreateListingInput(
        { options: { operationMode: "DRAFT" } },
        NOW,
      ),
    );
  });

  it("allows VALIDATE without a start time, because nothing is created", () => {
    assert.doesNotThrow(() =>
      assertSafeCreateListingInput(
        { options: { operationMode: "VALIDATE" } },
        NOW,
      ),
    );
  });

  it("rejects EXECUTE without a start time, which would go live immediately", () => {
    assert.throws(() =>
      assertSafeCreateListingInput(executeAt(undefined), NOW),
    );
  });

  it("rejects EXECUTE with a start time that is not a date", () => {
    assert.throws(() =>
      assertSafeCreateListingInput(executeAt("tomorrow-ish"), NOW),
    );
  });

  it("rejects EXECUTE with a start time in the past", () => {
    assert.throws(() =>
      assertSafeCreateListingInput(executeAt(hoursFromNow(-1)), NOW),
    );
  });

  it("rejects EXECUTE starting only one hour from now", () => {
    assert.throws(() =>
      assertSafeCreateListingInput(executeAt(hoursFromNow(1)), NOW),
    );
  });

  it("rejects EXECUTE one minute short of the minimum lead time", () => {
    const justShort = new Date(
      NOW.getTime() + MIN_SCHEDULE_LEAD_MS - 60_000,
    ).toISOString();
    assert.throws(() =>
      assertSafeCreateListingInput(executeAt(justShort), NOW),
    );
  });

  it("allows EXECUTE at exactly the minimum lead time", () => {
    const exactly = new Date(
      NOW.getTime() + MIN_SCHEDULE_LEAD_MS,
    ).toISOString();
    assert.doesNotThrow(() =>
      assertSafeCreateListingInput(executeAt(exactly), NOW),
    );
  });

  it("allows EXECUTE scheduled just over 24 hours ahead", () => {
    assert.doesNotThrow(() =>
      assertSafeCreateListingInput(executeAt(hoursFromNow(24 + 1 / 60)), NOW),
    );
  });
});
