# eBay Listing Feasibility — Proof of Concept

> Status: **in progress** · Started: 2026-11-10 · Approved by Sobe: 2026-11-10

## Why this exists

DraftMyListing's value depends on what eBay lets an app do to a seller's
account. Before writing requirements, this proof of concept answers that with
real API calls instead of documentation reading. Its findings become
constraints in the SRS (`docs/srs.md`).

## Decisions this PoC builds on (2026-11-10)

- **No true eBay draft is required.** Instead: a full preview before the
  listing goes live, and the ability to edit it after it is live without
  relisting.
- **Every listing is scheduled 24 hours in the future** (`startAt`). That
  window is the household's review time; after it, eBay starts the listing
  automatically.
- **Photos are our own**, supplied by the household. No web-sourced images.
- **Reuse over build.** eBay's official read-only MCP server
  (`@ebay/npm-public-api-mcp`) handles research. We build only a small write
  server for what nothing existing does. Two MCP servers are acceptable.
- **Assistants:** ChatGPT (Business plan today, possibly Plus/Pro later) and
  Claude. Used within one household, against **one shared eBay account**.
  ChatGPT only connects to remote MCP servers, so the write server is hosted
  over HTTPS and must require authentication.

## Safety rules for every PoC call

1. Every `createListing` call carries a future `startAt`. No exceptions.
2. Every validation call sets `options.operationMode` to `VALIDATE`
   explicitly. The API's default is `EXECUTE`, which creates a live listing.
3. Anything touching the real (production) account needs Sobe's OK each
   time. Test listings are cancelled before their start time.
4. Keys and tokens live only in a local `.env` (git-ignored). Never in code,
   commits, chat, or this document.

## Questions and findings

