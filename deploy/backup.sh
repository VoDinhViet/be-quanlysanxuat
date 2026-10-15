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

# Báo Zalo qua notify-zalo.sh (cài cùng thư mục). Chưa cài hoặc gửi lỗi thì bỏ qua, không làm hỏng backup.
notify() { [[ -f "$APP_DIR/notify-zalo.sh" ]] && bash "$APP_DIR/notify-zalo.sh" --report "$@" || true; }

# `du -h` in "120M"; tin Zalo đọc "120 MB" cho người không rành kỹ thuật.
human_size() { du -h "$1" | cut -f1 | sed 's/\([KMGT]\)$/ \1B/'; }

exec 9>/var/lock/qlsx-backup.lock
flock -n 9 || {
  echo "Đang có một lần backup khác chạy, dừng." >&2
  notify "⚠️ BACKUP BỊ BỎ QUA" "Lý do: đang có một lần backup khác chạy" "Cần làm: không cần, lần chạy kia sẽ tự báo kết quả"
  exit 1
}

day_path="$(date +%Y/%m/%d)"
day_dir="$BACKUP_DIR/db/$day_path"
dump="$day_dir/qlsx-$(date +%H%M).dump"
manifest="${dump%.dump}.json"

# `step` là bước đang chạy, để tin báo lỗi nói được hỏng ở đâu. Gán lại trước mỗi bước có thể thất bại.
step="tạo thư mục backup"
on_exit() {
  local exit_code=$?
  rm -f "$dump.part"
  if ((exit_code != 0)); then
    notify "❌ BACKUP THẤT BẠI" \
      "Bước lỗi: $step" \
      "Mã lỗi: $exit_code" \
      "Cần làm: xem log /var/log/qlsx-backup.log trên máy chủ rồi chạy lại backup.sh"
  fi
}
trap on_exit EXIT
# Bị kill (reboot, timeout, Ctrl-C) thì bash chạy trap EXIT với $? = 0 và im lặng; đổi sang mã thoát thật để vẫn báo.
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$day_dir"

# Chạy một câu SQL trong container Postgres, trả về giá trị đơn; lỗi (ví dụ bảng chưa có) thì trả null.
sql_value() {
  docker compose exec -T postgres sh -c \
    "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tA -c \"$1\"" < /dev/null 2> /dev/null | tr -d '[:space:]' || true
}

step="dump Postgres"
echo "==> $(date '+%F %T') Dump Postgres"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' < /dev/null > "$dump.part"
step="kiểm tra bản dump đọc được"
# Bản dump hỏng hoặc rỗng không được thay thế bản tốt: kiểm tra đọc được mục lục trước khi giữ lại.
docker compose exec -T postgres pg_restore --list < "$dump.part" > /dev/null
mv "$dump.part" "$dump"

step="ghi file thông tin đi kèm"
# File thông tin đi kèm: người (hoặc AI) đọc là biết bản này là gì, đủ chưa, mà không phải khôi phục thử.
tables="$(sql_value "select count(*) from information_schema.tables where table_schema='public'")"
users="$(sql_value "select count(*) from users")"
migrations="$(sql_value "select count(*) from drizzle.__drizzle_migrations")"
pg_version="$(sql_value "show server_version")"
app_image="$(grep '^APP_IMAGE=' .env 2> /dev/null | cut -d= -f2- || true)"
upload_files="$(find "$DATA_DIR/uploads" -type f 2> /dev/null | wc -l | tr -d ' ')" || true
printf '{\n  "created_at": "%s",\n  "dump": "%s",\n  "size_bytes": %s,\n  "sha256": "%s",\n  "postgres_version": "%s",\n  "public_tables": %s,\n  "users": %s,\n  "applied_migrations": %s,\n  "app_image": "%s",\n  "upload_files_on_disk": %s\n}\n' \
  "$(date -Iseconds)" "$(basename "$dump")" "$(stat -c %s "$dump")" "$(sha256sum "$dump" | cut -d' ' -f1)" \
  "$pg_version" "${tables:-null}" "${users:-null}" "${migrations:-null}" "$app_image" "${upload_files:-null}" > "$manifest"

step="xoá bản cũ trên VPS"
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

  step="đẩy DB lên R2"
  echo "==> Đẩy DB lên $R2_DEST/db/$day_path"
  rclone copy "$day_dir" "$R2_DEST/db/$day_path"

  step="xoá bản cũ trên R2"
  while IFS= read -r old_dump; do
    echo "==> Xoá bản cũ trên R2: db/$old_dump"
    rclone deletefile "$R2_DEST/db/$old_dump"
    rclone deletefile "$R2_DEST/db/${old_dump%.dump}.json" || true
  done < <(rclone lsf -R --files-only --include '[0-9][0-9][0-9][0-9]/*/*/qlsx-*.dump' "$R2_DEST/db" | sort -r | tail -n +"$((KEEP_BACKUPS + 1))")
  rclone rmdirs "$R2_DEST/db" --leave-root

  step="đẩy file uploads lên R2"
  echo "==> Đẩy file mới trong uploads lên $R2_DEST/files"
  rclone copy "$DATA_DIR/uploads" "$R2_DEST/files"

  # Hướng dẫn khôi phục nằm ngay trong kho backup, VPS và repo mất hết vẫn đọc được.
  step="đẩy RESTORE.md lên R2"
  [[ -f "$APP_DIR/RESTORE.md" ]] && rclone copyto "$APP_DIR/RESTORE.md" "$R2_DEST/RESTORE.md"

  step="đọc dung lượng R2"
  r2_size="$(rclone size "$R2_DEST" | sed -n 's/^Total size: \([^ ]* [^ ]*\).*/\1/p')" || r2_size=""
  echo "==> Trên $R2_DEST: $r2_size"
  r2_line="☁️ Lưu trữ ngoài (R2): Đã đồng bộ, dung lượng ${r2_size:-không đọc được}"
  report_title="✅ BACKUP THÀNH CÔNG"
else
  echo "==> Bỏ qua đẩy ra ngoài: chưa cấu hình rclone remote ${R2_DEST%%:*}"
  r2_line="⚠️ Lưu trữ ngoài (R2): CHƯA ĐỒNG BỘ, chưa cấu hình rclone remote ${R2_DEST%%:*}, backup chỉ còn trên máy chủ"
  report_title="⚠️ BACKUP HOÀN TẤT, CÓ CẢNH BÁO"
fi

notify "$report_title" \
  "🗄️ Cơ sở dữ liệu: $(human_size "$dump") · ${tables:-?} bảng · ${users:-?} người dùng" \
  "📎 Tệp tải lên: ${upload_files:-?} file" \
  "$r2_line" \
  "⏱️ Thời lượng: $((SECONDS / 60)) phút $((SECONDS % 60)) giây"
