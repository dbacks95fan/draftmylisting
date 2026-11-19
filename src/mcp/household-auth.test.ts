// Copyright (c) 2026 DPSystems, LLC.
// Tests the household sign-in rules: passwords, attempt limits, single-use codes, expiry, rotation.

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { Response } from "express";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  HouseholdAuthProvider,
  LIFETIMES_MS,
  MAX_SIGN_IN_ATTEMPTS,
  type SignInResult,
} from "./household-auth.ts";

const CLIENT: OAuthClientInformationFull = {
  client_id: "client-a",
  client_name: "Claude",
  redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
};
const OTHER_CLIENT: OAuthClientInformationFull = {
  ...CLIENT,
  client_id: "client-b",
};
const PARAMS = {
  state: "state-123",
  scopes: ["listing:check"],
  codeChallenge: "challenge-abc",
  redirectUri: "https://claude.ai/api/mcp/auth_callback",
};
const FAKE_RESPONSE = {} as Response;

let clock: number;
let lastRequestId: string;
let provider: HouseholdAuthProvider;

beforeEach(() => {
  clock = 1_000_000;
  provider = new HouseholdAuthProvider(
    [{ username: "sobe", password: "correct horse" }],
    (_res, requestId) => {
      lastRequestId = requestId;
    },
    () => clock,
  );
});

async function startSignIn(): Promise<string> {
  await provider.authorize(CLIENT, PARAMS, FAKE_RESPONSE);
  return lastRequestId;
}

function codeFrom(result: SignInResult): string {
  assert.equal(result.kind, "redirect");
  const location = new URL((result as { location: string }).location);
  assert.equal(location.searchParams.get("state"), "state-123");
  return location.searchParams.get("code") ?? assert.fail("no code");
}

async function signedInCode(): Promise<string> {
  return codeFrom(
    provider.signIn(await startSignIn(), "sobe", "correct horse"),
  );
}

describe("HouseholdAuthProvider sign-in", () => {
  it("redirects back to the assistant with a code and its state after a correct password", async () => {
    const result = provider.signIn(
      await startSignIn(),
      "sobe",
      "correct horse",
    );
    const location = new URL((result as { location: string }).location);
    assert.equal(
      location.origin + location.pathname,
      "https://claude.ai/api/mcp/auth_callback",
    );
    assert.ok(codeFrom(result).length >= 40);
  });

  it("asks again on a wrong password or unknown name", async () => {
    const requestId = await startSignIn();
    assert.equal(provider.signIn(requestId, "sobe", "wrong").kind, "retry");
    assert.equal(
      provider.signIn(requestId, "nobody", "correct horse").kind,
      "retry",
    );
    // The page still works for the right password afterwards.
    assert.equal(
      provider.signIn(requestId, "sobe", "correct horse").kind,
      "redirect",
    );
  });

  it(`stops the page after ${MAX_SIGN_IN_ATTEMPTS} wrong attempts`, async () => {
    const requestId = await startSignIn();
    for (let i = 1; i < MAX_SIGN_IN_ATTEMPTS; i++) {
      assert.equal(provider.signIn(requestId, "sobe", "wrong").kind, "retry");
    }
    assert.equal(provider.signIn(requestId, "sobe", "wrong").kind, "expired");
    assert.equal(
      provider.signIn(requestId, "sobe", "correct horse").kind,
      "expired",
    );
  });

  it("refuses a sign-in page that has expired or was already used", async () => {
    const requestId = await startSignIn();
    clock += LIFETIMES_MS.pendingSignIn + 1;
    assert.equal(
      provider.signIn(requestId, "sobe", "correct horse").kind,
      "expired",
    );

    const usedId = await startSignIn();
    provider.signIn(usedId, "sobe", "correct horse");
    assert.equal(
      provider.signIn(usedId, "sobe", "correct horse").kind,
      "expired",
    );
  });

  it("requires at least one household member", () => {
    assert.throws(() => new HouseholdAuthProvider([], () => undefined));
  });
});