| # | Question | Result | Evidence |
|---|---|---|---|
| 1 | Is the GraphQL Listing API (`sell.listing` scope) open to a normal developer account? Is there a sandbox? | ⏳ in progress | 2026-11-10: sandbox keyset is valid (application token for base `api_scope` issued, 7200 s). Application tokens are refused (`invalid_scope`) for `sell.listing`, but equally for `sell.inventory`, `sell.listing.read`, and `commerce.taxonomy.readonly`, so the refusal does not show `sell.listing` is unavailable: sell scopes need a **user** token. 2026-11-10: the sandbox keyset's OAuth scope list (developer portal, Authorization Code grant) **includes `sell.listing`** ("View and manage eBay listings") and `sell.listing.read`; also `sell.inventory` and `sell.item.draft`. Client Credentials list includes `buy.marketplace.insights` (historical sales). 2026-11-10: sandbox **user** token obtained via the authorization code flow with `api_scope`, `sell.listing`, `sell.listing.read`, `sell.inventory`: access token 7200 s, refresh token ~548 days; a read-only seller call (`GET /sell/inventory/v1/inventory_item`) succeeded where the portal's quick token got 403; refresh grant issues new access tokens. Next: one real GraphQL Listing API call (`createListing` in `VALIDATE`). |
| 2 | Does `createListing` in `VALIDATE` mode return the full listing plus estimated fees? | ⚠️ partial | 2026-11-10, sandbox: `graphqlapi.sandbox.ebay.com/graphql` accepts the mutation with a `sell.listing` user token and returns structured `CreateListingValidationError`s (input path, code, description), e.g. `LSTNG_IDEMPOTENCY_KEY_INVALID` (key must be 32 hex chars) and `LSTNG_IMAGE_URLS_TOO_LOW`. Once those were fixed, three runs (eBay's placeholder image twice, then our uploaded sandbox photo) all returned `LSTNG_INTERNAL_SERVER_ERROR`. A fourth, minimal run (no schedule, package size, or return terms) failed the same way, so none of those fields is the cause; the sandbox itself (e.g. a test user without seller setup) is the leading suspect, unproven. Next: `VALIDATE` against production. Schema facts (eBay docs): input start time is `lifecycleTerms.scheduledToStartAt` (`startAt` is rejected as undefined); a success carries `listingFees[] { listingFeeType feeAmount promotionalDiscount }`. GraphQL introspection is disabled. |
| 3 | Does `startAt` = now + 24h create a `SCHEDULED` listing that can be previewed in Seller Hub? | ⏳ pending | |
| 4 | Can a scheduled listing be edited and cancelled in Seller Hub? Does scheduling cost anything? | ⏳ pending | |
| 5 | Does `updateListing` change a field and keep the same listing ID (no relist)? | ⏳ pending | |
| 6 | Can our photos be uploaded (Media API) and attached to the listing? | ⚠️ upload ✅, attach pending | 2026-11-10, sandbox: `POST apim.sandbox.ebay.com/commerce/media/v1_beta/image/create_image_from_file` (multipart, `sell.inventory`) uploaded a generated 1200×1200 JPEG and returned `imageUrl` on `i.sandbox.ebayimg.com`, expiring in 30 days. Attaching it is blocked by the question 2 server error. Open: whether iPhone HEIC photos are accepted or need converting. |
| 7 | Does eBay's MCP server return category, item specifics, and comparable listings for a sample item? | ⏳ pending | |
| 8 | Does a minimal write tool work in both Claude and ChatGPT Business, over HTTPS, with auth required? | ⏳ pending | |

## Ruled out before testing

| Route | Why it was dropped | Source |
|---|---|---|
| REST Listing API `createItemDraft` | Limited-release beta; drafts no longer required | eBay Listing API OAS spec; partner deck (2020) |
| Inventory API unpublished offers | Not visible in Seller Hub until published; Inventory-API listings cannot be edited in Seller Hub | eBay developer forum (staff); Inventory API overview |
| Seller Hub "Create drafts" CSV template | Drafts no longer required; manual upload | eBay Seller Hub Reports help |
| Trading API `VerifyAddItem` | Legacy; replaced by GraphQL `createListing` in `VALIDATE` mode | eBay `public-api-migration-skills`, `mode-verify-to-validate.md` |

## eBay OAuth lessons (for the real server)

- The developer portal's quick "sign in" button returns only a 2-hour access
  token, with default scopes. A refresh token comes only from the full
  authorization code flow.
- `redirect_uri` must be the **RuName** (a short alias, e.g.
  `Name-Name-App-xxxxx`), not the portal's sign-in link that contains it.
  Sending the link lands on `auth2.sandbox.ebay.com/oauth2/errorOauth`.
- With the RuName's "auth accepted URL" left at eBay's default page, the
  browser lands on `ThirdPartyAuthSucessFailure?isAuthSuccessful=true` with
  **no `code` and no `state`**. The accepted URL must point to a page we
  control; the code arrives as `?code=…&state=…&expires_in=299`.
- The code is URL-encoded (`%5E`, `%23`) and expires in ~5 minutes. Exchange
  it immediately and automatically. One manual copy-and-paste attempt failed
  with `invalid_grant`; an automatic exchange 133 s after opening the link
  succeeded. Expiry is the likely cause, but it was not proven.
- Always send and verify `state`. It caught the default-page case above.

## Open items found during the PoC

- **Accepted dev-only vulnerability (2026-11-10, Sobe's decision):** `npm audit`
  reports 10 moderate findings, all from `minimatch` 10.2.6
  ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249),
  denial of service via crafted glob patterns), pulled in by `eslint` 10.13.0
  and `typescript-eslint` 8.72.1. Dev tooling only; the only globs it reads are
  our own config. Update when both packages ship on `minimatch` ≥ 11.0.1.

- How the PoC gets a temporary HTTPS address for question 8 (NAS reverse
  proxy or a short-lived tunnel) — decide when we reach it.
- Fallback design if ChatGPT moves to a plan where custom MCP is read-only.
- Sold-price data: Marketplace Insights API is limited release; eBay's MCP
  server can search active listings only (to confirm in question 7). The
  sandbox keyset lists `buy.marketplace.insights` under Client Credentials, so
  sold-price data may be reachable; confirm on the production keyset.
