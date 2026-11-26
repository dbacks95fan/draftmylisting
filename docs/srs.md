# DraftMyListing — Software Requirements Specification

> Version: 0.1 (draft, in progress) · Requirement syntax: _TBD (chosen at end of Phase 1)_ ·
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

_Pending (Phase 1)._

### 1.3 Definitions, acronyms and abbreviations

_Pending._

### 1.4 References

- [eBay listing feasibility PoC](poc/ebay-listing-feasibility.md) (closed 2026-11-22)

## 2. Overall description

### 2.1 Product perspective

_Pending (Phase 1)._

### 2.2 Goals and success metrics

Confirmed by Sobe 2026-11-26.

| ID | Goal | Success metric |
|---|---|---|
| G-1 | **Least possible effort per listing.** Ideally a member only takes a few photos and answers a few clarifying questions; the assistant works out the rest from the photos. The less the member has to do, the better. | A member spends about **5 minutes** of their own time from first photo to a scheduled, complete listing. |
| G-2 | **Listings eBay accepts the first time.** | At least **95%** of listings pass eBay's validation on the first attempt, with every required item specific filled. |
| G-3 | **Nothing goes live by surprise.** | **Zero** listings start without the full 24-hour review window, including through a cancel (the PoC's cancel started a listing early: question 4). |
| G-4 | **Realistic prices.** The price comes from the assistant's research on similar items that have **sold**. | Every suggested price cites the sold comparables it is based on. Source of sold data: TBD-002. |
| G-5 | **Anyone in the household can use it** from their own phone or PC. | One sign-in per member; works from phone and PC in each supported assistant. |

### 2.3 Stakeholders and user classes

_Pending (Phase 1)._

### 2.4 Operating environment

_Pending._

### 2.5 Constraints

_Pending._

### 2.6 Assumptions and dependencies

_Pending._

## 3. Functional requirements

_Pending (Phase 2)._

## 4. Non-functional requirements

_Pending (Phase 3)._

## 5. External interface requirements

_Pending (Phase 4)._

## 6. Open questions and risks

| ID | Question or risk | Raised | Status |
|---|---|---|---|
| TBD-001 | ChatGPT custom MCP connector support, especially in its phone app, is untested (PoC question 8). It is a stated must-have. | 2026-11-22 (PoC) | Open |
| TBD-002 | Source of **sold**-item prices. Sobe (2026-11-26): the price comes from the assistant's research on similar items that have **sold**, giving a realistic price. The PoC (question 7) found eBay's sold-price API (Marketplace Insights) refused to our production keyset; it is limited release and needs an application to eBay. Options to settle in the pricing area: apply to eBay for access, have the assistant research sold listings on the web itself, or use another sold-price source. | 2026-11-26 | Open |
