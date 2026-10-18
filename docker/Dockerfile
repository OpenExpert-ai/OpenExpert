# SPDX-License-Identifier: MIT
# Multi-stage Dockerfile for the OpenExpert local edition.
# Stage 1: install dependencies and build the app and the OpenExpert package.
# Stage 2: minimal runtime image running Nitro's node-server preset.

# Base image pinned by digest, on purpose and in both stages: the tag alone can
# move under the build and pull a different image. The digest below is the
# multi-arch manifest list that `24-bookworm-slim` resolves to (checked against
# the registry and pulled locally); Dependabot's docker ecosystem opens a PR
# when it moves.

# --- builder -------------------------------------------------------------
FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS builder

WORKDIR /app

# Native deps for some packages (rollup, esbuild) — kept in the builder
# stage only.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 build-essential ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
# The workspace manifests and the OpenExpert sources must be present before
# `npm ci`: npm runs the workspace `prepare` (tsup) even with
# --ignore-scripts, and tsup needs its input files.
COPY packages/openexpert ./packages/openexpert
COPY packages/create-openexpert ./packages/create-openexpert

# Install the full dependency tree.
RUN npm ci --ignore-scripts

# Copy the rest of the source.
COPY tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY .changeset ./.changeset

ENV NODE_ENV=production

# Build the OpenExpert package, then the application.
RUN npm run build --workspace @openexpert/openexpert \
 && npm run build

# Prune devDependencies for the runtime stage.
RUN npm prune --omit=dev --ignore-scripts

# --- runtime -------------------------------------------------------------
FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    OPENEXPERT_DATA_DIR=/data \
    PORT=3000

# Tini for clean signal propagation and a non-root user for safety.
# The official node image already owns uid/gid 1000 (`node`), so use 1001.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 1001 openexpert \
 && useradd --uid 1001 --gid 1001 --create-home --shell /bin/bash openexpert

# Copy the built application and the runtime node_modules.
COPY --from=builder --chown=openexpert:openexpert /app/.output /app/.output
COPY --from=builder --chown=openexpert:openexpert /app/node_modules /app/node_modules
COPY --from=builder --chown=openexpert:openexpert /app/packages/openexpert /app/packages/openexpert
COPY --from=builder --chown=openexpert:openexpert /app/package.json /app/package.json

# Persistent volume for OpenExpert local data and credentials.
RUN mkdir -p /data && chown openexpert:openexpert /data
VOLUME ["/data"]
USER openexpert

EXPOSE 3000

# Healthcheck without wget/curl: the runtime image only ships node.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
# node-server Nitro preset exposes server entrypoint at .output/server/index.mjs
CMD ["node", ".output/server/index.mjs"]