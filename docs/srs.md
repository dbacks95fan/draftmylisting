# DraftMyListing — Software Requirements Specification

> Version: 0.1 (draft, in progress) · Requirement syntax: EARS ·
> Owner: Sobe · Started: 2026-11-26
>
> Lineage: ISO/IEC/IEEE 29148. This document is the source of truth for the
> architecture, UX and planning stages. Feasibility evidence lives in
> [`docs/poc/ebay-listing-feasibility.md`](poc/ebay-listing-feasibility.md).

## Revision history

| Version | Date | Change | IDs affected |
|---|---|---|---|
| 0.1 | 2026-11-26 | Skeleton created | — |

## 1. Introduction

### 1.1 Purpose

DraftMyListing helps one household sell items on eBay. A household member
describes an item and supplies photos to their AI assistant (Claude or
ChatGPT), from a phone or a PC. DraftMyListing researches the item and prepares
a complete eBay listing on the household's one shared seller account —
category, item specifics, condition, price and photos — scheduled to go live
24 hours later. During that window any household member can review the
listing, edit it (through the assistant or in eBay Seller Hub) or cancel it
safely. If no one acts, eBay starts the listing on schedule.

Confirmed by Sobe 2026-11-26. Read as confirmed with it: the product serves
**this household only**, against **one** eBay seller account, and the
assistants are its **only** entry point (no web page or app of its own).

### 1.2 Product scope

Confirmed by Sobe 2026-11-26.

**In scope (first version):**

- Drafting a listing from the member's photos and a few clarifying questions:
  item identification, category, item specifics, condition, title and
  description.
- A price based on sold comparables (G-4; data source TBD-002).
- Uploading the member's own photos to the listing.
- Auction format for every listing, with a Buy It Now price (Sobe, 2026-11-26;
  TBD-003, TBD-005).
- Validating the listing with eBay, then scheduling it 24 hours out.
- Reviewing, editing and safely cancelling a scheduled listing.
- Use from Claude and ChatGPT, on phone and PC, through one shared household
  sign-in.
- Hosting on the household's NAS.

**Out of scope (first version):**

- Anything after a listing goes live: monitoring, relisting, buyer messages,
  shipping, returns, sales reporting.
- Other marketplaces (for example Facebook Marketplace or Mercari).
- More than one eBay account, or users outside the household.
- A web page or app of DraftMyListing's own. Exception: if photos cannot be
  passed from the chat to DraftMyListing, a one-time photo upload link is
  acceptable (TBD-006).
- Fixed-price (Buy It Now only) listings. Every listing is an auction.
- Drafting several listings in one request. A member lists one item at a
  time (Sobe, 2026-11-26).

### 1.3 Definitions, acronyms and abbreviations

| Term | Meaning |
|---|---|
| The system | DraftMyListing together with the assistant behavior its tools direct. Requirements about what "the system" asks or tells a member are met through the assistant, steered by DraftMyListing's tools and their descriptions. |
| Assistant | The member's AI chat assistant: Claude or ChatGPT. |
| Member | Anyone in the household using DraftMyListing through the shared household sign-in. The system does not tell members apart (SRS 2.3). |
| Draft | A listing being prepared that eBay has not yet scheduled. |
| Scheduled listing | A listing eBay holds with a future start time (`SCHEDULED`); not visible to buyers. |
| Review window | The time between scheduling and eBay starting the listing: at least 24 hours, and up to about 48 hours because the start is moved so the auction ends at 10 p.m. Eastern (FR-SCHED-004). |
| Item specifics | eBay's per-category attributes (for example Brand, Size, Color); some are required, some recommended. |
| Condition | eBay's per-category condition value (for example New, Used). |
| Seller Hub | eBay's own web tools for managing listings. |
| MCP | Model Context Protocol: how the assistants call DraftMyListing's tools. |
| EARS | Easy Approach to Requirements Syntax, the pattern set used in section 3. |

### 1.4 References

- [eBay listing feasibility PoC](poc/ebay-listing-feasibility.md) (closed 2026-11-22)

## 2. Overall description

### 2.1 Product perspective

A new, self-contained product with no predecessor. It sits between the
household's AI assistants and eBay:

- Members talk only to their assistant (Claude or ChatGPT) on a phone or PC.
- The assistant calls DraftMyListing's tools over the internet. Both assistants
  make these calls from their own cloud, so DraftMyListing must be reachable
  at a public HTTPS address and require sign-in (PoC question 8).
- DraftMyListing calls eBay's APIs on the household's one seller account.
- eBay, not DraftMyListing, is the source of truth for every listing: edits
  made in Seller Hub must show up in what DraftMyListing reports (PoC
  question 4).
- It is hosted on the household's NAS, not on any one member's PC.

### 2.2 Goals and success metrics

Confirmed by Sobe 2026-11-26.

