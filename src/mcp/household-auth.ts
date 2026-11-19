// Copyright (c) 2026 DPSystems, LLC.
// OAuth sign-in for the household MCP server: family members sign in on our own page, and
// the MCP SDK's router handles the protocol (metadata, registration, PKCE, token endpoint).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { InvalidGrantError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

/** How long each kind of secret stays valid. */
export const LIFETIMES_MS = {
  /** The sign-in page, from the assistant sending someone to it. */
  pendingSignIn: 10 * 60 * 1000,
  /** The one-time code the assistant trades for passes. */
  authorizationCode: 5 * 60 * 1000,
  /** The pass sent with every tool call. */
  accessToken: 60 * 60 * 1000,
  /** Lets the assistant get a new access pass without another sign-in. */
  refreshToken: 30 * 24 * 60 * 60 * 1000,
} as const;

/** Wrong passwords allowed on one sign-in page before it stops working. */
export const MAX_SIGN_IN_ATTEMPTS = 5;

export interface HouseholdMember {
  username: string;
  password: string;
}

interface PendingSignIn {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  expiresAt: number;
  attempts: number;
}

interface IssuedCode {
  clientId: string;
  params: AuthorizationParams;
  username: string;
  expiresAt: number;
}

interface IssuedToken {
  clientId: string;
  username: string;
  scopes: string[];
  resource?: URL;
  expiresAt: number;
}

/** Writes the sign-in page; requestId must be posted back with the form. */
export type SignInPageRenderer = (
  res: Response,
  requestId: string,
  clientName: string,
  message?: string,
) => void;

export type SignInResult =
  | { kind: "redirect"; location: string; username: string }
  | { kind: "retry"; message: string }
  | { kind: "expired"; message: string };

const newSecret = (): string => randomBytes(32).toString("base64url");

// Hashing both sides first makes the comparison constant-time whatever the lengths.
const sameSecret = (given: string, expected: string): boolean =>
  timingSafeEqual(
    createHash("sha256").update(given).digest(),
    createHash("sha256").update(expected).digest(),
  );

class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private readonly clients = new Map<string, OAuthClientInformationFull>();

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.clients.get(clientId);
  }

  // The SDK's registration handler assigns client_id before calling this.
  registerClient(
    client: OAuthClientInformationFull,
  ): OAuthClientInformationFull {
    this.clients.set(client.client_id, client);
    return client;
  }
}

/**
 * Keeps clients, sign-in pages, codes, and passes in memory, so a restart signs everyone
 * out. That is acceptable for the proof of concept; the real server will persist them.
 */
