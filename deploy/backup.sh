#!/usr/bin/env bash
# Backup hằng đêm trên VPS. Cron: /etc/cron.d/qlsx-backup.
#
# Database: dump Postgres (định dạng custom, khôi phục bằng pg_restore), mỗi ngày một thư mục
# (HHMM để chạy tay nhiều lần/ngày không đè nhau), chỉ giữ KEEP_BACKUPS lần gần nhất ở mỗi nơi:
#   VPS  $BACKUP_DIR/YYYY/MM/DD/qlsx-HHMM.dump
#   R2   $R2_DEST/YYYY/MM/DD/qlsx-HHMM.dump
#
# Ảnh/tài liệu tải lên (uploads): chỉ đẩy file mới lên $R2_DEST/uploads/ bằng `rclone copy` (không xoá
# phía R2), nên kho trên R2 là tập hợp mọi file từng tải lên; bản DB cũ nào cũng không bị thiếu ảnh.
# Thư mục uploads vẫn nằm sẵn trên đĩa VPS nên không tạo bản nén riêng ở $BACKUP_DIR.
#
# Khôi phục:
#   docker compose exec -T postgres sh -c \
#     'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl' < qlsx-HHMM.dump
#   rclone copy r2:qlsx-bk/uploads /var/lib/quanlysanxuat/uploads && chown -R 1000:1000 /var/lib/quanlysanxuat/uploads
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
day_dir="$BACKUP_DIR/$day_path"
dump="$day_dir/qlsx-$(date +%H%M).dump"
mkdir -p "$day_dir"
trap 'rm -f "$dump.part"' EXIT

echo "==> $(date '+%F %T') Dump Postgres"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' < /dev/null > "$dump.part"
# Bản dump hỏng hoặc rỗng không được thay thế bản tốt: kiểm tra đọc được mục lục trước khi giữ lại.
docker compose exec -T postgres pg_restore --list < "$dump.part" > /dev/null
mv "$dump.part" "$dump"

# Chỉ xoá bản cũ sau khi bản mới đã xong. Đường dẫn YYYY/MM/DD/qlsx-HHMM.dump sắp theo chữ cái cũng là
# thứ tự thời gian. Thư mục ngày/tháng/năm rỗng được dọn theo.
while IFS= read -r old_dump; do
  echo "==> Xoá bản cũ trên VPS: ${old_dump#"$BACKUP_DIR"/}"
  rm -f "$old_dump"
done < <(find "$BACKUP_DIR" -type f -name 'qlsx-*.dump' | sort -r | tail -n +"$((KEEP_BACKUPS + 1))")
find "$BACKUP_DIR" -mindepth 1 -type d -empty -delete

echo "==> Xong: $(du -h "$dump" | cut -f1) DB trong $day_dir"

# Đẩy lên Cloudflare R2 (remote rclone `r2`, khai báo trong $RCLONE_CONFIG).
# Chưa khai báo thì bỏ qua, backup cục bộ ở trên vẫn đủ. Lỗi upload làm script thoát mã khác 0 để cron ghi log.
if command -v rclone > /dev/null && [[ -f "$RCLONE_CONFIG" ]] && RCLONE_CONFIG="$RCLONE_CONFIG" rclone listremotes | grep -q "^${R2_DEST%%:*}:$"; then
  export RCLONE_CONFIG

  echo "==> Đẩy DB lên $R2_DEST/$day_path"
  rclone copy "$day_dir" "$R2_DEST/$day_path"

  while IFS= read -r old_dump; do
    echo "==> Xoá bản cũ trên R2: $old_dump"
    rclone deletefile "$R2_DEST/$old_dump"
  done < <(rclone lsf -R --files-only --include '[0-9][0-9][0-9][0-9]/*/*/qlsx-*.dump' "$R2_DEST" | sort -r | tail -n +"$((KEEP_BACKUPS + 1))")
  # Chỉ dọn thư mục ngày tháng, không đụng nhánh uploads/.
  rclone rmdirs "$R2_DEST" --leave-root --exclude 'uploads/**'

  echo "==> Đẩy file mới trong uploads lên $R2_DEST/uploads"
  rclone copy "$DATA_DIR/uploads" "$R2_DEST/uploads"

  echo "==> Trên $R2_DEST: $(rclone size "$R2_DEST" | tr '\n' ' ')"
else
  echo "==> Bỏ qua đẩy ra ngoài: chưa cấu hình rclone remote ${R2_DEST%%:*}"
fi
