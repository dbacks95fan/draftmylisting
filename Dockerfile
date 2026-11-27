# Copyright (c) 2026 DPSystems, LLC.
# The DraftMyListing server image (architecture ADR-001): one container that runs the
# server and carries the dml admin CLI. Node 24 runs the TypeScript sources directly.

FROM node:24.22.3-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY src ./src
COPY docs/tokens.json ./docs/tokens.json
COPY docker/dml /usr/local/bin/dml

# Runs as the image's unprivileged node user; the data folder must be writable by it.
USER node

HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.DRAFTMYLISTING_HEALTH_PORT || 8431) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "src/server.ts"]
