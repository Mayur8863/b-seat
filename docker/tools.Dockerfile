# Dev toolbox: Node 22 LTS + pnpm (via corepack) + git.
# Used for every host-side command (install, lint, test, codegen) so the host
# only needs Docker. Runs as the image's `node` user (uid 1000).
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates openssh-client curl \
  && rm -rf /var/lib/apt/lists/*

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_HOME=/home/node/.local/share/pnpm \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable \
  && mkdir -p /home/node/.local/share/pnpm/store /home/node/.cache/node/corepack /workspace \
  && chown -R node:node /home/node /workspace \
  && git config --system --add safe.directory "*"

USER node
WORKDIR /workspace
