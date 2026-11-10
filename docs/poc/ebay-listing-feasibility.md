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
| 1 | Is the GraphQL Listing API (`sell.listing` scope) open to a normal developer account? Is there a sandbox? | ⏳ pending | |
| 2 | Does `createListing` in `VALIDATE` mode return the full listing plus estimated fees? | ⏳ pending | |
| 3 | Does `startAt` = now + 24h create a `SCHEDULED` listing that can be previewed in Seller Hub? | ⏳ pending | |
| 4 | Can a scheduled listing be edited and cancelled in Seller Hub? Does scheduling cost anything? | ⏳ pending | |
| 5 | Does `updateListing` change a field and keep the same listing ID (no relist)? | ⏳ pending | |
| 6 | Can our photos be uploaded (Media API) and attached to the listing? | ⏳ pending | |
| 7 | Does eBay's MCP server return category, item specifics, and comparable listings for a sample item? | ⏳ pending | |
| 8 | Does a minimal write tool work in both Claude and ChatGPT Business, over HTTPS, with auth required? | ⏳ pending | |

## Ruled out before testing

| Route | Why it was dropped | Source |
|---|---|---|
| REST Listing API `createItemDraft` | Limited-release beta; drafts no longer required | eBay Listing API OAS spec; partner deck (2020) |
| Inventory API unpublished offers | Not visible in Seller Hub until published; Inventory-API listings cannot be edited in Seller Hub | eBay developer forum (staff); Inventory API overview |
| Seller Hub "Create drafts" CSV template | Drafts no longer required; manual upload | eBay Seller Hub Reports help |
| Trading API `VerifyAddItem` | Legacy; replaced by GraphQL `createListing` in `VALIDATE` mode | eBay `public-api-migration-skills`, `mode-verify-to-validate.md` |

## Open items found during the PoC

- How the PoC gets a temporary HTTPS address for question 8 (NAS reverse
  proxy or a short-lived tunnel) — decide when we reach it.
- Fallback design if ChatGPT moves to a plan where custom MCP is read-only.
- Sold-price data: Marketplace Insights API is limited release; eBay's MCP
  server can search active listings only (to confirm in question 7).
