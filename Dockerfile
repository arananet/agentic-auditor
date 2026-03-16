# Base image — must be Debian-based: Playwright's Chromium requires glibc (not available on Alpine)
FROM node:20-slim AS base

# Dependencies
# Use `npm install` (not `npm ci`) so a missing/stale package-lock.json doesn't
# silently omit newly-added packages like playwright.
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# Download Playwright's Chromium binary into the builder layer so we can copy it
# to the runner without needing internet access there.
RUN npx playwright install chromium

# Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
ENV PORT 3000
# Bind to all interfaces so Railway's health-check proxy can reach the server.
# (Next.js standalone defaults to localhost when HOSTNAME is unset.)
ENV HOSTNAME 0.0.0.0
# Tell Playwright where the browser binary lives at runtime.
ENV PLAYWRIGHT_BROWSERS_PATH /home/nextjs/.cache/ms-playwright

# Install Chromium runtime system libraries.
# Note: libasound2 was renamed to libasound2t64 in Debian Bookworm (node:20-slim
# base). Install both names so the layer works on either release.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libx11-6 \
    libxcb1 \
    libxext6 \
    libxshmfence1 \
    fonts-liberation \
    && apt-get install -y --no-install-recommends libasound2t64 || apt-get install -y --no-install-recommends libasound2 \
    && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# playwright's JS package uses dynamic internal requires that Next.js's file
# tracer (nft) cannot fully enumerate, so standalone/node_modules may have an
# incomplete copy. Copy the full packages from the builder explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/playwright ./node_modules/playwright
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/playwright-core ./node_modules/playwright-core

# Copy the Chromium binary that was downloaded in the builder stage.
RUN mkdir -p /home/nextjs/.cache
COPY --from=builder /root/.cache/ms-playwright /home/nextjs/.cache/ms-playwright
RUN chown -R nextjs:nodejs /home/nextjs/.cache

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
