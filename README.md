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

`docker-compose.yml` chạy ba service: `app`, `postgres` (Postgres 18) và `redis` (Redis 7). App nối vào hai
service kia qua mạng nội bộ của compose (`DATABASE_URL`/`REDIS_URL` trong compose ghi đè giá trị trong
`.env.production`). Postgres chỉ mở trên `127.0.0.1` của host, Redis không mở cổng ra ngoài.

```bash
cp .env.example .env.production                # biến của app, điền đủ giá trị thật trước
cp deploy/compose.env.example .env             # biến của compose; bắt buộc đặt POSTGRES_PASSWORD
docker compose up -d --build
```

Database mới **không dựng được bằng `pnpm db:migrate`** (lịch sử migration đã bị squash, file `0010` trở đi
cần schema có sẵn). Lần đầu phải khôi phục từ bản dump của DB hiện tại bằng `pg_restore`/`psql`; sau đó
`pnpm db:migrate` chạy tiếp bình thường.

Kiểm tra: `GET http://localhost:8003/health` (kiểm tra cả DB lẫn Redis). Dữ liệu giữ qua bind mount ra host:
`PGDATA_DIR` (mặc định `/var/lib/quanlysanxuat/postgres`), `REDIS_DATA_DIR` (`.../redis`) và `UPLOADS_DIR`
(`.../uploads`, nơi `UPLOAD_DRIVER=local` ghi file). Thư mục uploads phải cho user `node` (uid 1000) trong
container ghi được: `sudo mkdir -p /var/lib/quanlysanxuat/uploads && sudo chown -R 1000:1000 /var/lib/quanlysanxuat/uploads`.
Postgres và Redis tự tạo thư mục dữ liệu của chúng.

### Deploy tự động (GitHub Actions)

Push lên `main` chạy `.github/workflows/deploy.yml`, gồm ba job:

1. **verify** (`tsc --noEmit` và `eslint` chạy đồng thời, không `--fix`) và **build** (build image, đẩy lên
   GHCR `ghcr.io/vodinhviet/be-quanlysanxuat`) chạy **song song**. Mỗi image có ba tag: `v<số lần chạy>` (ví dụ
   `v42`, số tăng dần nên số lớn hơn là bản mới hơn), `sha-<7 ký tự commit>` và `latest`.
2. **deploy** chỉ chạy khi cả hai job trên thành công: copy `docker-compose.yml` và `deploy/remote-deploy.sh`
   lên VPS (`/opt/quanlysanxuat/`), chạy `remote-deploy.sh infra` (bật Postgres và Redis, dừng nếu DB chưa có
   schema), `pnpm db:migrate` qua SSH tunnel tới Postgres trên VPS, `remote-deploy.sh app <image>`, cuối cùng
   gọi `/health` từ bên ngoài.

Container có tên cố định `qlsx-backend`, `qlsx-postgres`, `qlsx-redis`. Xem bản đang chạy trên VPS:
`docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'` (tag của `qlsx-backend` là phiên bản, ví dụ `:v42`);
commit của bản đó: `docker inspect qlsx-backend --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'`.
Mỗi lần deploy cũng ghi bản vừa deploy vào phần Summary của lần chạy trên GitHub Actions.

Tốc độ: một lần chạy thường mất khoảng 2–2,5 phút (trước đây hơn 5 phút). Các lý do và điều cần giữ nguyên:

- `Dockerfile` đặt layer lớn hiếm đổi (Chromium, `node_modules`) lên trước, layer `dist` nhỏ ở cuối, và gán chủ
  sở hữu bằng `COPY --chown` (không dùng `chown -R`). Nhờ vậy cache build (GitHub Actions cache) và mỗi lần
  kéo image về VPS chỉ phải xử lý vài chục MB. Đừng thêm lại `chown -R` hay `COPY . .` vào stage build.
- Stage build chỉ copy `tsconfig*.json`, `nest-cli.json`, `drizzle.config.ts` và `src/`. `drizzle.config.ts` bắt
  buộc phải có: nó làm `rootDir` của `tsc` là thư mục gốc, nên đầu ra mới là `dist/src/main.js` như `CMD`
  mong đợi. Thêm file/thư mục mà `nest build` cần thì phải copy thêm vào stage này.
- Healthcheck có `start_interval: 3s` nên `docker compose up --wait` xong ngay khi app sẵn sàng (khoảng 4 giây)
  thay vì chờ 30 giây.

`remote-deploy.sh app` pull image mới, khởi động lại app và chờ healthcheck tối đa 150 giây. Nếu bản mới
không healthy, script in 100 dòng log cuối, tự chạy lại image trước đó và để job báo lỗi. Các lần deploy
xếp hàng (không chạy chồng nhau). Thông tin đăng nhập DB cho bước migrate được đọc thẳng từ container
Postgres trên VPS, nên không có secret riêng cho nó.

Secret của environment `production` (Settings → Environments → production):

| Secret | Nội dung |
| --- | --- |
| `VPS_HOST` | IP hoặc hostname VPS |
| `VPS_SSH_KEY` | private key SSH dành riêng cho CI (public key nằm trong `authorized_keys` của VPS) |
| `VPS_KNOWN_HOSTS` | host key của VPS (`ssh-keyscan -t ed25519 <host>`), để pin chứ không tin lần đầu |

Lưu ý:

- Migrate chạy **trước** deploy. Nếu bản mới bị rollback thì app cũ phải chạy tiếp trên schema mới, nên
  migration cần tương thích ngược (thêm cột/bảng, chưa xoá hay đổi tên thứ app cũ còn dùng).
- `.env.production` và `.env` (có `POSTGRES_PASSWORD`) trên VPS vẫn quản lý tay, CI chỉ ghi thêm `APP_IMAGE`
  vào `.env`.
- Deploy lại hoặc quay về bản cũ bằng tay: chạy workflow bằng `workflow_dispatch`, hoặc trên VPS
  `bash /opt/quanlysanxuat/remote-deploy.sh app ghcr.io/vodinhviet/be-quanlysanxuat:v<số>`
  (đăng nhập GHCR trước nếu image chưa có trên máy).
- Push chỉ đổi `docs/`, `.claude/`, file `*.md` hoặc `deploy/backup.sh` thì không kích hoạt deploy.

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

