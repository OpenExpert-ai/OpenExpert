# SPDX-License-Identifier: MIT
# Multi-stage Dockerfile for the OpenExpert local edition.
# Stage 1: install dependencies and build the app and the OpenCore package.
# Stage 2: minimal runtime image running Nitro's node-server preset.

ARG NODE_VERSION=20

# --- builder -------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS builder

WORKDIR /app

# Native deps for some packages (rollup, esbuild) — kept in the builder
# stage only.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 build-essential ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY packages/opencore/package.json ./packages/opencore/package.json

# Install the full dependency tree. --ignore-scripts avoids running
# postinstall scripts in the deps tree that may rely on a network.
RUN npm ci --ignore-scripts

# Copy the rest of the source.
COPY tsconfig.json vite.config.ts drizzle.config.ts ./
COPY src ./src
COPY public ./public
COPY packages/opencore ./packages/opencore
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY .changeset ./.changeset

ENV OPENEXPERT_MODE=local
ENV NODE_ENV=production

# Build the OpenCore package, then the application.
RUN npm run build --workspace @openexpert/opencore \
 && OPENEXPERT_MODE=local npm run build

# Prune devDependencies for the runtime stage.
RUN npm prune --omit=dev --ignore-scripts

# --- runtime -------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    OPENEXPERT_MODE=local \
    OPENEXPERT_DATA_DIR=/data \
    PORT=3000

# Tini for clean signal propagation and a non-root user for safety.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 1000 openexpert \
 && useradd --uid 1000 --gid 1000 --create-home --shell /bin/bash openexpert

# Copy the built application and the runtime node_modules.
COPY --from=builder --chown=openexpert:openexpert /app/.output /app/.output
COPY --from=builder --chown=openexpert:openexpert /app/node_modules /app/node_modules
COPY --from=builder --chown=openexpert:openexpert /app/packages/opencore /app/packages/opencore
COPY --from=builder --chown=openexpert:openexpert /app/package.json /app/package.json

# Persistent volume for OpenExpert local data and credentials.
RUN mkdir -p /data && chown openexpert:openexpert /data
VOLUME ["/data"]
USER openexpert

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/auth || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
# node-server Nitro preset exposes server entrypoint at .output/server/index.mjs
CMD ["node", ".output/server/index.mjs"]