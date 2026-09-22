# `docker-compose.yml` chỉ container hoá app, không kèm Postgres/Redis

**Trạng thái:** còn hiệu lực

## Bối cảnh

Thêm `Dockerfile`/`docker-compose.yml` đầu tiên cho repo. Đã cân nhắc compose full-stack (kèm
service `postgres`/`redis` local, dùng cho dev) — quyết định không làm vậy.

## Quyết định

- `docker-compose.yml` chỉ có đúng 1 service: `app`. Không có `postgres`/`redis`.
- App kết nối ra Postgres/Redis **remote sẵn có** qua `DATABASE_URL`/`REDIS_URL` (bơm vào container
  qua `env_file: .env.production`) — khớp pattern `.env.development`/`.env.production` (gitignored)
  đã tồn tại từ trước, không phải chạy DB/Redis trên chính máy chạy Docker.
- Migration (`pnpm db:migrate`) vẫn là thao tác tay riêng, không chạy trong container — `CMD` chỉ
  `node dist/src/main.js`.

## Đừng hoàn lại

Đừng tự thêm service `postgres`/`redis` vào `docker-compose.yml` này khi cần dev local — đã cân
nhắc và loại bỏ hướng đó; hỏi lại người dùng trước khi đổi.
