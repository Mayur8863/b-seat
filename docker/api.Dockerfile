# syntax=docker/dockerfile:1
# Production image for apps/api. Build from the repo root:
#   docker build -f docker/api.Dockerfile -t bseat-api .
# Run migrations as a one-off:  docker run --rm -e DATABASE_URL=... bseat-api node dist/db/migrate.js

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm COREPACK_ENABLE_DOWNLOAD_PROMPT=0 TURBO_TELEMETRY_DISABLED=1
# No git in the image: skip lefthook's git-hook installation during pnpm install.
ENV LEFTHOOK=0
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@bseat/api
# Self-contained package with production dependencies only.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter=@bseat/api deploy --prod /out

FROM node:22-bookworm-slim AS runtime
# The runtime never runs a package manager: removing the bundled npm/corepack/yarn
# drops their transitive CVEs and attack surface.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
    /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
ENV NODE_ENV=production API_PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
