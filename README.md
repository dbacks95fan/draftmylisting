# DraftMyListing

Turns a few photos into a scheduled eBay auction, from a chat with Claude or
ChatGPT. A custom MCP server for one household, hosted on a Synology NAS.

**Status:** walking skeleton. Sign-in and a `check_photo` test tool work end to
end; listing features come next (see
[`docs/implementation-plan.md`](docs/implementation-plan.md)).

## Run it locally

Needs Node 24 and npm.

```sh
npm ci
npm run check          # format, lint, type check, tests
```

To start the server, create a settings file outside the repo from
[`.env.example`](.env.example) (at least `DRAFTMYLISTING_PUBLIC_URL`,
`DRAFTMYLISTING_HOUSEHOLD_PASSWORD`, `DRAFTMYLISTING_DATA_DIR`), then:

```sh
DRAFTMYLISTING_ENV_FILE=/path/to/runtime.env npm start
```

The MCP endpoint is `<public URL>/mcp`. `npm run dml -- health` checks a running
server and the eBay connection.

## Run it on the NAS

`docker-compose.yml` and the `Dockerfile` build and run one container with host
networking behind DSM's reverse proxy. Set `DRAFTMYLISTING_DATA_HOST_DIR` and
`DRAFTMYLISTING_ENV_HOST_FILE`, then `docker-compose up -d --build`. Admin
commands: `docker exec draftmylisting dml health`.

## Documents

Requirements, architecture, UX and the plan are in [`docs/`](docs/); start with
[`AGENTS.md`](AGENTS.md) for the map.

## License

MIT, © DPSystems, LLC. See [`LICENSE`](LICENSE).
