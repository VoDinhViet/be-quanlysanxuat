#!/usr/bin/env bash
# Backup hằng đêm trên VPS. Cron: /etc/cron.d/qlsx-backup. Khôi phục: deploy/restore.sh, hướng dẫn: deploy/RESTORE.md.
#
# Hai nhánh tách riêng, giống nhau ở VPS và R2:
#
#   db/YYYY/MM/DD/qlsx-HHMM.dump   dump Postgres (định dạng custom, khôi phục bằng pg_restore)
#   db/YYYY/MM/DD/qlsx-HHMM.json   thông tin đi kèm (ngày giờ, sha256, số bảng/người dùng/migration, image đang chạy)
#   files/YYYY/MM/DD/<uuid>.<ext> ảnh/tài liệu tải lên, đúng tên khoá lưu trong DB (chỉ có trên R2, bản gốc nằm ở
#                                 $DATA_DIR/uploads trên đĩa VPS)
#   RESTORE.md                     bản hướng dẫn khôi phục, đẩy cùng mỗi lần backup (R2 còn là còn hướng dẫn)
#
# Database: HHMM để chạy tay nhiều lần/ngày không đè nhau. Chỉ giữ KEEP_BACKUPS lần gần nhất ở mỗi nơi.
# Files: chỉ đẩy file mới bằng `rclone copy` (không xoá phía R2), nên files/ là tập hợp mọi file từng tải lên;
# bản dump cũ nào cũng không bị thiếu ảnh.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${DATA_DIR:-/var/lib/quanlysanxuat}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/quanlysanxuat}"
KEEP_BACKUPS="${KEEP_BACKUPS:-3}"
RCLONE_CONFIG="${RCLONE_CONFIG:-/root/.config/rclone/rclone.conf}"
R2_DEST="${R2_DEST:-r2:qlsx-bk}"

cd "$APP_DIR"
umask 077

exec 9>/var/lock/qlsx-backup.lock
flock -n 9 || { echo "Đang có một lần backup khác chạy, dừng." >&2; exit 1; }

day_path="$(date +%Y/%m/%d)"
day_dir="$BACKUP_DIR/db/$day_path"
dump="$day_dir/qlsx-$(date +%H%M).dump"
manifest="${dump%.dump}.json"
mkdir -p "$day_dir"
trap 'rm -f "$dump.part"' EXIT

# Chạy một câu SQL trong container Postgres, trả về giá trị đơn; lỗi (ví dụ bảng chưa có) thì trả null.
sql_value() {
  docker compose exec -T postgres sh -c \
    "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tA -c \"$1\"" < /dev/null 2> /dev/null | tr -d '[:space:]' || true
}

echo "==> $(date '+%F %T') Dump Postgres"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' < /dev/null > "$dump.part"
# Bản dump hỏng hoặc rỗng không được thay thế bản tốt: kiểm tra đọc được mục lục trước khi giữ lại.
docker compose exec -T postgres pg_restore --list < "$dump.part" > /dev/null
mv "$dump.part" "$dump"

# File thông tin đi kèm: người (hoặc AI) đọc là biết bản này là gì, đủ chưa, mà không phải khôi phục thử.
tables="$(sql_value "select count(*) from information_schema.tables where table_schema='public'")"
users="$(sql_value "select count(*) from users")"
migrations="$(sql_value "select count(*) from drizzle.__drizzle_migrations")"
pg_version="$(sql_value "show server_version")"
app_image="$(grep '^APP_IMAGE=' .env 2> /dev/null | cut -d= -f2- || true)"
upload_files="$(find "$DATA_DIR/uploads" -type f 2> /dev/null | wc -l | tr -d ' ')"
printf '{\n  "created_at": "%s",\n  "dump": "%s",\n  "size_bytes": %s,\n  "sha256": "%s",\n  "postgres_version": "%s",\n  "public_tables": %s,\n  "users": %s,\n  "applied_migrations": %s,\n  "app_image": "%s",\n  "upload_files_on_disk": %s\n}\n' \
  "$(date -Iseconds)" "$(basename "$dump")" "$(stat -c %s "$dump")" "$(sha256sum "$dump" | cut -d' ' -f1)" \
  "$pg_version" "${tables:-null}" "${users:-null}" "${migrations:-null}" "$app_image" "${upload_files:-null}" > "$manifest"

# Chỉ xoá bản cũ sau khi bản mới đã xong. Đường dẫn YYYY/MM/DD/qlsx-HHMM.dump sắp theo chữ cái cũng là
# thứ tự thời gian. Thư mục ngày/tháng/năm rỗng được dọn theo.
while IFS= read -r old_dump; do
  echo "==> Xoá bản cũ trên VPS: ${old_dump#"$BACKUP_DIR"/}"
  rm -f "$old_dump" "${old_dump%.dump}.json"
done < <(find "$BACKUP_DIR/db" -type f -name 'qlsx-*.dump' | sort -r | tail -n +"$((KEEP_BACKUPS + 1))")
find "$BACKUP_DIR/db" -mindepth 1 -type d -empty -delete

echo "==> Xong: $(du -h "$dump" | cut -f1) DB trong $day_dir"

# Đẩy lên Cloudflare R2 (remote rclone `r2`, khai báo trong $RCLONE_CONFIG).
# Chưa khai báo thì bỏ qua, backup cục bộ ở trên vẫn đủ. Lỗi upload làm script thoát mã khác 0 để cron ghi log.
if command -v rclone > /dev/null && [[ -f "$RCLONE_CONFIG" ]] && RCLONE_CONFIG="$RCLONE_CONFIG" rclone listremotes | grep -q "^${R2_DEST%%:*}:$"; then
  export RCLONE_CONFIG

  echo "==> Đẩy DB lên $R2_DEST/db/$day_path"
  rclone copy "$day_dir" "$R2_DEST/db/$day_path"

  while IFS= read -r old_dump; do
    echo "==> Xoá bản cũ trên R2: db/$old_dump"
    rclone deletefile "$R2_DEST/db/$old_dump"
    rclone deletefile "$R2_DEST/db/${old_dump%.dump}.json" || true
  done < <(rclone lsf -R --files-only --include '[0-9][0-9][0-9][0-9]/*/*/qlsx-*.dump' "$R2_DEST/db" | sort -r | tail -n +"$((KEEP_BACKUPS + 1))")
  rclone rmdirs "$R2_DEST/db" --leave-root

  echo "==> Đẩy file mới trong uploads lên $R2_DEST/files"
  rclone copy "$DATA_DIR/uploads" "$R2_DEST/files"

  # Hướng dẫn khôi phục nằm ngay trong kho backup, VPS và repo mất hết vẫn đọc được.
  [[ -f "$APP_DIR/RESTORE.md" ]] && rclone copyto "$APP_DIR/RESTORE.md" "$R2_DEST/RESTORE.md"

  echo "==> Trên $R2_DEST: $(rclone size "$R2_DEST" | tr '\n' ' ')"
else
  echo "==> Bỏ qua đẩy ra ngoài: chưa cấu hình rclone remote ${R2_DEST%%:*}"
fi
