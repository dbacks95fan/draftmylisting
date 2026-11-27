# Scaffold Notes

> Project-owned record of how the walking skeleton was built · 2026-11-27

## Generators

None. There is no official project generator for a plain Node + TypeScript
server, and the repo already had its TypeScript, Prettier, ESLint and
`node:test` setup from the PoC (TypeScript 6.0.3, ESLint 10.13.0,
typescript-eslint 8.72.1, Prettier 3.9.10, MCP SDK 1.32.2, Express 5.2.1). The
skeleton extends that setup by hand, following architecture §5.2. No
dependency was added or upgraded.

## Environment used

- Node 24.22.3 (`nodejs-24` from the DHI apt repository), npm 11.21.3 (`npm`
  from the same repository; the Node package ships without npm).
- Sandbox lint tools from Debian: shellcheck, shfmt, yamllint.

## Commands

| Purpose | Command |
|---|---|
| Install | `npm ci` |
| All checks | `npm run check` |
| Tests | `npm test` (unit + `test/e2e/skeleton.test.ts`) |
| Coverage (report-only) | `npm run coverage` |
| Run | `DRAFTMYLISTING_ENV_FILE=… npm start` |
| Health | `npm run dml -- health`, or `docker exec draftmylisting dml health` |
| Container | `docker-compose up -d --build` / `docker-compose down` |

The end-to-end test needs no local stack: it starts the app on a random
loopback port with a fresh temporary data folder (embedded SQLite) and deletes
it afterwards. That is its cold start.

## What's real and what's stubbed

**Real:** settings from the environment and settings file; SQLite store with
migration 001 (`photo_probes`); OAuth sign-in with the PoC provider and the
SCR-WEB-001 page styled from `tokens.json`; the MCP endpoint with
`check_photo`; JSON logs to stdout and daily files, including the MCP method on
every 4xx (R-8); the loopback-only health endpoint; `dml health` (server plus a
real eBay token renewal); the ESLint eBay boundary; Dockerfile, compose file
and CI workflow.

**Stubbed or deferred:**
- Drafting, pricing, listing, settings and problems tools: later features.
- Sign-in is the PoC provider: in-memory passes (a restart signs everyone out)
  and the password read from the settings file. Hashing, persistence and the
  household-wide guessing limit are FEAT-002.
- **Deviation from the plan:** the plan's skeleton listed `dml connect-ebay`
  "working as in the PoC", but the PoC never built a connect command; its eBay
  refresh token was obtained by hand and kept in the settings file. The
  skeleton uses that token as-is. `dml connect-ebay` and the eBay return page
  (SCR-WEB-002) move wholly into FEAT-003, where the plan already places the
  connection lifecycle.
- `photo_probes` exists only for risk check WS-3; drop it in a later migration
  once WS-3 is recorded.
- The 14-day log pruning job is not built yet (`jobs` module, with FEAT-008).

## Decisions made while scaffolding

- **Health check on its own loopback port** (8431), not a path on the public
  app: DSM's reverse proxy forwards whole hostnames, so a path on the public
  port would be reachable from outside (NFR-SEC-002).
- **The sign-in page asks for the password only;** the PoC provider still needs
  an identity, so the app signs in as the fixed identity `household`
  (single-user model, SRS 2.3).
- **`design.md` variable names corrected** to the names generated from
  `tokens.json` (`--font-family-sans`, `--font-line-height-*`). A test now fails
  if the pages use a variable that `tokens.json` doesn't define.
- **MCP request body limit 40 MB**, so a full-resolution photo can arrive
  base64-encoded; `check_photo` caps a photo at 25 MB.
- yamllint's `truthy` rule is suppressed for one line, GitHub Actions' `on:`
  key, where it is provably wrong.
- **`version: "3.8"` stays in `docker-compose.yml`** although Docker Compose v2
  warns it is obsolete: the NAS runs standalone docker-compose 1.28, which
  reads a file without `version` as the legacy v1 format.
- **Docker's health check runs `dml ping`** (server only), not `dml health`: it
  reads the same settings as the server, so it finds a non-default health port,
  and an eBay outage doesn't flag the container unhealthy.
- **`docker/dml` is made executable in the Dockerfile** as well as in git: the
  repo has `core.filemode=false` (Windows host), so checkouts may drop the bit.
- **`node_modules` can't be installed from the sandbox into the shared folder**:
  it refuses symbolic links, which npm uses for `.bin` on Linux. Install on the
  Windows side (`npm ci`), or verify in a clone on local disk, as done here.

## Verification status (2026-11-27, fresh clone on sandbox disk)

- Clean install `npm ci`: ok. `npm run check`: Prettier, ESLint, `tsc`, 61/61
  tests pass. `npm audit --omit=dev`: 0 vulnerabilities (dev-only `minimatch`
  advisory accepted in the PoC). `npm run coverage`: report generates (92.6%
  lines).
- Local server run: public `/healthz` 404; loopback health ok; unsigned `/mcp`
  401; OAuth metadata served; `dml health` correct; server stopped by its PID.
- Container: image builds on `node:24.22.3-slim`; cold start with an empty data
  folder creates the database; survives `docker restart` with migrations
  intact; Docker health `healthy`; `dml` works inside; container removed after.
- hadolint v2.12.0, actionlint 1.7.7, yamllint (defaults, strict), shellcheck,
  shfmt: clean. `docker compose config` validates.
- Boundary rule seen failing on a forbidden import, then passing.
- Sandbox firewall approvals used: `registry.npmjs.org`, `registry-1.docker.io`,
  `auth.docker.io`, `production.cloudflare.docker.com`,
  `production.cloudfront.docker.com`.

**Pending:**
- **The deployed half of the done-when is pending initial deployment:** running
  on the NAS behind DSM's reverse proxy, restarting after a reboot, and risk
  checks WS-1 to WS-6. Each NAS change and each live eBay call needs Sobe's
  go-ahead.
