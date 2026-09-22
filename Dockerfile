# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:24-bookworm-slim AS production
WORKDIR /app

# Chromium cho PdfRendererService (src/templates/pdf-renderer.service.ts) — dùng gói Debian thay vì
# để Puppeteer tự tải, tránh phải tự liệt kê shared lib runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PORT=8003

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist

RUN groupadd --system nestjs && useradd --system --gid nestjs nestjs \
  && chown -R nestjs:nestjs /app
USER nestjs

EXPOSE 8003

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8003)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/src/main.js"]
