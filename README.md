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

## Deploy to the NAS

From the Windows workstation, with the NAS SSH key at `%USERPROFILE%\.ssh\nas_key`
(the same key and `DockerDeploy` user as job-agent, SSH port 7070):

1. **Settings file.** Copy [`.env.example`](.env.example) to a file **outside the
   repo**, for example `C:\Repos\.config\draftmylisting\runtime.env`, and fill in
   at least `DRAFTMYLISTING_PUBLIC_URL` (the `https://…:1519` address from step 3),
   `DRAFTMYLISTING_HOUSEHOLD_PASSWORD` (12+ characters) and the `EBAY_*`
   production keys. Leave `DRAFTMYLISTING_DATA_DIR` empty; the container sets it.
2. **Deploy** the committed code, uploading the settings the first time or
   whenever they change:

   ```powershell
   .\scripts\deploy-synology.ps1 -NasHost <nas-address> -SettingsFile C:\Repos\.config\draftmylisting\runtime.env
   .\scripts\deploy-synology.ps1 -NasHost <nas-address>      # later deploys
   ```

   `$env:DRAFTMYLISTING_NAS_HOST` can stand in for `-NasHost`. The NAS side
   ([`scripts/install-on-nas.sh`](scripts/install-on-nas.sh)) checks the
   settings before changing anything, puts the code in
   `/volume2/docker/draftmylisting`, keeps data in
   `/volume2/docker/draftmylisting-data` and settings in
   `/volume2/docker/draftmylisting-config` (both owner-only), starts the
   container as the deploy user and waits for its health check.
3. **Public address (once, in DSM).** Control Panel → Login Portal → Advanced →
   Reverse Proxy → Create: source `HTTPS`, a new subdomain on your DDNS domain,
   port `1519`; destination `HTTP`, `localhost`, port `8430`. Assign a
   certificate that covers the subdomain. Do **not** proxy port 8431: that is the
   private health check.

Admin commands on the NAS: `sudo docker exec draftmylisting dml health`.

## Documents

Requirements, architecture, UX and the plan are in [`docs/`](docs/); start with
[`AGENTS.md`](AGENTS.md) for the map.

## License

MIT, © DPSystems, LLC. See [`LICENSE`](LICENSE).
