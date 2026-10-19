# Môi trường test (staging)

Bản chạy thứ hai của hệ thống trên cùng VPS với prod, để test nhánh `develop` mà không đụng prod.

| | Prod | Staging |
|---|---|---|
| Thư mục | `/opt/quanlysanxuat`, `/opt/qlsx-web` | `/opt/qlsx-staging`, `/opt/qlsx-staging-web` |
| Container | `qlsx-backend`, `qlsx-frontend`, `qlsx-postgres`, `qlsx-redis` | `qlsx-staging-backend`, `qlsx-staging-frontend`, `qlsx-staging-postgres`, `qlsx-staging-redis` |
| Cổng loopback | 8003, 3000, 5432 | 8013, 3010, 5442 |
| Dữ liệu | `/var/lib/quanlysanxuat` | `/var/lib/qlsx-staging` |
| Tên miền | `web-qlsx` / `be-qlsx` `.thomi.com.vn` | `staging-qlsx` / `staging-api-qlsx` `.thomi.com.vn` |
| Deploy từ | nhánh `main`, tag `v<số>` | nhánh `develop`, tag `staging-v<số>` |

RAM được giới hạn (tổng khoảng 710 MB) và staging bị kernel kill trước prod khi thiếu bộ nhớ (`oom_score_adj: 500`).
Không dùng thì `docker compose stop` trong `/opt/qlsx-staging` và `/opt/qlsx-staging-web` để nhả RAM.

## Dựng lần đầu

1. Cloudflare: hai bản ghi A `staging-qlsx` và `staging-api-qlsx` trỏ về IP của VPS, cùng chế độ SSL với prod.
2. Caddy (làm tay, như prod): copy `deploy/proxy/Caddyfile` và `docker-compose.yml` lên `/opt/qlsx-proxy/`, thêm
   `STAGING_WEB_DOMAIN` và `STAGING_API_DOMAIN` vào `/opt/qlsx-proxy/.env`, rồi `docker compose up -d`.
3. Trên VPS, tạo `/opt/qlsx-staging/.env` (`POSTGRES_PASSWORD=` chuỗi hex mới, khác prod) và `/opt/qlsx-staging/.env.staging`
   cho backend, lấy từ `.env.production` của prod nhưng **đổi** `AUTH_JWT_SECRET`, `AUTH_REFRESH_SECRET`,
   `UPLOAD_URL_SECRET` thành giá trị mới, `BACKEND_DOMAIN`, `FRONTEND_DOMAIN`, `APP_CORS_ORIGIN` thành tên miền staging.
4. Tạo `/opt/qlsx-staging-web/.env` với `SESSION_SECRET` mới (xem repo web, `deploy/staging`).
5. GitHub: environment `staging` ở hai repo be và web, secret `VPS_HOST`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`; biến
   `STAGING_API_DOMAIN` (be), `STAGING_VITE_API_URL` và `STAGING_WEB_DOMAIN` (web).
6. Đưa dữ liệu prod sang, đặt mật khẩu test cho mọi tài khoản:
   `cd /opt/qlsx-staging && STAGING_PASSWORD='...' bash refresh-from-prod.sh`.
7. Push lên `develop` (hoặc chạy tay workflow **Staging**), CI migrate DB staging rồi deploy.

## Làm mới dữ liệu

Chạy lại `refresh-from-prod.sh` (bước 6). Script chỉ đọc prod; nó xoá DB staging, restore từ bản dump mới của prod, đặt
lại mật khẩu mọi tài khoản và đồng bộ ảnh tải lên. Dữ liệu nhập tay ở staging sẽ mất.

## Rollback

Chạy lại app với tag cũ: `GHCR_USER=<user> bash remote-deploy.sh app ghcr.io/vodinhviet/be-quanlysanxuat:staging-v<số>`
(đọc token GHCR từ stdin), hoặc `workflow_dispatch` với `ref` là commit cần quay về.
