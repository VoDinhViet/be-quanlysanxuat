# Khôi phục QLSX từ backup

Bản này nằm cùng backup trên R2 (`r2:qlsx-bk/RESTORE.md`) và trong repo (`deploy/RESTORE.md`). Đọc từ trên xuống,
chọn đúng tình huống ở mục 3.

## 1. Backup nằm ở đâu, có gì

Hai nhánh tách riêng, cùng cấu trúc ở VPS và ở R2:

```text
r2:qlsx-bk/                          (VPS: /var/backups/quanlysanxuat/ cho phần db/)
├── RESTORE.md                       bản hướng dẫn này
├── db/
│   └── 2026/10/08/
│       ├── qlsx-0200.dump           dump Postgres (pg_dump -Fc), giữ 3 bản gần nhất
│       └── qlsx-0200.json           thông tin bản dump: ngày giờ, sha256, số bảng/users/migration, image app
└── files/
    └── 2026/10/06/<uuid>.png        ảnh/tài liệu tải lên, đúng tên khoá lưu trong DB, chỉ thêm không xoá
```

- **DB** và **files** độc lập nhau. Khôi phục cái nào chỉ cần cái đó.
- `files/` là kho cộng dồn: mọi file từng tải lên đều ở đó, nên bản `.dump` cũ hay mới đều tìm đủ ảnh.
- Trên đĩa VPS ảnh nằm ở `/var/lib/quanlysanxuat/uploads` (cùng cấu trúc `YYYY/MM/DD/<uuid>.<ext>`), không có bản nén riêng.
- Chạy lúc 02:00 mỗi ngày (cron `/etc/cron.d/qlsx-backup`), log ở `/var/log/qlsx-backup.log`.

**Không có trong backup:** file bí mật `.env.production` và `.env` trên VPS (mật khẩu DB, JWT secret...). Hãy cất bản sao
trong trình quản lý mật khẩu. Mất chúng thì dựng lại được hệ thống nhưng phải tạo bí mật mới (mọi người dùng bị đăng xuất).

## 2. Kiểm tra backup còn tốt (nên làm mỗi tháng)

```bash
cd /opt/quanlysanxuat
bash restore.sh list         # có đủ 3 bản, xem thông tin bản mới nhất
bash restore.sh db --test    # khôi phục thử vào DB tạm rồi xoá, DB thật không bị đụng
```

So số `users`, `public_tables`, `applied_migrations` in ra với file `.json`: phải khớp.

## 3. Các tình huống

Mọi lệnh chạy trên VPS với quyền root, trong `/opt/quanlysanxuat`.

### A. Dữ liệu DB bị sai/xoá nhầm, VPS vẫn sống

```bash
bash restore.sh list                          # chọn bản trước khi lỗi xảy ra
bash restore.sh db 2026/10/07/qlsx-1553.dump  # hoặc bỏ tên để lấy bản mới nhất
```

Script hỏi xác nhận (gõ `RESTORE`), tự dump DB hiện tại vào `/var/backups/quanlysanxuat/pre-restore/` (đường lui),
dừng app, khôi phục, bật lại app. Bản chỉ còn trên R2 thì thêm `--r2`.

Cách thủ công, không cần script:

```bash
docker compose stop app
docker compose exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl' < qlsx-HHMM.dump
docker compose up -d app
```

### B. Mất ảnh (thư mục uploads trống hoặc thiếu)

```bash
bash restore.sh files
```

Kéo từ `r2:qlsx-bk/files` về `/var/lib/quanlysanxuat/uploads`, chỉ thêm file thiếu, rồi `chown -R 1000:1000`
(app chạy bằng user `node` uid 1000; thiếu bước này upload mới báo lỗi 500 `EACCES`).
Thủ công: `rclone copy r2:qlsx-bk/files /var/lib/quanlysanxuat/uploads && chown -R 1000:1000 /var/lib/quanlysanxuat/uploads`.

### C. Mất cả VPS, dựng lại trên máy mới

1. Máy Ubuntu mới, cài Docker + compose plugin, `rclone`, `git`. Trỏ lại DNS Cloudflare về IP mới.
2. Tạo thư mục và lấy mã:
   ```bash
   mkdir -p /opt/quanlysanxuat /var/lib/quanlysanxuat/{postgres,redis,uploads}
   git clone https://github.com/VoDinhViet/be-quanlysanxuat.git /tmp/be
   cp /tmp/be/docker-compose.yml /tmp/be/deploy/backup.sh /tmp/be/deploy/restore.sh /tmp/be/deploy/RESTORE.md /opt/quanlysanxuat/
   ```
3. Đặt lại các file bí mật trong `/opt/quanlysanxuat/`: `.env.production` (từ bản cất riêng) và `.env` gồm
   `POSTGRES_PASSWORD=<mật khẩu mới hoặc cũ>` và `APP_IMAGE=ghcr.io/vodinhviet/be-quanlysanxuat:<tag mới nhất>`
   (tag xem ở tab Packages của repo, hoặc trong file `.json` của bản backup).
4. Khai báo R2 cho rclone (`rclone config`, remote tên `r2`, loại S3, provider Cloudflare, endpoint
   `https://<account-id>.r2.cloudflarestorage.com`) bằng token R2 hiện có trong Cloudflare. Lỗi `501 NotImplemented` thoáng qua là vô hại.
5. Khôi phục dữ liệu:
   ```bash
   cd /opt/quanlysanxuat
   bash restore.sh db --r2 --yes     # bật Postgres, dựng DB từ bản mới nhất trên R2, bật app
   bash restore.sh files
   ```
   Bản `db --r2` cần app image kéo được từ GHCR: `docker login ghcr.io` bằng token đọc package nếu image còn private.
6. Dựng lại proxy HTTPS (`deploy/proxy/` vào `/opt/qlsx-proxy`), FE (`/opt/qlsx-web`, CI tự deploy lại khi push),
   giám sát (`deploy/monitor/`), và cron backup: `/etc/cron.d/qlsx-backup`
   `0 2 * * * root /opt/quanlysanxuat/backup.sh >> /var/log/qlsx-backup.log 2>&1`.
7. Kiểm tra: `curl http://127.0.0.1:8003/health`, mở web đăng nhập thử, mở một ảnh cũ.

## 4. Nhờ AI khôi phục

Dán đoạn sau cho Claude (hoặc AI khác có quyền chạy lệnh trên VPS), điền phần trong `<>`:

```text
Hệ thống QLSX (NestJS + Postgres 18 trong Docker compose) trên VPS <IP>, thư mục /opt/quanlysanxuat.
Tình huống: <A mất dữ liệu DB / B mất ảnh / C mất cả VPS>. Thời điểm cần quay về: <ngày giờ>.
Hãy đọc /opt/quanlysanxuat/RESTORE.md (hoặc r2:qlsx-bk/RESTORE.md) và dùng restore.sh theo tình huống.
Trước khi ghi đè DB thật phải chạy `bash restore.sh db --test` cho bản định dùng và cho tôi xem số liệu
(users, bảng, migration) đối chiếu với file .json đi kèm. Không xoá gì trên R2.
Sau khi xong, kiểm tra /health và mở thử một ảnh cũ.
```

Những điều AI cần biết (đã có trong tài liệu này): backup tách `db/` và `files/`; `files/` chỉ thêm; app chạy uid 1000
nên uploads phải `chown 1000:1000`; DB mới tinh không dựng được bằng `drizzle-kit migrate` (lịch sử migration đã gộp),
phải khôi phục từ dump; token R2 và mật khẩu không nằm trong backup.
