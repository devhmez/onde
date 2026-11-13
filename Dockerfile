# ONDE website — production image (Next.js 16 standalone server + SQLite).
#
#   docker compose build          # normal way (see docker-compose.yml and docs/DEPLOY.md)
#   docker build -t onde-web .    # plain Docker
#
# Stages: deps (npm ci, native toolchain) → build (next build) → runner (small, non-root, only what runs).
# Runtime layout (/app):
#   server.js + .next/ + node_modules/   ← .next/standalone (traced by Next)
#   .next/static/  public/               ← static assets, served by server.js
#   messages/  drizzle/                  ← read with fs at runtime (i18n JSON, SQL migrations) — not traced, copied here
#   node_modules/better-sqlite3          ← copied explicitly so the native .node binding is always present
#   scripts/hash-password.mjs (+bcryptjs)← lets you hash the admin password inside the container
#   data/                                ← VOLUME: the SQLite database (onde.db + WAL files)

ARG NODE_IMAGE=node:22-bookworm-slim

# ---------------------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---------------------------------------------------------------------------------------------------------------
# 1) Dependencies. python3/make/g++ are only a safety net for native addons that must compile from source
#    (better-sqlite3 13 ships prebuilt Linux binaries); they never reach the final image.
FROM base AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------------------------------------------
# 2) Build. PUBLIC_BASE_URL is also needed here because pages that are pre-rendered at build time (sitemap, robots,
#    canonical/OG URLs) read it. Any database a build worker opens goes to /tmp and is thrown away with the stage.
FROM base AS build
ARG PUBLIC_BASE_URL=https://onde.tn
ENV NODE_ENV=production \
    PUBLIC_BASE_URL=${PUBLIC_BASE_URL} \
    DATABASE_PATH=/tmp/onde-build/onde.db
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Native + script dependencies that must exist as real files at runtime, trimmed to what Linux needs.
RUN mkdir -p /opt/runtime-extra/node_modules \
 && cp -R node_modules/better-sqlite3 node_modules/bcryptjs /opt/runtime-extra/node_modules/ \
 && cd /opt/runtime-extra/node_modules/better-sqlite3 \
 && rm -rf deps src binding.gyp \
 && rm -f prebuilds/darwin-* prebuilds/win32-* \
 && node -e "const D=require('/opt/runtime-extra/node_modules/better-sqlite3');const d=new D(':memory:');if(d.prepare('select 1 as x').get().x!==1)process.exit(1);d.close();console.log('better-sqlite3 native binding OK')"

# ---------------------------------------------------------------------------------------------------------------
# 3) Runtime.
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/app/data/onde.db

# Dedicated unprivileged user; /app/data is created here so a fresh named volume inherits its ownership.
RUN groupadd --system --gid 1001 onde \
 && useradd --system --uid 1001 --gid onde --home-dir /app --shell /usr/sbin/nologin onde \
 && mkdir -p /app/data \
 && chown onde:onde /app/data

COPY --from=build --chown=onde:onde /app/.next/standalone ./
COPY --from=build --chown=onde:onde /app/.next/static ./.next/static
COPY --from=build --chown=onde:onde /app/public ./public
COPY --from=build --chown=onde:onde /app/messages ./messages
COPY --from=build --chown=onde:onde /app/drizzle ./drizzle
COPY --from=build --chown=onde:onde /opt/runtime-extra/node_modules/ ./node_modules/
COPY --from=build --chown=onde:onde /app/scripts/hash-password.mjs ./scripts/hash-password.mjs

USER onde

VOLUME ["/app/data"]
EXPOSE 3000

# No curl/wget in the slim image: Node 22's global fetch does the probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',{cache:'no-store'}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", "server.js"]
