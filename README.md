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

API mặc định ở `http://localhost:3000/api` (cổng lấy từ biến môi trường `PORT` nếu có set, xem `.env.example`); Swagger UI ở `http://localhost:3000/api-docs` (ngoài production).

## Database

```bash
pnpm db:generate    # sinh migration từ thay đổi schema
pnpm db:migrate     # áp migration — KHÔNG chạy vào DB dùng chung/prod khi chưa được duyệt
pnpm db:studio
pnpm db:seed:<name> # xem package.json cho danh sách đầy đủ
```

## Scripts

```bash
pnpm build / lint / format
pnpm test / test:e2e / test:cov   # tạm dừng repo-wide, xem CLAUDE.md
```

## Cấu trúc module

```text
src/api/<module>/
  <module>.module.ts
  <module>.controller.ts
  <module>.service.ts
  dto/
```

24 module hiện có, xem bảng đầy đủ trong `CLAUDE.md`.

## Tài liệu cho agent/dev

- `CLAUDE.md` — quy ước, danh sách module, quyết định đang hiệu lực.
- `docs/architecture.md` — sơ đồ ER + thứ tự ghi xuyên module.
- `docs/features/<feature>.md` — business rules + API contract từng module.
- `.claude/rules/`, `.claude/skills/` — convention chi tiết + quy trình dùng cho Claude Code.
