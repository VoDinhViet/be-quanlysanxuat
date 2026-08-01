# NestJS + Drizzle Base Template

Base template cho backend NestJS 11 modular monolith — PostgreSQL + Drizzle ORM, Redis, JWT + RBAC,
Swagger. Package manager: **pnpm**.

Đây là nhánh `boilerplate` — chỉ giữ module hạ tầng (auth/JWT, RBAC, file registry, health check) và
một module nghiệp vụ mẫu (`users`, với `departments`/`positions` làm danh mục đi kèm) làm chuẩn để
copy khi bắt đầu dự án mới. Xem `CLAUDE.md` để biết đầy đủ convention.

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
pnpm db:generate            # sinh migration từ thay đổi schema
pnpm db:migrate             # áp migration — KHÔNG chạy vào DB dùng chung/prod khi chưa được duyệt
pnpm db:studio
pnpm db:seed:credentials    # role ADMIN + 1 department/position/user mẫu để login được
```

## Scripts

```bash
pnpm build / lint / format
pnpm test / test:e2e / test:cov   # KHÔNG dùng — xem docs/decisions/testing-paused.md
```

## Cấu trúc module

```text
src/api/<module>/
  <module>.module.ts
  <module>.controller.ts
  <module>.service.ts
  dto/
```

Module hiện có: `auth`, `users` (module tham chiếu), `roles`, `departments`, `positions`, `files`,
`health` — xem bảng đầy đủ trong `CLAUDE.md`.

## Template cho gì

- **Auth + RBAC**: login/refresh/logout JWT, permission dạng `resource:action` neo trên `roles`
  (`jsonb`, không có bảng `permissions` riêng), `system:manage` là quyền tuyệt đối.
- **`users` — module CRUD mẫu**: theo đúng khuôn controller/service/DTO/lỗi/phân trang mà
  `.claude/rules/` mô tả; copy module này khi thêm module nghiệp vụ mới.
- **File registry** (`files`): mọi đính kèm trỏ qua một bảng chung, không phải URL trần; bytes chỉ ra
  qua `GET /files/:id/download` (URL ký, hết hạn).
- **Danh mục tổ chức**: `departments`/`positions` — ví dụ danh mục public, chỉ đọc.
- **Health check**: `GET /health` ngoài prefix `api`.

## Tài liệu cho agent/dev

- `CLAUDE.md` — quy ước, danh sách module, quyết định đang hiệu lực.
- `docs/architecture.md` — sơ đồ ER + thứ tự ghi xuyên module.
- `docs/domains/identity-access.md` — khái niệm, vòng đời, business rule, bất biến của domain còn lại.
- `docs/workflows/<flow>.md` — trình tự chạy luồng nghiệp vụ đầu-cuối; chưa có file nào trong template.
- `docs/decisions/<slug>.md` — quyết định đảo chiều và ranh giới phạm vi ("vì sao không có X").
- Swagger `/api-docs` — reference route/DTO đầy đủ, tự sinh từ code.
- `.claude/rules/`, `.claude/skills/` — convention chi tiết + quy trình dùng cho Claude Code.