| ID | Goal | Success metric |
|---|---|---|
| G-1 | **Least possible effort per listing.** Ideally a member only takes a few photos and answers a few clarifying questions; the assistant works out the rest from the photos. The less the member has to do, the better. **Guiding rule (Sobe, 2026-11-26):** the assistant fills in as much of the listing as it can. A member filling in or fixing a few fields afterwards (for example the price) is acceptable; the time saved comes from everything else being done. | A member spends about **5 minutes** of their own time from first photo to a scheduled, complete listing. |
| G-2 | **Listings eBay accepts the first time.** | At least **95%** of listings pass eBay's validation on the first attempt, with every required item specific filled. |
| G-3 | **Nothing goes live by surprise.** | **Zero** listings start without the full 24-hour review window, including through a cancel (the PoC's cancel started a listing early: question 4). |
| G-4 | **Realistic prices.** The price comes from the assistant's research on similar items that have **sold**. | Every suggested price cites the sold comparables it is based on. Source of sold data: TBD-002. |
| G-5 | **Anyone in the household can use it** from their own phone or PC. | One shared household sign-in; works from phone and PC in each supported assistant. |

### 2.3 Stakeholders and user classes

Confirmed by Sobe 2026-11-26; revised 2026-11-27. About **3** household
members in all. **Single-user model (Sobe, 2026-11-27):** one eBay account and
one shared household sign-in. Anyone in the household adds the connector and
signs in to the same account; there are no individual user accounts.

| User class | Who | What they do |
|---|---|---|
| Household user | Anyone in the family who sells, about 3 people | Adds the DraftMyListing connector to their assistant and signs in with the **shared household sign-in**. Takes photos, answers clarifying questions, creates any listings they want, and reviews, edits and cancels listings. Everyone uses the one eBay seller account. The system does not identify individual people (Sobe, 2026-11-27). |
| Household admin | Sobe | Sets up devices and the shared sign-in, connects the eBay account, sets household settings, and handles problems. An operator role, not a separate login. |
| Buyer | eBay shoppers | Never use DraftMyListing; see only the finished listing on eBay. |

Implication for UX and setup: members need no technical skill beyond taking
photos and chatting with their assistant, because the admin does all setup.

### 2.4 Operating environment

- **Server:** Docker on the household's Synology NAS, reachable from the
  internet over HTTPS at a public address (NFR-PORT-001, NFR-SEC-001).
- **Clients:** current Claude (web, desktop, phone apps) and ChatGPT (web,
  phone apps) on the members' own phones and PCs (NFR-COMP-001).
- **External service:** eBay US production APIs on the household's one seller
  account. eBay's sandbox cannot validate listings (PoC question 2).

### 2.5 Constraints

- **eBay rules:** follow eBay's API License Agreement and developer program
  policies; request minimum OAuth scopes; no scraping (NFR-COMPL-001).
- **No paid services:** the only costs are eBay's own fees (NFR-COMPL-002).
- **Live eBay calls are dangerous:** an API create without a schedule makes a
  listing live at once. The PoC safety rules (future start on every create,
  `VALIDATE` set explicitly) are permanent (FR-SCHED-001, FR-SCHED-003).
- **No individual users:** one shared household sign-in (SRS 2.3).
- **Chat only:** no web page or app of its own, except a photo upload link if
  needed (TBD-006); no notifications outside the chat (FR-NOTIF-001).

### 2.6 Assumptions and dependencies

| ID | Assumption or dependency | Effect if false |
|---|---|---|
| A-1 | Each member's assistant has web search turned on. The admin turns it on as part of device setup. | Pricing falls back to for-sale prices more often (FR-PRICE-011). |

## 3. Functional requirements

Each requirement has a stable ID that is never reused. Priority is MoSCoW
(Must, Should, Could, Won't). Status is `Proposed` until the SRS is finalized.

### 3.1 Drafting from photos (FR-DRAFT)

Confirmed by Sobe 2026-11-26. One item per listing, one listing at a time.

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-DRAFT-001 | When a member sends one or more photos of an item, the system shall start drafting a listing for that item without requiring any typed text. | Must | G-1 |
| FR-DRAFT-002 | When a member sends a note with the photos, the system shall use the details in the note in the draft. | Must | Optional note, e.g. "size 10, worn twice". |
| FR-DRAFT-003 | When a member sends photos, the system shall identify the item's brand, model and distinguishing attributes from what the photos show, including any visible labels and tags. | Must | |
| FR-DRAFT-004 | When a detail that eBay requires for the item's category cannot be determined from the photos, the note or earlier answers, the system shall ask the member for that detail or for a photo that shows it. | Must | Ask only what is needed (G-1). |
| FR-DRAFT-005 | When the system needs more than one detail from the member, the system shall ask for all of them in a single message. | Must | Fewer round trips (G-1). |
| FR-DRAFT-006 | When the system has assessed the photos, the system shall propose a condition for the item and list each visible flaw it found. | Must | |
| FR-DRAFT-007 | When the system proposes a condition, the system shall ask the member to confirm it and shall present the other condition values eBay allows for the category. | Must | Sobe: assistant decides, member agrees or picks another. |
| FR-DRAFT-008 | While the member has not confirmed or chosen the condition, the system shall not schedule the listing. | Must | |
| FR-DRAFT-009 | When the item has been identified, the system shall choose its eBay category from eBay's category suggestions for the item. | Must | PoC question 7: Taxonomy suggestions work with an app token. |
| FR-DRAFT-010 | When the category has been chosen, the system shall give a value to every item specific eBay marks as required for that category. | Must | G-2 |
| FR-DRAFT-011 | When the category has been chosen, the system shall give a value to each item specific eBay recommends for that category whose value is known from the photos, the note or the member's answers. | Should | |
| FR-DRAFT-012 | When the draft's details are complete, the system shall write a title of no more than 80 characters that names the item's key identifying details. | Must | eBay title limit: 80 characters. |
| FR-DRAFT-013 | When the draft's details are complete, the system shall write a description that states the item's condition and every flaw identified. | Must | Honest listing; fewer returns. |
| FR-DRAFT-014 | If the system is not confident of a detail's value, then the system shall ask the member for it instead of filling it with a guess. | Must | Wrong details cause returns and disputes. |
| FR-DRAFT-015 | If the system cannot identify the item from the photos, then the system shall ask the member for the brand or model, or for a clearer photo of a label. | Must | |
| FR-DRAFT-016 | If the photos show more than one item, then the system shall ask the member whether to list them together as one lot or to list one of them. | Must | One listing at a time either way. |
| FR-DRAFT-017 | If the item appears to be prohibited or restricted on eBay, then the system shall tell the member why and shall not create a listing for it. | Must | For example alcohol, weapons, recalled goods. |

### 3.2 Pricing and auction terms (FR-PRICE)

Confirmed by Sobe 2026-11-26. The assistant sets the price on its own; the
member sees it and can change it, during drafting or the review window.
Settles TBD-002. Every listing is an auction (TBD-003). Sold comparables set
the **starting price**; Buy It Now is 30% above it (TBD-005). Where this table
says "the price", it means the starting price.

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-PRICE-001 | When the item and its condition have been determined, the system shall search for sold comparables: items of the same model, or the closest match, in similar condition. | Must | G-4 |
| FR-PRICE-002 | When the system selects sold comparables, the system shall use only items sold within the last 90 days. | Must | eBay sold history is about 90 days. |
| FR-PRICE-003 | When the system selects comparables, the system shall exclude lots, bundles with extras, and items sold for parts or not working, unless the item being listed is of the same kind. | Must | |
| FR-PRICE-004 | Where eBay has granted the application Marketplace Insights access, the system shall use eBay's sold-item data as its first source of sold comparables. | Could | Not granted today (TBD-002). Sobe applies separately. |
| FR-PRICE-005 | When eBay's sold-item data is unavailable or gives fewer than 3 sold comparables, the system shall search the web for sold prices of comparable items. | Must | The assistant's own web search (assumption A-1). |
| FR-PRICE-006 | When at least 3 sold comparables have been found, the system shall set the price from them, adjusted for the item's condition. | Must | "Enough" = 3 (Sobe, 2026-11-26). |
| FR-PRICE-007 | When the system has set the price, the system shall continue drafting without waiting for the member to confirm the price. | Must | Sobe: the 24-hour window is the price review (G-1). |
| FR-PRICE-008 | When the system has set the price, the system shall show the member the price it is using. | Must | Sobe, 2026-11-26. |
| FR-PRICE-009 | When the system shows the price, the system shall show its evidence: the number of comparables, their price range, and up to 5 examples, each with its price, sale date and source. | Must | Source matters for web results. |
| FR-PRICE-010 | When a member tells the system to change the starting price or the Buy It Now price, the system shall use the member's price in place of its own. | Must | During drafting; changes during the review window are in FR-LIST. |
| FR-PRICE-011 | If fewer than 3 sold comparables are found from all sources, then the system shall set the price from items currently for sale on eBay and shall tell the member that the price is based on asking prices, not sales. | Must | Browse API, app token (PoC question 7). |
| FR-PRICE-012 | If no comparables are found from any source, then the system shall ask the member for a price. | Must | The only case where pricing needs the member. |
| FR-PRICE-013 | The system shall create every listing without Best Offer. | Must | Sobe: no offers. |
| FR-PRICE-014 | When the system has set the price from comparables, the system shall use it as the auction's starting price. | Must | TBD-005, option 1. |
| FR-PRICE-015 | When the starting price is set or changed, the system shall set the Buy It Now price to the starting price plus 30%, rounded up to the next cent. | Must | eBay minimum gap is 30% in most categories. A member's own Buy It Now price (FR-PRICE-010) is kept until the starting price changes again. |
| FR-PRICE-016 | If a member's prices would put Buy It Now less than 30% above the starting price, then the system shall tell the member eBay's rule and propose the lowest Buy It Now price eBay allows. | Must | |
| FR-PRICE-017 | The system shall create every listing without a reserve price. | Must | Reserve option declined (TBD-005). |
| FR-PRICE-018 | The system shall create every auction with a duration of 10 days. | Must | Sobe, 2026-11-26. Cost of 10-day auctions: TBD-004. |

### 3.3 Photos (FR-PHOTO)

Confirmed by Sobe 2026-11-26. Once the listing exists on eBay and the member
confirms they are done, DraftMyListing deletes the draft and its photos; the
eBay listing is the source of truth from then on.

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-PHOTO-001 | The system shall use only photos supplied by the member in a listing. | Must | No web or stock images (PoC decision, 2026-11-10). |
| FR-PHOTO-002 | When a member supplies photos for a draft, the system shall upload every photo to the listing, up to 12 photos. | Must | Sobe, 2026-11-26: limit 12 (below eBay's maximum). |
| FR-PHOTO-003 | If a member supplies more than 12 photos for a draft, then the system shall tell the member and ask which photos to leave out. | Must | Added as the counterpart of FR-PHOTO-002. |
| FR-PHOTO-004 | When the photos have been uploaded, the system shall put the best overall photo first, as the main photo, and order the rest as front, back, labels and tags, then flaws. | Must | |
| FR-PHOTO-005 | When a member supplies a photo in a format eBay does not accept, such as iPhone HEIC, the system shall convert it to a format eBay accepts before uploading it. | Must | Open in the PoC (question 6). |
| FR-PHOTO-006 | If a photo's longest side is under 500 pixels, then the system shall ask the member for a larger photo. | Must | eBay minimum; confirm during design. |
| FR-PHOTO-007 | If a photo is blurry or too dark to show the item clearly, then the system shall ask the member to retake it. | Must | Sobe: retake, not just warn. |
| FR-PHOTO-008 | If a photo shows private information, such as a face, an address or personal documents, then the system shall point it out to the member before uploading the photo. | Must | |
| FR-PHOTO-009 | If a photo upload fails, then the system shall retry the upload. | Must | Retry limits: FR-ERR. |
| FR-PHOTO-010 | If a photo upload still fails after retrying, then the system shall tell the member which photo was not uploaded. | Must | |
| FR-PHOTO-011 | When the listing has been created on eBay, the system shall ask the member to confirm that they are done with the draft. | Must | Sobe, 2026-11-26. |
| FR-PHOTO-012 | When the member confirms they are done with the draft, the system shall delete the draft and every copy of its photos that DraftMyListing holds. | Must | Photos remain on eBay with the listing. Activity history is settled in FR-AUDIT. |
| FR-PHOTO-013 | While a listing exists on eBay, the system shall report its details from eBay, not from any copy DraftMyListing holds. | Must | eBay is the source of truth (PoC question 4). |
| FR-PHOTO-014 | If a member has not confirmed they are done with a draft 30 days after its listing was created on eBay, then the system shall delete all information and files related to that draft, including its photos. | Must | Sobe, 2026-11-26. |

### 3.4 Shipping, returns and payment terms (FR-TERMS)

Confirmed by Sobe 2026-11-26. These are household settings the admin sets
once; members are not asked about them per item.

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-TERMS-001 | The system shall let the household admin set the household's shipping and return settings: item location (postal code), shipping cost method, shipping service, handling time, return policy and international shipping. | Must | Defaults in FR-TERMS-002..006; values chosen at setup. |
| FR-TERMS-002 | When the system creates a listing, the system shall apply the household's shipping and return settings to it. | Must | No per-item questions (G-1). |
| FR-TERMS-003 | When the system creates a listing, the system shall use calculated shipping, so the buyer pays the postage for their location based on the package size and weight. | Must | Default (Sobe). |
| FR-TERMS-004 | When the system creates a listing, the system shall offer USPS Ground Advantage as its shipping service. | Must | Default (Sobe). |
| FR-TERMS-005 | When the system creates a listing, the system shall set a handling time of 3 business days. | Must | Default (Sobe). |
| FR-TERMS-006 | When the system creates a listing, the system shall accept returns within 30 days, with the buyer paying return shipping. | Must | Default (Sobe). |
| FR-TERMS-007 | When the system creates a listing, the system shall offer domestic shipping only. | Must | International off (Sobe). |
| FR-TERMS-008 | When the item has been identified, the system shall estimate the packed item's dimensions and weight. | Must | Needed for calculated shipping. The member can correct them during the review window (FR-LIST). |
| FR-TERMS-009 | If the item is too large or heavy for the household's shipping service, then the system shall ask the member how to handle it, such as local pickup only. | Must | |
| FR-TERMS-010 | The system shall leave payment collection to eBay and shall not ask the member for payment settings. | Must | eBay manages payments. |

### 3.5 Validation and scheduling (FR-SCHED)

Confirmed by Sobe 2026-11-26. Listings are created automatically once the
draft is complete; the review window is the check, and cancelling is safe.

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-SCHED-001 | When a draft is complete, the system shall validate it with eBay without creating a listing. | Must | eBay `VALIDATE` mode, set explicitly (PoC safety rule 2). |
| FR-SCHED-002 | When a draft passes eBay validation, the system shall create the listing on eBay without asking the member for confirmation. | Must | Sobe: automatic (G-1). |
| FR-SCHED-003 | When the system creates a listing, the system shall create it as a scheduled listing with a start time at least 24 hours in the future. | Must | Never created live (PoC safety rule 1; G-3). |
| FR-SCHED-004 | When the system sets a listing's start time, the system shall choose the earliest start time at least 24 hours away at which the 10-day auction ends at 10:00 p.m. US Eastern time. | Must | Sobe, 2026-11-26. Use Eastern time as observed on the end date (daylight saving aware). |
| FR-SCHED-005 | When the system has created a listing, the system shall tell the member its title, starting price, Buy It Now price, start and end times in the member's time zone, and a link to view it on eBay. | Must | |
| FR-SCHED-006 | When the system validates or creates a listing, the system shall tell the member eBay's fees for it, including fees that are zero or covered by a promotion. | Must | Sobe: always mention fees. PoC question 2 showed eBay returns fees at validation. |
| FR-SCHED-007 | If eBay rejects a draft during validation, then the system shall correct every problem it can resolve from the photos, the note and earlier answers, and validate again. | Must | |
| FR-SCHED-008 | If eBay rejects a draft for a problem the system cannot resolve, then the system shall ask the member about the specific detail eBay rejected. | Must | |
| FR-SCHED-009 | If eBay returns a warning when validating or creating a listing, then the system shall tell the member the warning and continue. | Must | For example `LSTNG_PAYMENTS_ON_HOLD` (PoC question 2). |
| FR-SCHED-010 | If eBay is unavailable or does not respond, then the system shall keep the draft and tell the member that it can be submitted again later. | Must | |
| FR-SCHED-011 | If the system repeats a listing creation request, then the system shall not create a second listing for the same draft. | Must | eBay idempotency key (PoC question 2). |

### 3.6 Managing scheduled listings (FR-LIST)

Confirmed by Sobe 2026-11-27. DraftMyListing manages listings only while they
are scheduled. Live listings are out of scope: they are never changed by
DraftMyListing and can only be changed directly on eBay.

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-LIST-001 | When a member asks for the household's scheduled listings, the system shall show every scheduled listing on the household's eBay account with its title, starting price, Buy It Now price, and start and end times. | Must | Revised 2026-11-27: no creating member (single-user model). |
| FR-LIST-002 | When a member asks to see a scheduled listing, the system shall read its current details from eBay and show them. | Must | Includes Seller Hub edits (PoC question 4). |
| FR-LIST-003 | When a member asks to change a scheduled listing's title, description, prices, item specifics, condition, or package size and weight, the system shall update the listing on eBay and keep its listing ID. | Must | `updateListing` keeps the ID (PoC question 5). Price rules: FR-PRICE-010, 015, 016. |
| FR-LIST-004 | When a member asks to add, remove or reorder a scheduled listing's photos, the system shall update the listing's photos on eBay, keeping at most 12. | Must | Photo rules: FR-PHOTO. |
| FR-LIST-005 | ~~The system shall let any member view, change or cancel any scheduled listing, whichever member created it.~~ | — | **Withdrawn 2026-11-27:** single-user model, so there is no per-member ownership. ID retired, not reused. |
| FR-LIST-006 | When a member asks to cancel a scheduled listing, the system shall ask the member to confirm the cancel before doing it. | Must | Sobe, 2026-11-27. A cancel cannot be undone. |
| FR-LIST-007 | When a member confirms a cancel, the system shall remove the scheduled listing from eBay without the listing ever becoming visible to buyers. | Must | G-3. The PoC showed removing the schedule starts the listing; a safe method must be proven in construction (PoC question 4). |
| FR-LIST-008 | When a cancel has completed, the system shall confirm from eBay that the listing is removed and never went live, and tell the member. | Must | |
| FR-LIST-009 | If eBay rejects a change to a scheduled listing, then the system shall tell the member eBay's reason and suggest a fix. | Must | |
| FR-LIST-010 | If a cancel fails, then the system shall tell the member at once, including how long until the listing goes live, and direct them to delete it in Seller Hub. | Must | |
| FR-LIST-011 | If a listing a member asks about no longer exists on eBay, then the system shall tell the member it has been removed, not report an error. | Must | For example deleted in Seller Hub. |
| FR-LIST-012 | If a member asks to change or cancel a listing that is live, then the system shall tell the member that live listings can only be changed on eBay directly. | Must | Sobe, 2026-11-27. |
| FR-LIST-013 | While a listing is live, the system shall not send any change or cancel request for it to eBay. | Must | Guard that holds even if the assistant asks. |

### 3.7 Assistant connection (FR-ASST)

Confirmed by Sobe 2026-11-27. Approach (Sobe): validate each assistant path as
it is built, and decide alternatives when a path fails. Members may use
either assistant.

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-ASST-001 | The system shall provide all of its features to members using Claude on the web, the desktop app and the phone app. | Must | Web and phone proven (PoC question 8). |
| FR-ASST-002 | The system shall provide all of its features to members using ChatGPT on the web and the phone app. | Must | Untested: TBD-001. |
| FR-ASST-003 | The system shall offer the same features through both assistants. | Must | A member may use either one. |
| FR-ASST-004 | When a member sends photos in the chat for a draft, the system shall receive each photo at its original quality. | Must | Unproven: TBD-006, with accepted fallbacks. |
| FR-ASST-005 | When a member asks for something the system can do but leaves out a detail the system needs, the system shall direct the assistant to ask the member for that detail instead of declining. | Must | PoC question 8: Claude declined over a missing price. |
| FR-ASST-006 | The system shall describe each of its tools in everyday terms that match how members ask for things. | Must | Tool descriptions steer whether the assistant uses a tool (PoC). Verified with sample member requests. |

### 3.8 Member sign-in (FR-AUTH)

Confirmed by Sobe 2026-11-27; revised the same day for the single-user model
(one shared household password, no member names). Builds on the PoC's
household sign-in (`src/mcp/household-auth.ts`). No two-step sign-in.

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-AUTH-001 | When an assistant connects to the system for the first time, the system shall show the household sign-in page and ask for the shared household password. | Must | Revised 2026-11-27: one shared sign-in, no member names. Once per assistant per device account (G-5). |
| FR-AUTH-002 | When the correct household password is entered, the system shall grant that assistant access to the system. | Must | |
| FR-AUTH-003 | If a request reaches the system without a valid sign-in, then the system shall refuse it without performing any action. | Must | HTTP 401 (PoC question 8, stage 2). |
| FR-AUTH-004 | While a member uses the system at least once every 30 days, the system shall keep that member signed in. | Must | Sobe: 30 days is right. PoC: 1-hour passes renewed by a 30-day rotating refresh. |
| FR-AUTH-005 | If a member has not used the system for more than 30 days, then the system shall require the member to sign in again. | Must | |
| FR-AUTH-006 | If a member's sign-in has expired, then the system shall direct the assistant to tell the member to reconnect, instead of reporting an error. | Must | |
| FR-AUTH-007 | When the household admin sets the household password, the system shall require it to be at least 12 characters. | Must | PoC minimum. |
| FR-AUTH-008 | The system shall store members' passwords only in hashed form. | Must | The PoC kept them readable in a settings file; acceptable for the test only. |
| FR-AUTH-009 | If 5 wrong passwords are entered on one sign-in page, then the system shall stop accepting sign-ins on that page and tell the member to connect again from the assistant. | Must | PoC behavior. |
| FR-AUTH-010 | If 10 wrong passwords are entered across all sign-in pages within 15 minutes, then the system shall refuse all sign-ins for 15 minutes. | Must | Revised 2026-11-27: no member names, so the limit is household-wide. Guessing protection from the internet. |
| FR-AUTH-011 | ~~When the system performs an action, the system shall record which assistant connection requested it.~~ | — | **Withdrawn 2026-11-27:** no activity history (FR-AUDIT). ID retired, not reused. |
| FR-AUTH-012 | The system shall not offer individual user accounts, self sign-up, password reset by email, or two-step sign-in. | Must | Sobe: single shared sign-in; the admin sets the password (FR-ADMIN); no two-step. |

### 3.9 Household admin (FR-ADMIN)

Confirmed by Sobe 2026-11-27. Mixed approach: viewing connections and changing
household settings happen in the assistant chat; changing the password and
signing everyone out are done by a command on the NAS, so the password never
passes through an assistant provider's servers. Because the sign-in is shared,
anyone signed in can use the chat-side admin tools; that is accepted for one
household.

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-ADMIN-001 | When the household admin runs the change-password command on the NAS, the system shall set the new household password and end every existing sign-in. | Must | Rules: FR-AUTH-007, 008. |
| FR-ADMIN-002 | When the household admin runs the sign-everyone-out command on the NAS, the system shall end every existing sign-in without changing the password. | Must | For example after a lost phone. |
| FR-ADMIN-003 | When a member asks in the assistant chat for the connected assistants, the system shall show each connection with its assistant and when it was last used. | Must | |
| FR-ADMIN-004 | When a member asks in the assistant chat to change a household setting, the system shall show the current and new values and apply the change after the member confirms it. | Must | Settings: FR-TERMS-001. Confirmation guards against a slip, since settings affect every later listing. |
| FR-ADMIN-005 | If a household setting change would give an invalid value, such as a postal code that does not exist, then the system shall reject the change and say why. | Must | |
| FR-ADMIN-006 | The system shall not change the household password or end sign-ins in response to a request made through an assistant. | Must | Those actions are NAS-only. |

### 3.10 eBay account connection (FR-EBAY)

Confirmed by Sobe 2026-11-27. Builds on the PoC's eBay OAuth lessons
(`docs/poc/ebay-listing-feasibility.md`, "eBay OAuth lessons").

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-EBAY-001 | When the household admin runs the connect-eBay command on the NAS, the system shall give the admin an eBay sign-in link for the household seller account. | Must | Authorization code flow; `redirect_uri` is the RuName (PoC). |
| FR-EBAY-002 | When eBay returns the admin to DraftMyListing after sign-in, the system shall verify the returned `state` and exchange the code for access automatically. | Must | The code expires in about 5 minutes; eBay's default return page loses it (PoC). |
| FR-EBAY-003 | When the system requests access from eBay, the system shall request only the scopes its features need. | Must | Listings, photo upload, reading business policies, and reading the account's username (EIR-SW-001..006). eBay's OAuth agreement requires the minimum scopes. |
| FR-EBAY-004 | When the eBay connection completes, the system shall check that the connected eBay username is the household seller account set by the admin, and report the result. | Must | |
| FR-EBAY-005 | While the eBay connection is valid, the system shall renew its short-lived eBay access automatically, without involving any member. | Must | Access tokens last 2 hours (PoC). |
| FR-EBAY-006 | While the eBay connection is within 30 days of expiring, the system shall tell the member in every conversation that uses DraftMyListing that the eBay connection must be renewed, and by what date. | Must | The refresh token lasts about 18 months (548 days, PoC). |
| FR-EBAY-007 | When the household admin reconnects the eBay account, the system shall replace the previous connection with the new one. | Must | Same flow as FR-EBAY-001..004. |
| FR-EBAY-008 | The system shall keep eBay keys and tokens only in protected storage on the NAS, and shall never show them in a conversation, a log or the code repository. | Must | PoC safety rule 4. |
| FR-EBAY-009 | If the eBay connection has expired or been revoked, then the system shall stop listing actions, keep any draft, and tell the member that the eBay connection needs to be reconnected. | Must | For example revoked in eBay account settings. |
| FR-EBAY-010 | If the eBay connection does not complete, such as an expired code or a `state` mismatch, then the system shall tell the admin why and that the connection must be started again. | Must | |
| FR-EBAY-011 | If the connected eBay username is not the household seller account, then the system shall refuse to use the connection and tell the admin. | Must | Counterpart of FR-EBAY-004. |

### 3.11 Notifications (FR-NOTIF)

Confirmed by Sobe 2026-11-27: report only in the chat. The assistants respond
only when someone is chatting, so problems surface at the next conversation.

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-NOTIF-001 | The system shall not send notifications outside the assistant conversation, such as email, text messages or push notifications. | Must | Sobe, 2026-11-27. |
| FR-NOTIF-002 | When a member first uses DraftMyListing in a conversation, the system shall report every unresolved problem it knows of, such as a failed cancel, a failed scheduled-listing change, or an eBay connection that has expired or expires within 30 days. | Must | Delivers FR-EBAY-006 and FR-LIST-010 at the next chat. |

### 3.12 Activity history (FR-AUDIT)

Confirmed by Sobe 2026-11-27: no activity history. The goal is to build a
listing quickly from a few photos; once the listing is live, its history does
not matter. Short-lived diagnostic logs for fixing faults are a separate,
non-functional matter (section 4, observability).

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-AUDIT-001 | The system shall not offer an activity history of listings, sign-ins or admin actions. | Must | Sobe, 2026-11-27. |
| FR-AUDIT-002 | When a draft is deleted, the system shall delete every record it holds about that draft and its listing. | Must | Applies to FR-PHOTO-012 and FR-PHOTO-014. eBay keeps its own records. |

### 3.13 Errors and limits (FR-ERR)

Confirmed by Sobe 2026-11-27.

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-ERR-001 | If an eBay request fails with a temporary error, then the system shall retry it up to 3 times, waiting longer before each retry, before reporting the failure. | Must | Used by FR-PHOTO-009 and FR-SCHED-010. |
| FR-ERR-002 | When the system reports a failure to a member, the system shall say in plain words what went wrong and what the member can do next, without exposing keys, tokens or passwords. | Must | Never a bare error code. |
| FR-ERR-003 | If a step of creating a listing fails after earlier steps succeeded, then the system shall keep the draft and the completed steps so that a retry continues from the failed step without duplicating anything. | Must | For example photos uploaded but listing not created. FR-SCHED-011 prevents duplicate listings. |
| FR-ERR-004 | If an unexpected fault occurs, then the system shall tell the member that something went wrong, keep the draft, and log enough detail for the admin to diagnose it. | Must | Log contents and retention: section 4 (observability). |
| FR-ERR-005 | If eBay reports that the application has reached an eBay call limit, then the system shall tell the member to try again later and when the limit resets, if eBay says. | Must | |
| FR-ERR-006 | If one assistant connection sends more than 60 requests in a minute, then the system shall refuse its further requests for the rest of that minute. | Must | Catches an assistant stuck in a loop. |
| FR-ERR-007 | If 20 listings have already been created on the current day (US Eastern time), then the system shall refuse to create another listing that day and tell the member the daily limit was reached. | Must | Sobe: 20 a day. Cancelled listings still count. |

## 4. Non-functional requirements

Confirmed by Sobe 2026-11-27. Each states a metric, target and condition.

| ID | Category | Requirement | Measured by |
|---|---|---|---|
| NFR-PERF-001 | Performance | 95% of DraftMyListing tool calls shall respond within 5 seconds, excluding time spent waiting on eBay. | Server timing logs over a week of normal use. |
| NFR-PERF-002 | Performance | Each photo shall upload to eBay within 15 seconds on the household's internet connection. | Timed uploads of 12-megapixel phone photos. |
| NFR-PERF-003 | Performance | 95% of listings shall be scheduled on eBay within 2 minutes of the member's last answer. | Server timing logs. |
| NFR-CAP-001 | Capacity | The system shall support 3 people, up to 3 conversations at once, and up to 20 listings a day. No larger scale is required. | Load test at 3 concurrent conversations. |
| NFR-REL-001 | Reliability | No uptime target (home NAS). After a NAS reboot or a crash, the service shall restart by itself within 5 minutes. | Reboot test. |
| NFR-REL-002 | Reliability | Drafts in progress shall survive a service restart. | Restart during a draft, then resume it. |
| NFR-REL-003 | Reliability | No backups are required: drafts are temporary, and settings and the eBay connection can be re-created. | — |
| NFR-SEC-001 | Security | All traffic from the internet shall use HTTPS. | Plain HTTP refused or redirected. |
| NFR-SEC-002 | Security | Only the MCP endpoint, the sign-in page, the eBay return page and, if used, the photo upload link shall be reachable from the internet; the NAS's own management shall not be. | External port and path scan. |
| NFR-SEC-003 | Security | Known high or critical vulnerabilities in the software the service depends on shall be fixed within 30 days of a fix being available. | `npm audit` and image scan on each release. |
| NFR-USE-001 | Usability | A first-time member shall complete a listing from photos with no instructions beyond device setup. | Observed first use by each household member. |
| NFR-COMP-001 | Compatibility | The system shall work with the current versions of Claude (web, desktop, phone apps) and ChatGPT (web, phone apps), and accept photos in JPEG, PNG and HEIC. | Acceptance test per assistant and device type. |
| NFR-MAINT-001 | Maintainability | Every change shall pass the project checks (format, lint, type check, tests) before merging. | `npm run check`. |
| NFR-MAINT-002 | Maintainability | eBay behavior shall be tested against recorded eBay responses; tests against live eBay shall follow the PoC safety rules. | Test suite review. |
| NFR-PORT-001 | Portability | The service shall run in Docker on the household's Synology NAS. | Deployed and running on the NAS. |
| NFR-COMPL-001 | Compliance | The system shall follow eBay's API License Agreement and developer program policies, and shall not scrape eBay. | Review against eBay's terms before release. |
| NFR-COMPL-002 | Cost | The system shall use no paid services; the only costs shall be eBay's own fees. | Running-cost review. |
| NFR-L10N-001 | Localization | The system shall support English, US dollars and the eBay US marketplace only. | — |
| NFR-L10N-002 | Localization | Times shown to members shall be in the member's time zone; auctions end at 10 p.m. US Eastern (FR-SCHED-004). | Acceptance test from two time zones. |
| NFR-OBS-001 | Observability | The service shall keep a technical log of errors and request outcomes for 14 days, containing no passwords, tokens, photos or conversation text. | Log review; age check. |
| NFR-OBS-002 | Observability | A health check run on the NAS shall report whether the service is running and whether the eBay connection is valid. | Run with the connection valid and expired. |

## 5. External interface requirements

Confirmed by Sobe 2026-11-27. Requirements level only; contracts are designed
downstream.

### 5.1 User interfaces

| ID | Interface | Requirement |
|---|---|---|
| EIR-UI-001 | Assistant chat | All member interaction happens in the Claude or ChatGPT conversation. DraftMyListing has no app of its own. |
| EIR-UI-002 | Household sign-in page | A web page, usable on a phone, that asks for the shared household password (FR-AUTH-001). |
| EIR-UI-003 | eBay return page | The page eBay returns the admin to; it states whether the eBay connection succeeded and, if not, why (FR-EBAY-002, FR-EBAY-010). |
| EIR-UI-004 | Photo upload page | Only if photos cannot pass from the chat (TBD-006): a one-time link that lets a member pick photos from their phone or PC. |

### 5.2 Hardware interfaces

| ID | Interface | Requirement |
|---|---|---|
| EIR-HW-001 | Synology NAS | Hosts the service in Docker (NFR-PORT-001). |
| EIR-HW-002 | Members' phones and PCs | Take and supply photos through the assistant; no device-specific software beyond the assistant. |

### 5.3 Software interfaces

| ID | System | Used for | Access |
|---|---|---|---|
| EIR-SW-001 | eBay GraphQL Listing API | Validate, create, update and read scheduled listings | User token, `sell.listing`, `sell.listing.read` (PoC questions 2, 3, 5) |
| EIR-SW-002 | eBay Media API | Upload photos | User token, `sell.inventory` (PoC question 6) |
| EIR-SW-003 | eBay Taxonomy API | Category suggestions; required and recommended item specifics | Application token (PoC question 7) |
| EIR-SW-004 | eBay Browse API | Items currently for sale (pricing fallback) | Application token (PoC question 7) |
| EIR-SW-005 | eBay Account API | Read shipping, return and payment business policies | User token, `sell.account.readonly` |
| EIR-SW-006 | eBay Identity API | Read the connected eBay username (FR-EBAY-004) | User token, `commerce.identity.readonly` (in the production scope list, 2026-11-26) |
| EIR-SW-007 | eBay Marketplace Insights API | Sold-item data, only if eBay grants access (FR-PRICE-004) | Application token, `buy.marketplace.insights` (not granted) |
| EIR-SW-008 | eBay cancel of a scheduled listing | Safe cancel (FR-LIST-007) | Method to be proven in construction (PoC question 4) |
| EIR-SW-009 | eBay OAuth | Seller account connection and application tokens | Authorization code flow with RuName; client credentials (PoC) |
| EIR-SW-010 | Claude and ChatGPT | Members' assistants; call DraftMyListing's tools | MCP over HTTPS with OAuth sign-in (PoC question 8) |
| EIR-SW-011 | Assistants' web search | Sold-price research (FR-PRICE-005) | Assistant feature, turned on at setup (A-1) |

### 5.4 Communications interfaces

| ID | Interface | Requirement |
|---|---|---|
| EIR-COM-001 | MCP | Streamable HTTP over HTTPS at a public address, since both assistants call from their own cloud (PoC question 8). |
| EIR-COM-002 | Assistant sign-in | OAuth with dynamic client registration and PKCE, as built in the PoC (`src/mcp/household-auth.ts`). |
| EIR-COM-003 | eBay | HTTPS to eBay's production API hosts. |

## 6. Open questions and risks

| ID | Question or risk | Raised | Status |
|---|---|---|---|
| TBD-001 | ChatGPT custom MCP connector support, especially in its phone app, is untested (PoC question 8). It is a stated must-have. Sobe (2026-11-27): validate during the build; members may use either assistant, so a ChatGPT gap on one device can be covered by Claude there. | 2026-11-22 (PoC) | Open |
| TBD-002 | Source of **sold**-item prices. Sobe (2026-11-26): the price comes from the assistant's research on similar items that have **sold**. eBay's sold-price API (Marketplace Insights) is limited release and granted per application. Checked 2026-11-26: neither the production keyset's Authorization Code scopes nor its Client Credentials scopes (only `api_scope` and `commerce.feedback.readonly`) include `buy.marketplace.insights`, matching the PoC's `invalid_scope` (question 7). **Decided (Sobe, 2026-11-26):** sold comparables from whatever the assistant can reach, with a clearly labeled fallback to for-sale prices (eBay Browse) when sold data is not enough; Sobe applies to eBay for Marketplace Insights access separately. Specified in FR-PRICE. | 2026-11-26 | Resolved 2026-11-26 |
| TBD-003 | Listing format. Scope (1.2) first said fixed price only. **Decided (Sobe, 2026-11-26): every listing is an auction**; fixed-price-only listings are out. Scope updated. | 2026-11-26 | Resolved 2026-11-26 |
| TBD-004 | Auctions were not tested in the PoC, which used fixed-price listings only. Unproven: that the GraphQL `createListing` API creates a **scheduled** auction, validates it, and lets it be edited and safely cancelled, and what scheduling an auction, and a 10-day duration, cost. Retire during architecture or construction, before relying on auctions. | 2026-11-26 | Open |
| TBD-005 | Buy It Now price. Sobe (2026-11-26): the fixed price is 20% above the minimum auction price. eBay requires an auction's Buy It Now price to be **at least 30%** above its starting price (eBay help, checked 2026-11-26), so 20% above the starting price would be rejected. **Decided (Sobe, 2026-11-26):** sold comparables set the starting price; Buy It Now is 30% above it; no reserve. Specified in FR-PRICE-014..017. | 2026-11-26 | Resolved 2026-11-26 |
| TBD-006 | **Photo path from chat to DraftMyListing (high risk).** The PoC uploaded photos from disk and tested assistants with text only. Unproven: that Claude and ChatGPT can pass the member's chat photos, at full quality, to a DraftMyListing tool. **Fallbacks accepted by Sobe (2026-11-27):** a one-time upload link the assistant gives the member, or the member adds photos on eBay directly. Caveat: eBay rejected a listing with too few images (`LSTNG_IMAGE_URLS_TOO_LOW`, PoC question 2), so adding photos only on eBay may require the listing to carry at least one photo first. Test before design is settled. | 2026-11-27 | Open |
