# syntax=docker/dockerfile:1

# Các layer lớn hiếm khi đổi nằm ở trên (Chromium, node_modules), layer hay đổi (dist) nằm cuối cùng và
# nhỏ. Nhờ vậy mỗi lần deploy chỉ phải đẩy lên GHCR và kéo về VPS vài chục MB thay vì cả image.

FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN corepack enable
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Chỉ phụ thuộc vào file khai báo package nên được cache cho tới khi pnpm-lock.yaml đổi.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
# Chỉ copy những gì `nest build` cần (thay vì `COPY . .`) để đổi file ngoài src/ không làm vỡ cache của bước build.
# drizzle.config.ts phải có mặt: tsconfig.build.json không có `include` nên tsc biên dịch cả file này, và nó
# (nằm ở thư mục gốc) làm rootDir là thư mục gốc, nhờ đó đầu ra là dist/src/main.js như CMD mong đợi.
# Thiếu nó rootDir co lại thành src/ và đầu ra thành dist/main.js, container sẽ không khởi động được.
COPY tsconfig.json tsconfig.build.json nest-cli.json drizzle.config.ts ./
COPY src ./src
RUN pnpm run build

FROM node:24-bookworm-slim AS production
WORKDIR /app

# Chromium cho PdfRendererService (src/templates/pdf-renderer.service.ts) — dùng gói Debian thay vì
# để Puppeteer tự tải, tránh phải tự liệt kê shared lib runtime. Đặt trước các COPY để layer này
# (khoảng 700 MB) gần như không bao giờ phải build lại hay tải lại.
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PORT=8003

# User `node` (uid 1000) có sẵn trong image và có HOME ghi được (/home/node) — Chromium (crashpad)
# cần HOME ghi được, không có thì Puppeteer không launch được.
# Gán chủ sở hữu ngay trong `COPY --chown` thay vì `chown -R` sau đó: `chown -R` trên node_modules sinh
# thêm một layer ~220 MB chạy lại ở mỗi lần build.
RUN chown node:node /app
COPY --chown=node:node package.json ./
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node

EXPOSE 8003

# --start-interval: trong --start-period kiểm tra mỗi 3 giây (thay vì mỗi --interval) để deploy
# biết app đã sẵn sàng sớm; sau đó mới kiểm tra mỗi 30 giây.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --start-interval=3s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8003)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/src/main.js"]
