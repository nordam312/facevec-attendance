# syntax=docker/dockerfile:1.7
# =============================================================================
# Multi-stage build for the Express API gateway.
#   deps      -> all dependencies (incl. dev) for compilation
#   build     -> generate Prisma client + compile TypeScript to dist/
#   prod-deps -> production-only node_modules WITH the generated Prisma client
#   runtime   -> minimal non-root image: prod deps + dist + prisma schema
# The Prisma client is generated (not pruned) so it survives into runtime, and
# migrations are applied on container start via the entrypoint.
# =============================================================================
ARG NODE_VERSION=22.12-alpine

# ---- deps -------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ------------------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `npm run build` runs `prisma generate` then `tsc`.
RUN npm run build

# ---- prod-deps --------------------------------------------------------------
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# Regenerate the client against the production node_modules so it ships in the
# runtime image (a plain `npm prune` would drop the generated client).
COPY prisma ./prisma
RUN npx prisma generate

# ---- runtime ----------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Run as an unprivileged user.
RUN addgroup -S app && adduser -S app -G app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health >/dev/null 2>&1 || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