export class HouseholdAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new InMemoryClientsStore();
  private readonly pending = new Map<string, PendingSignIn>();
  private readonly codes = new Map<string, IssuedCode>();
  private readonly accessTokens = new Map<string, IssuedToken>();
  private readonly refreshTokens = new Map<string, IssuedToken>();
  private readonly members: readonly HouseholdMember[];
  private readonly renderSignInPage: SignInPageRenderer;
  private readonly now: () => number;

  constructor(
    members: readonly HouseholdMember[],
    renderSignInPage: SignInPageRenderer,
    now: () => number = Date.now,
  ) {
    if (members.length === 0) {
      throw new Error("At least one household member must be able to sign in.");
    }
    this.members = members;
    this.renderSignInPage = renderSignInPage;
    this.now = now;
  }

  /** Called by the SDK once the request is valid: show our sign-in page. */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const requestId = newSecret();
    this.pending.set(requestId, {
      client,
      params,
      expiresAt: this.now() + LIFETIMES_MS.pendingSignIn,
      attempts: 0,
    });
    this.renderSignInPage(res, requestId, clientLabel(client));
  }

  /** Handles the sign-in form. On success, returns where to send the browser. */
  signIn(requestId: string, username: string, password: string): SignInResult {
    const request = this.pending.get(requestId);
    if (request === undefined || request.expiresAt < this.now()) {
      this.pending.delete(requestId);
      return {
        kind: "expired",
        message:
          "This sign-in page has expired. Go back to the assistant and connect again.",
      };
    }
    const member = this.members.find((m) => m.username === username);
    // Compare a password even for an unknown name, so timing does not reveal valid names.
    const passwordOk = sameSecret(password, member?.password ?? newSecret());
    if (member === undefined || !passwordOk) {
      request.attempts += 1;
      if (request.attempts >= MAX_SIGN_IN_ATTEMPTS) {
        this.pending.delete(requestId);
        return {
          kind: "expired",
          message:
            "Too many wrong attempts. Go back to the assistant and connect again.",
        };
      }
      return { kind: "retry", message: "That name or password is not right." };
    }

    this.pending.delete(requestId);
    const code = newSecret();
    this.codes.set(code, {
      clientId: request.client.client_id,
      params: request.params,
      username: member.username,
      expiresAt: this.now() + LIFETIMES_MS.authorizationCode,
    });
    const target = new URL(request.params.redirectUri);
    target.searchParams.set("code", code);
    if (request.params.state !== undefined) {
      target.searchParams.set("state", request.params.state);
    }
    return {
      kind: "redirect",
      location: target.toString(),
      username: member.username,
    };
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    return this.liveCode(client, authorizationCode).params.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string, // The SDK's token handler checks PKCE before calling this.
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const code = this.liveCode(client, authorizationCode);
    // Single use: a code is gone after the first exchange, successful or not.
    this.codes.delete(authorizationCode);
    if (redirectUri !== undefined && redirectUri !== code.params.redirectUri) {
      throw new InvalidGrantError(
        "redirect_uri does not match the sign-in request.",
      );
    }
    if (
      resource !== undefined &&
      code.params.resource !== undefined &&
      resource.href !== code.params.resource.href
    ) {
      throw new InvalidGrantError(
        "resource does not match the sign-in request.",
      );
    }
    return this.issueTokens({
      clientId: client.client_id,
      username: code.username,
      scopes: code.params.scopes ?? [],
      resource: code.params.resource,
    });
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const issued = this.refreshTokens.get(refreshToken);
    if (
      issued === undefined ||
      issued.expiresAt < this.now() ||
      issued.clientId !== client.client_id
    ) {
      throw new InvalidGrantError(
        "Refresh token is invalid or expired. Sign in again.",
      );
    }
    if (scopes?.some((s) => !issued.scopes.includes(s))) {
      throw new InvalidGrantError(
        "A refresh cannot add permissions that were not granted.",
      );
    }
    // Rotation: each refresh token works once, so a stolen copy stops working quickly.
    this.refreshTokens.delete(refreshToken);
    return this.issueTokens({
      clientId: issued.clientId,
      username: issued.username,
      scopes: scopes ?? issued.scopes,
      resource: issued.resource,
    });
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const issued = this.accessTokens.get(token);
    if (issued === undefined || issued.expiresAt < this.now()) {
      this.accessTokens.delete(token);
      throw new InvalidGrantError("Access token is invalid or expired.");
    }
    return {
      token,
      clientId: issued.clientId,
      scopes: issued.scopes,
      expiresAt: Math.floor(issued.expiresAt / 1000),
      resource: issued.resource,
      extra: { username: issued.username },
    };
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    for (const store of [this.accessTokens, this.refreshTokens]) {
      if (store.get(request.token)?.clientId === client.client_id) {
        store.delete(request.token);
      }
    }
  }

  private liveCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): IssuedCode {
    const code = this.codes.get(authorizationCode);
    if (
      code === undefined ||
      code.expiresAt < this.now() ||
      code.clientId !== client.client_id
    ) {
      throw new InvalidGrantError(
        "Authorization code is invalid, expired, or was issued to another client.",
      );
    }
    return code;
  }

  private issueTokens(grant: Omit<IssuedToken, "expiresAt">): OAuthTokens {
    const accessToken = newSecret();
    const refreshToken = newSecret();
    this.accessTokens.set(accessToken, {
      ...grant,
      expiresAt: this.now() + LIFETIMES_MS.accessToken,
    });
    this.refreshTokens.set(refreshToken, {
      ...grant,
      expiresAt: this.now() + LIFETIMES_MS.refreshToken,
    });
    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: LIFETIMES_MS.accessToken / 1000,
      refresh_token: refreshToken,
      scope: grant.scopes.join(" "),
    };
  }
}

function clientLabel(client: OAuthClientInformationFull): string {
  return client.client_name ?? "An assistant";
}