describe("HouseholdAuthProvider codes and passes", () => {
  it("returns the PKCE challenge for a live code", async () => {
    const code = await signedInCode();
    assert.equal(
      await provider.challengeForAuthorizationCode(CLIENT, code),
      "challenge-abc",
    );
  });

  it("trades a code for passes that identify the family member", async () => {
    const tokens = await provider.exchangeAuthorizationCode(
      CLIENT,
      await signedInCode(),
    );
    assert.equal(tokens.token_type, "bearer");
    assert.equal(tokens.expires_in, LIFETIMES_MS.accessToken / 1000);
    assert.ok(tokens.refresh_token);
    const auth = await provider.verifyAccessToken(tokens.access_token);
    assert.equal(auth.clientId, "client-a");
    assert.deepEqual(auth.scopes, ["listing:check"]);
    assert.deepEqual(auth.extra, { username: "sobe" });
  });

  it("lets a code be used only once", async () => {
    const code = await signedInCode();
    await provider.exchangeAuthorizationCode(CLIENT, code);
    await assert.rejects(provider.exchangeAuthorizationCode(CLIENT, code));
  });

  it("refuses a code presented by another client", async () => {
    const code = await signedInCode();
    await assert.rejects(
      provider.challengeForAuthorizationCode(OTHER_CLIENT, code),
    );
    await assert.rejects(
      provider.exchangeAuthorizationCode(OTHER_CLIENT, code),
    );
    // Another client cannot use up the rightful client's code by presenting it.
    await assert.doesNotReject(
      provider.exchangeAuthorizationCode(CLIENT, code),
    );
  });

  it("refuses an expired code", async () => {
    const code = await signedInCode();
    clock += LIFETIMES_MS.authorizationCode + 1;
    await assert.rejects(provider.exchangeAuthorizationCode(CLIENT, code));
  });

  it("refuses a code whose redirect_uri does not match", async () => {
    const code = await signedInCode();
    await assert.rejects(
      provider.exchangeAuthorizationCode(
        CLIENT,
        code,
        undefined,
        "https://evil.example/callback",
      ),
    );
    // Single use applies even to a refused exchange.
    await assert.rejects(provider.exchangeAuthorizationCode(CLIENT, code));
  });

  it("refuses an expired or made-up access pass as an invalid token (HTTP 401)", async () => {
    const tokens = await provider.exchangeAuthorizationCode(
      CLIENT,
      await signedInCode(),
    );
    clock += LIFETIMES_MS.accessToken + 1;
    await assert.rejects(
      provider.verifyAccessToken(tokens.access_token),
      InvalidTokenError,
    );
    await assert.rejects(
      provider.verifyAccessToken("not-a-real-pass"),
      InvalidTokenError,
    );
  });

  it("rotates refresh tokens: the old one stops working", async () => {
    const first = await provider.exchangeAuthorizationCode(
      CLIENT,
      await signedInCode(),
    );
    const refreshToken = first.refresh_token ?? assert.fail("no refresh token");
    const second = await provider.exchangeRefreshToken(CLIENT, refreshToken);
    assert.notEqual(second.access_token, first.access_token);
    await assert.doesNotReject(provider.verifyAccessToken(second.access_token));
    await assert.rejects(provider.exchangeRefreshToken(CLIENT, refreshToken));
  });

  it("refuses a refresh by another client or one that widens permissions", async () => {
    const tokens = await provider.exchangeAuthorizationCode(
      CLIENT,
      await signedInCode(),
    );
    const refreshToken =
      tokens.refresh_token ?? assert.fail("no refresh token");
    await assert.rejects(
      provider.exchangeRefreshToken(OTHER_CLIENT, refreshToken),
    );
    await assert.rejects(
      provider.exchangeRefreshToken(CLIENT, refreshToken, [
        "listing:check",
        "listing:write",
      ]),
    );
  });

  it("revokes a pass only for the client it was issued to", async () => {
    const tokens = await provider.exchangeAuthorizationCode(
      CLIENT,
      await signedInCode(),
    );
    await provider.revokeToken(OTHER_CLIENT, { token: tokens.access_token });
    await assert.doesNotReject(provider.verifyAccessToken(tokens.access_token));
    await provider.revokeToken(CLIENT, { token: tokens.access_token });
    await assert.rejects(provider.verifyAccessToken(tokens.access_token));
  });
});
