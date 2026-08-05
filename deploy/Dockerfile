# Builds either portal from the monorepo root.
#
#   docker build -f deploy/Dockerfile --build-arg APP=portal -t stackd-portal .
#
# One Dockerfile for both apps because the only difference is which workspace
# gets built and which port it listens on. Two near-identical files would drift.
#
# Build context is the REPO ROOT, not this folder — the workspace packages
# (@stackd/server, @stackd/shared) live outside each app and the build needs them.

ARG NODE_VERSION=22-alpine

# ---------------------------------------------------------------------------
# deps — install once against the lockfile, cached until a manifest changes
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /repo

# Only the manifests, so editing a page does not reinstall node_modules.
COPY package.json package-lock.json ./
COPY apps/web/package.json        apps/web/package.json
COPY apps/admin/package.json      apps/admin/package.json
COPY apps/portal/package.json     apps/portal/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json

# `npm ci` needs every workspace manifest present or it refuses the lockfile.
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# builder — compile one app to a standalone server
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
ARG APP
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are compiled into the client bundle, so they have to be
# present at BUILD time, not run time. Getting this wrong is silent: the app
# starts fine and links point at localhost.
ARG NEXT_PUBLIC_PORTAL_URL
ENV NEXT_PUBLIC_PORTAL_URL=${NEXT_PUBLIC_PORTAL_URL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build --workspace @stackd/${APP}

# ---------------------------------------------------------------------------
# runner — just the traced output, no toolchain, no source
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
ARG APP
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

# Runs as a non-root user. The image writes nothing at runtime — everything
# durable lives in Postgres or a mounted volume.
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs nextjs

# `output: 'standalone'` with outputFileTracingRoot at the repo root produces
# /repo/apps/<app>/.next/standalone/{node_modules,packages,apps/<app>}.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/${APP}/.next/standalone ./
# Static assets and the public folder are deliberately NOT traced — Next expects
# them copied alongside, and without this every page loads with no CSS or JS.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static

# The admin portal reads menu photos out of the website's public folder.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public

# server.js sits inside the app's own folder, not at the root, because tracing
# preserved the workspace layout.
ENV APP_DIR=/app/apps/${APP}
USER nextjs

# One shell form so APP_DIR expands. Exec so node is PID 1 and gets SIGTERM.
CMD exec node ${APP_DIR}/server.js
