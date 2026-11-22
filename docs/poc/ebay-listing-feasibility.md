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
| 1 | Is the GraphQL Listing API (`sell.listing` scope) open to a normal developer account? Is there a sandbox? | ✅ yes; sandbox exists but cannot validate a listing (question 2) | 2026-11-10: sandbox keyset is valid (application token for base `api_scope` issued, 7200 s). Application tokens are refused (`invalid_scope`) for `sell.listing`, but equally for `sell.inventory`, `sell.listing.read`, and `commerce.taxonomy.readonly`, so the refusal does not show `sell.listing` is unavailable: sell scopes need a **user** token. 2026-11-10: the sandbox keyset's OAuth scope list (developer portal, Authorization Code grant) **includes `sell.listing`** ("View and manage eBay listings") and `sell.listing.read`; also `sell.inventory` and `sell.item.draft`. Client Credentials list includes `buy.marketplace.insights` (historical sales). 2026-11-10: sandbox **user** token obtained via the authorization code flow with `api_scope`, `sell.listing`, `sell.listing.read`, `sell.inventory`: access token 7200 s, refresh token ~548 days; a read-only seller call (`GET /sell/inventory/v1/inventory_item`) succeeded where the portal's quick token got 403; refresh grant issues new access tokens. 2026-11-18: **production** user token obtained the same way for the household seller account, with the same four scopes (refresh token ~548 days), and used for the production calls in questions 2 and 6. |
| 2 | Does `createListing` in `VALIDATE` mode return the full listing plus estimated fees? | ✅ yes, in production (sandbox fails) | 2026-11-10, sandbox: `graphqlapi.sandbox.ebay.com/graphql` accepts the mutation with a `sell.listing` user token and returns structured `CreateListingValidationError`s (input path, code, description), e.g. `LSTNG_IDEMPOTENCY_KEY_INVALID` (key must be 32 hex chars) and `LSTNG_IMAGE_URLS_TOO_LOW`. Once those were fixed, three runs (eBay's placeholder image twice, then our uploaded sandbox photo) all returned `LSTNG_INTERNAL_SERVER_ERROR`. A fourth, minimal run (no schedule, package size, or return terms) failed the same way, so none of those fields is the cause; the sandbox itself (e.g. a test user without seller setup) is the leading suspect, unproven. 2026-11-18, **production**, full (non-minimal) input with a 24-hour `scheduledToStartAt` and our uploaded photo: `CreateListingValidationSuccess`, nothing created. It returned the whole listing (SKU, title, aspects, category, price, format, `startAt` 24 h out) and `listingFees`: `INSERTION` $0.35 with a $0.35 promotional discount (free allowance), `GALLERY` $0, `SCHEDULED` $0, total $0.35 less $0.35. One warning: `LSTNG_PAYMENTS_ON_HOLD` (sale funds may be held; account-level, not a listing error). The sandbox can't be used for this API; tests that touch listings run in production under the safety rules. Schema facts (eBay docs): input start time is `lifecycleTerms.scheduledToStartAt` (`startAt` is rejected as undefined); a success carries `listingFees[] { listingFeeType feeAmount promotionalDiscount }`. GraphQL introspection is disabled. |
| 3 | Does `startAt` = now + 24h create a `SCHEDULED` listing that can be previewed in Seller Hub? | ✅ yes | 2026-11-18, production: `createListing` in `EXECUTE` with `scheduledToStartAt` 24 h out returned `CreateListingSuccess`, listing `227621229708`, `listingStatus: SCHEDULED`, `startAt` 2026-11-20T05:02:49Z. eBay also fills `scheduledEndAt` 30 days later even for `GTC` (the renewal cycle, not a real end). `sellerListings` (scope `sell.listing.read`) read back the same status and start. Sobe found it under Seller Hub → Listings → Scheduled and previewed it in full. Fees: insertion $0 after the $0.35 free-listing credit was used; scheduling $0. |
| 4 | Can a scheduled listing be edited and cancelled in Seller Hub? Does scheduling cost anything? | ✅ edit and cost; ⚠️ cancel not yet shown safe | Scheduling: **$0** (questions 2 and 3). Edit: Sobe revised the scheduled listing in Seller Hub (changed the title, replaced the photo), and `sellerListings` showed both changes with the same listing ID and schedule. Seller Hub edits show up in what the API reads, so the app must treat eBay, not its own copy, as the source of truth. Cancel, 2026-11-18: Sobe revised the listing and **removed the schedule**, which **started it immediately**; he then ended it. Read-back: `ENDED`, `startAt` moved to 2026-11-19T05:17:08Z, `actualEndAt` 05:17:30Z, so it was **live for about 22 seconds**, at a fixed price of $1.00 set during that Seller Hub revision (the app never changed the price), `endListingReason: NOT_AVAILABLE`. Lesson: removing the schedule is not a cancel. eBay's help describes **Delete** under Scheduled listings as the cancel; community posts say some Seller Hub views hide it. Not proven: a scheduled listing ended without going live, by Seller Hub Delete or by the API's `endListing`. Sobe chose not to run a second test listing for it (2026-11-18); the requirements must cover a safe cancel and test it during construction. |
| 5 | Does `updateListing` change a field and keep the same listing ID (no relist)? | ✅ yes, on a scheduled listing | 2026-11-18, production: `updateListing` with only `product.title` (and `options.operationMode: EXECUTE`, which is also its default) returned `UpdateListingSuccess` with the **same** listing ID `227621229708`, still `SCHEDULED` at the same `startAt`. Read-back showed the new title, the Seller Hub photo kept, and the price unchanged: fields left out of the update are left alone. No new fees. Not tested on a listing that has gone live, because that would expose it to buyers; eBay's schema says `updateListing` works on "an active or scheduled" listing. |
| 6 | Can our photos be uploaded (Media API) and attached to the listing? | ✅ upload and attach (validated) | 2026-11-10, sandbox: `POST apim.sandbox.ebay.com/commerce/media/v1_beta/image/create_image_from_file` (multipart, `sell.inventory`) uploaded a generated 1200×1200 JPEG and returned `imageUrl` on `i.sandbox.ebayimg.com`, expiring in 30 days. 2026-11-18, production: the same upload via `apim.ebay.com` returned an `i.ebayimg.com` URL (expires 2026-12-19), and production `VALIDATE` accepted it in `imageUrls` (question 2). A real attach is confirmed when question 3 creates a listing. Open: whether iPhone HEIC photos are accepted or need converting. |
| 7 | Does eBay's MCP server return category, item specifics, and comparable listings for a sample item? | ❌ server can't fetch data; ✅ the data itself is there | 2026-11-18/19, `@ebay/npm-public-api-mcp@1.2.0` (official: eBay npm scope and GitHub, Apache-2.0, updated 2026-10-27), run over stdio by `spikes/ebay-listing/q7-research-mcp.ts` with an application token only. Tools: `query_ebay_api`, `call_ebay_api`, `query_ebay_graphql`, `call_ebay_graphql`; there is no dedicated category or pricing tool. **Search:** a plain-language prompt ("best category for men's Nike running shoes") returned the wrong spec (Buy Marketing `getMostWatchedItems`); naming the API ("Taxonomy API get_category_suggestions") found it. **Calls:** every `call_ebay_api` failed with `Failed to get operation=[…] from specTitle=[…]` (Taxonomy `getCategorySuggestions` and `getDefaultCategoryTreeId`, Browse `search`). The source shows the server fetches each spec from `api.ebay.com/developer/mcp/v1/search/<specTitle>?operationId=<id>`, and that eBay service returned **HTTP 404** directly, with the title encoded or not, so the fault is in eBay's service, not our input. **Same data, called directly with the app token:** category suggestions for "mens nike running shoes size 10" → **15709** Men's Athletic Shoes first; `get_item_aspects_for_category` for 15709 → 37 aspects, required **Brand, US Shoe Size, Color, Department** (exactly what our test listing sent, which is why it validated) plus recommended ones such as Style Code, Model, Shoe Width; Browse search → 64,102 items for sale with price and condition. **Sold prices:** the production keyset is refused `buy.marketplace.insights` (`invalid_scope`); Marketplace Insights is limited release and would need an application to eBay. |
| 8 | Does a minimal write tool work in both Claude and ChatGPT Business, over HTTPS, with auth required, **from a phone as well as a PC**? | ⚠️ Claude PC ✅ phone ✅, with sign-in (stage 2); ChatGPT not yet | 2026-11-19, stage 1 (Sobe approved): `spikes/ebay-listing/q8-mcp-server.ts`, a dependency-free Streamable HTTP server (JSON responses, no SSE) with one tool, `validate_listing`, VALIDATE only, `readOnlyHint: true`, **no sign-in**, bound to loopback behind a temporary `trycloudflare.com` quick tunnel, capped at 50 tool calls, and shut down after the test (public address then returned HTTP 530). **Claude (claude.ai, PC browser):** added as a custom connector with no auth; requests came from Anthropic's cloud (`Claude-User`, `python-httpx`), opening with `server/discover` (answered −32601, then a normal `initialize`); from "used men's Nike Revolution 7, size 10, black, $44.99" it chose category 15709, condition 3000, all four required aspects plus Model and Type → `CreateListingValidationSuccess`. **Claude (phone app):** the connector synced from the web; from "new women's Adidas Ultraboost, size 8, white, $89.99" it chose 95672 Women's Athletic Shoes, condition 1000 → `CreateListingValidationSuccess`. **ChatGPT:** deferred by Sobe. **Stage 2, 2026-11-22:** `spikes/ebay-listing/q8-mcp-auth-server.ts` (MCP SDK 1.32.2 auth router and bearer check, our household sign-in page, same VALIDATE-only tool, 50-call cap) behind a new quick tunnel; from outside, an MCP call with no pass got 401 with `WWW-Authenticate` pointing to the protected-resource metadata, and both metadata documents returned 200. **Claude (claude.ai, PC, Firefox):** added as a custom connector with no client ID (dynamic client registration, 201), our sign-in page opened in the browser; a wrong name was refused (401, retry page), the right one redirected back (302), Claude's cloud exchanged the code for a pass, then `Claude-User` calls succeeded with it; from "used men's Nike Pegasus 40, size 11, blue, $55" the tool ran as the signed-in member (`by=sobe`): category 15709, condition 3000, five aspects → `CreateListingValidationSuccess`. **Claude (phone app):** no second sign-in; the first prompt left out the price (a required tool input) and Claude declined without calling the server, wrongly saying the tool "only sends a draft listing"; with the price, "new women's Adidas Ultraboost, size 8, white, $89.99" → category 95672, condition 1000, six aspects → `CreateListingValidationSuccess`. Each connect also drew one or two HTTP 400s on `/mcp` that Claude moved past; their cause was not logged (possibly the `server/discover` probe seen in stage 1). Server and tunnel shut down after. Goal (Sobe, 2026-11-19): any family member's phone or PC, so the real server is hosted, not tied to one PC; a temporary tunnel is fine for this test. Both assistants call the server from their own cloud, so a public address is what makes it device-independent. Unverified (help pages, 2026-11-19): Claude custom connectors added at claude.ai sync to the mobile apps (adding from mobile is beta); ChatGPT custom MCP connectors are documented for Business on **web**, and third-party guides disagree on mobile, so the phone check is the key unknown. |

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
- Tool descriptions steer whether the assistant calls a tool at all (question 8,
  stage 2): with a required input missing, Claude refused instead of asking for
  it, and misdescribed the tool. The real tools need descriptions that match how
  family members ask, and should tell the assistant to ask for missing details.
- Find and handle the HTTP 400 Claude gets on `/mcp` when connecting (log the
  method that caused it first).
- Sold-price data: confirmed 2026-11-19 that the production keyset is refused
  `buy.marketplace.insights` (`invalid_scope`), even though the sandbox keyset
  lists it. Pricing can use items currently for sale (Browse) unless eBay
  grants Marketplace Insights access.
- eBay's MCP server (`@ebay/npm-public-api-mcp@1.2.0`) cannot fetch data today
  (question 7). **Decided 2026-11-19 (Sobe):** our own server gets three
  focused read tools now (category suggestions, item aspects, search for items
  for sale), using the app token only. eBay's server can replace them later if
  eBay fixes it; recheck when a new version ships.
