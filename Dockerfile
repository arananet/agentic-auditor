# Base image — must be Debian-based: Playwright's Chromium requires glibc (not available on Alpine)
FROM node:20-slim AS base

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# Download Playwright's Chromium binary (node_modules is available here)
RUN npx playwright install chromium

# Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
ENV PORT 3000
# Tell Playwright where the browser lives at runtime
ENV PLAYWRIGHT_BROWSERS_PATH /home/nextjs/.cache/ms-playwright

# Install Chromium system-level shared libraries (no browser binary — copied from builder)
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
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libx11-6 \
    libxcb1 \
    libxext6 \
    libxshmfence1 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Playwright Chromium binary from builder and fix ownership
RUN mkdir -p /home/nextjs/.cache
COPY --from=builder /root/.cache/ms-playwright /home/nextjs/.cache/ms-playwright
RUN chown -R nextjs:nodejs /home/nextjs/.cache

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
