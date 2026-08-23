# ============================================================================
# Sportyra News — Production Dockerfile
# Multi-stage build: install → build → production
# ============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Install dependencies + build
# ---------------------------------------------------------------------------
FROM node:20-slim AS build

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace definition and lockfile first (better layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy workspace package manifests (needed for workspace resolution)
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/sportyra/package.json  ./artifacts/sportyra/
COPY lib/db/package.json              ./lib/db/
COPY lib/api-zod/package.json         ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY scripts/package.json             ./scripts/

# Install all dependencies (including devDependencies for build tools)
RUN pnpm install --frozen-lockfile

# Copy full source tree
COPY . .

# Build frontend + API server (typecheck + Vite + esbuild)
RUN pnpm run build:production

# Push database schema (requires DATABASE_URL at build time or skip)
# If DATABASE_URL is not available at build time, run db:push separately
# RUN pnpm run db:push

# ---------------------------------------------------------------------------
# Stage 2: Production runtime
# ---------------------------------------------------------------------------
FROM node:20-slim AS production

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace definition
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy workspace package manifests for workspace resolution
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/sportyra/package.json  ./artifacts/sportyra/
COPY lib/db/package.json              ./lib/db/
COPY lib/api-zod/package.json         ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY scripts/package.json             ./scripts/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built API server (bundled by esbuild — mostly self-contained)
COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist

# Copy built frontend (static files served by Express)
COPY --from=build /app/artifacts/sportyra/dist/public ./artifacts/sportyra/dist/public

# Copy database schema source (needed by drizzle-kit at runtime for db:push)
COPY --from=build /app/lib/db/src ./lib/db/src
COPY --from=build /app/lib/db/drizzle.config.ts ./lib/db/

# Expose port
EXPOSE 3000

# Health check (uses PORT env var — platforms like Railway/Render override this)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/api/healthz').then(r => { process.exit(r.ok ? 0 : 1) }).catch(() => process.exit(1))"

# Start from project root so static file path resolves correctly
CMD ["node", "artifacts/api-server/dist/index.mjs"]
