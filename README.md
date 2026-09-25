# Quản Lý Sản Xuất API

Backend cho hệ thống quản lý sản xuất. NestJS 11 modular monolith — PostgreSQL + Drizzle ORM, Redis, JWT + RBAC, Swagger. Package manager: **pnpm**.

## Yêu cầu

Node.js, pnpm, PostgreSQL, Redis đang chạy.

## Cài đặt

```bash
pnpm install
cp .env.example .env
```

Điền các giá trị trong `.env` (`DATABASE_URL`, `REDIS_URL`, `AUTH_JWT_SECRET`, ...) — xem `.env.example` cho danh sách đầy đủ. Env nạp từ `.env.${NODE_ENV}` trước, `.env` sau.

## Chạy

```bash
pnpm start:dev      # dev, watch mode
pnpm build && pnpm start:prod
```

API ở `http://localhost:$PORT/api` — cổng lấy từ biến môi trường `PORT` (`.env.example` đặt sẵn `8003`, không phải 3000); Swagger UI ở `http://localhost:$PORT/api-docs` (ngoài production).

## Database

```bash
pnpm db:generate    # sinh migration từ thay đổi schema
pnpm db:migrate     # áp migration — KHÔNG chạy vào DB dùng chung/prod khi chưa được duyệt
pnpm db:studio
pnpm db:seed:<name> # xem package.json cho danh sách đầy đủ
```

## Docker

Container hoá đúng app (không kèm Postgres/Redis — app nối ra DB/Redis remote sẵn có qua biến môi
trường).

```bash
cp .env.example .env.production   # nếu chưa có, điền đủ giá trị thật trước (DATABASE_URL/REDIS_URL trỏ server thật, không phải localhost)
docker compose up -d --build
```

Kiểm tra: `GET http://localhost:8003/health` (kiểm tra cả DB lẫn Redis). Dữ liệu `uploads/`
(`UPLOAD_DRIVER=local`) giữ qua named volume `uploads_data`.

## Scripts

```bash
pnpm build / lint / format
pnpm test / test:e2e / test:cov   # KHÔNG dùng — test đang tạm dừng
```

## Cấu trúc module

```text
src/api/<module>/
  <module>.module.ts
  <module>.controller.ts
  <module>.service.ts
  dto/
```

Danh sách module: xem `src/api/` và Swagger `/api-docs` (reference route/DTO tự sinh từ code).

