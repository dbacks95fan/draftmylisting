# AGENTS.md — DraftMyListing

Project instructions for AI coding agents. They extend the owner's global
AGENTS.md; where they conflict, the nearer file wins, but flag the conflict.

## What this is

A custom MCP server on the household's Synology NAS, between Claude/ChatGPT and
eBay's API: a member sends photos, and it schedules a complete 10-day eBay
auction under fixed safety rules. Read these before changing behavior:

- [`docs/srs.md`](docs/srs.md): requirements (source of truth; IDs are permanent)
- [`docs/use-cases.md`](docs/use-cases.md) and [`docs/rtm.md`](docs/rtm.md)
- [`docs/architecture.md`](docs/architecture.md): structure and ADRs
- [`docs/ux-foundations.md`](docs/ux-foundations.md): chat moments (SCR-CHAT) and pages (SCR-WEB)
- [`docs/design.md`](docs/design.md) + [`docs/tokens.json`](docs/tokens.json): load before building any page; `tokens.json` is the value source
- [`docs/implementation-plan.md`](docs/implementation-plan.md): features (FEAT-NNN) and build order
- [`docs/scaffold-notes.md`](docs/scaffold-notes.md): how the skeleton was built and what's stubbed

## Commands

| Command | Does |
|---|---|
| `npm ci` | Install exactly what the lock file says |
| `npm run check` | Prettier check, ESLint, `tsc --noEmit`, all tests. Must pass before any commit |
| `npm test` | Unit, integration and end-to-end tests (`node:test`) |
| `npm run coverage` | Tests with a coverage report (report-only, ADR-011) |
| `npm start` | Run the server (needs the settings in `.env.example`) |
| `npm run dml -- health` | Admin health check against a running server |

Node 24 runs the `.ts` files directly; there is no build step.

## Rules that protect money and the account

- **Only `src/ebay/` calls eBay.** Everything else uses `src/ebay/gateway.ts`.
  ESLint enforces this (ADR-004). Never weaken the rule.
- **Every listing create carries a start at least 24 hours out, and every
  validation sets `VALIDATE` explicitly.** eBay's default creates a live listing.
- **Never change or cancel a live listing** (FR-LIST-013).
- **Live eBay calls need Sobe's OK each time**, and every test listing is removed
  before its start (PoC safety rules).
- **Deploying, restarting containers, or changing the NAS or its reverse proxy
  needs Sobe's explicit go-ahead.**

## Conventions

- Modules are folders under `src/` matching architecture §5.2.
- Every source file starts with `// Copyright (c) <year> DPSystems, LLC.` and a
  purpose comment.
- Settings come from the environment or the settings file named by
  `DRAFTMYLISTING_ENV_FILE`; never hard-code hosts, ports or secrets. Real
  settings files live outside the repo.
- Logs are JSON lines with facts only: never passwords, tokens, photos or chat
  text.
- The repo is **public**: never commit the NAS address, emails or account names.
- Database changes are new numbered migrations in `src/store/db.ts`; never edit
  a shipped one.
- Tests use recorded eBay responses; tool descriptions are tested with real
  member phrasing (FR-ASST-006).
