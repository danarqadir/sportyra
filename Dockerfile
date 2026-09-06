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

# Install all dependencies (including devDependencies for build tools)
RUN pnpm install --frozen-lockfile

# Copy full source tree
COPY . .

# Build frontend + API server (typecheck + Vite + esbuild)
RUN pnpm run build:production

# Migrations are applied at container startup (see CMD), not at build time, because
# DATABASE_URL is only available at runtime. This keeps the image buildable without
# a database and uses versioned migrations instead of db:push.

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

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built API server (bundled by esbuild — mostly self-contained)
COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist

# Copy built frontend (static files served by Express)
COPY --from=build /app/artifacts/sportyra/dist/public ./artifacts/sportyra/dist/public

# Copy versioned migrations and the migration runner. The runner uses drizzle-orm and
# pg, both production dependencies installed by `pnpm install --prod` in this stage.
COPY --from=build /app/lib/db/drizzle ./lib/db/drizzle
COPY --from=build /app/lib/db/scripts ./lib/db/scripts
COPY --from=build /app/lib/db/src ./lib/db/src
COPY --from=build /app/lib/db/drizzle.config.ts ./lib/db/

# Expose port
EXPOSE 3000

# Health check (uses PORT env var — platforms like Railway/Render override this)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/api/healthz').then(r => { process.exit(r.ok ? 0 : 1) }).catch(() => process.exit(1))"

# Apply versioned migrations, then start the API server from the project root so the
# static file path resolves correctly.
CMD ["sh", "-c", "node lib/db/scripts/migrate-deploy.mjs && node artifacts/api-server/dist/index.mjs"]
