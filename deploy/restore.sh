#!/usr/bin/env bash
# Khôi phục từ backup do backup.sh tạo. Chạy trên VPS trong /opt/quanlysanxuat. Hướng dẫn đầy đủ: RESTORE.md.
#
#   bash restore.sh list                          # liệt kê các bản DB ở VPS và R2
#   bash restore.sh db --test                     # khôi phục thử bản mới nhất vào DB tạm, không đụng DB thật
#   bash restore.sh db                            # khôi phục bản mới nhất ở VPS vào DB thật (hỏi xác nhận)
#   bash restore.sh db --r2                       # như trên nhưng lấy bản mới nhất từ R2 (VPS mất bản cục bộ)
#   bash restore.sh db 2026/10/08/qlsx-0200.dump  # chọn đúng một bản (đường dẫn tính từ db/)
#   bash restore.sh files                         # kéo ảnh từ R2 về uploads (chỉ thêm, không xoá file nào)
#
# Cờ: --r2 lấy bản từ R2 thay vì VPS, --test khôi phục vào DB tạm rồi xoá, --yes bỏ qua câu hỏi xác nhận.
# Khôi phục DB thật luôn: dump DB hiện tại trước (không bị dọn theo vòng giữ 3 bản), dừng app, khôi phục, bật lại app.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${DATA_DIR:-/var/lib/quanlysanxuat}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/quanlysanxuat}"
RCLONE_CONFIG="${RCLONE_CONFIG:-/root/.config/rclone/rclone.conf}"
R2_DEST="${R2_DEST:-r2:qlsx-bk}"
UPLOADS_OWNER="${UPLOADS_OWNER:-1000:1000}"
TEST_DB="qlsx_restore_test"

cd "$APP_DIR"
umask 077
export RCLONE_CONFIG

command_name="${1:-}"
shift || true

use_r2=false
test_only=false
assume_yes=false
dump_ref=""
for arg in "$@"; do
  case "$arg" in
    --r2) use_r2=true ;;
    --test) test_only=true ;;
    --yes) assume_yes=true ;;
    -*) echo "Cờ không hợp lệ: $arg" >&2; exit 2 ;;
    *) dump_ref="$arg" ;;
  esac
done

usage() {
  sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 2
}

local_dumps() { find "$BACKUP_DIR/db" -type f -name 'qlsx-*.dump' 2> /dev/null | sed "s|^$BACKUP_DIR/db/||" | sort; }
r2_dumps() { rclone lsf -R --files-only --include '[0-9][0-9][0-9][0-9]/*/*/qlsx-*.dump' "$R2_DEST/db" 2> /dev/null | sort; }

# In nội dung file .json đi kèm một bản dump (nếu có).
show_manifest() {
  local manifest="$1"
  [[ -f "$manifest" ]] && sed 's/^/    /' "$manifest"
  return 0
}

list_backups() {
  echo "==> Trên VPS ($BACKUP_DIR/db):"
  local_dumps | sed 's/^/    /'
  echo "==> Trên R2 ($R2_DEST/db):"
  r2_dumps | sed 's/^/    /'
  local latest
  latest="$(local_dumps | tail -n 1)"
  if [[ -n "$latest" ]]; then
    echo "==> Thông tin bản mới nhất trên VPS ($latest):"
    show_manifest "$BACKUP_DIR/db/${latest%.dump}.json"
  fi
}

# Chọn file dump theo tham số; bản trên R2 được tải về thư mục tạm. In đường dẫn file ra stdout.
resolve_dump() {
  local relative_path="$dump_ref"
  if [[ "$use_r2" == true ]]; then
    [[ -n "$relative_path" && "$relative_path" != latest ]] || relative_path="$(r2_dumps | tail -n 1)"
    [[ -n "$relative_path" ]] || { echo "Không có bản nào trên $R2_DEST/db" >&2; return 1; }
    mkdir -p "$BACKUP_DIR/.restore-tmp"
    rclone copyto "$R2_DEST/db/$relative_path" "$BACKUP_DIR/.restore-tmp/$(basename "$relative_path")" >&2
    rclone copyto "$R2_DEST/db/${relative_path%.dump}.json" "$BACKUP_DIR/.restore-tmp/$(basename "${relative_path%.dump}.json")" >&2 || true
    echo "$BACKUP_DIR/.restore-tmp/$(basename "$relative_path")"
    return 0
  fi
  if [[ -z "$relative_path" || "$relative_path" == latest ]]; then
    relative_path="$(local_dumps | tail -n 1)"
    [[ -n "$relative_path" ]] || { echo "Không có bản nào trong $BACKUP_DIR/db (thử thêm --r2)" >&2; return 1; }
  fi
  if [[ -f "$relative_path" ]]; then echo "$relative_path"; else echo "$BACKUP_DIR/db/$relative_path"; fi
}

# Khôi phục file dump vào database $1 (đã tồn tại và trống hoặc cần ghi đè).
restore_into() {
  local target_db="$1" dump_file="$2" status=0
  docker compose exec -T postgres sh -c \
    "pg_restore -U \"\$POSTGRES_USER\" -d \"$target_db\" --clean --if-exists --no-owner --no-acl" < "$dump_file" || status=$?
  # pg_restore trả mã khác 0 cả khi chỉ có cảnh báo vô hại (ví dụ extension có sẵn); đọc kết quả bên dưới để chắc.
  [[ $status -eq 0 ]] || echo "!!! pg_restore trả mã $status, kiểm tra các dòng lỗi phía trên và số liệu bên dưới." >&2
}

# Đếm nhanh để đối chiếu với file .json đi kèm.
sanity_counts() {
  local target_db="$1"
  docker compose exec -T postgres sh -c \
    "psql -U \"\$POSTGRES_USER\" -d \"$target_db\" -tA -F ' ' -c \"select 'bảng public:', count(*) from information_schema.tables where table_schema='public'\" -c \"select 'users:', count(*) from users\" -c \"select 'migration đã áp dụng:', count(*) from drizzle.__drizzle_migrations\"" < /dev/null | sed 's/^/    /'
}

restore_db() {
  local dump_file
  dump_file="$(resolve_dump)"
  [[ -f "$dump_file" ]] || { echo "Không thấy file $dump_file" >&2; exit 1; }
  echo "==> Dùng bản: $dump_file ($(du -h "$dump_file" | cut -f1))"
  show_manifest "${dump_file%.dump}.json"
  docker compose exec -T postgres pg_restore --list < "$dump_file" > /dev/null || { echo "File dump hỏng, dừng." >&2; exit 1; }

  echo "==> Bật Postgres"
  docker compose up -d --no-build --wait postgres

  if [[ "$test_only" == true ]]; then
    echo "==> Khôi phục thử vào DB tạm $TEST_DB (DB thật không bị đụng)"
    docker compose exec -T postgres sh -c \
      "psql -U \"\$POSTGRES_USER\" -d postgres -c 'DROP DATABASE IF EXISTS $TEST_DB' -c 'CREATE DATABASE $TEST_DB'" < /dev/null > /dev/null
    restore_into "$TEST_DB" "$dump_file"
    echo "==> Số liệu trong DB tạm:"
    sanity_counts "$TEST_DB"
    docker compose exec -T postgres sh -c \
      "psql -U \"\$POSTGRES_USER\" -d postgres -c 'DROP DATABASE $TEST_DB'" < /dev/null > /dev/null
    echo "==> Xong, đã xoá DB tạm. Đối chiếu số liệu với file .json ở trên."
    return 0
  fi

  if [[ "$assume_yes" != true ]]; then
    echo
    echo "CẢNH BÁO: sẽ GHI ĐÈ toàn bộ database hiện tại bằng bản trên và dừng app trong lúc khôi phục."
    read -rp "Gõ RESTORE để tiếp tục: " confirmation
    [[ "$confirmation" == RESTORE ]] || { echo "Đã huỷ."; exit 1; }
  fi

  local safety_dump="$BACKUP_DIR/pre-restore/pre-restore-$(date +%Y%m%d-%H%M%S).dump"
  mkdir -p "$(dirname "$safety_dump")"
  echo "==> Dump DB hiện tại trước khi ghi đè: $safety_dump"
  docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' < /dev/null > "$safety_dump" \
    || echo "!!! Không dump được DB hiện tại (DB trống hoặc chưa có?), tiếp tục." >&2

  echo "==> Dừng app"
  docker compose stop app || true
  echo "==> Khôi phục vào DB thật"
  local real_db
  real_db="$(docker compose exec -T postgres sh -c 'printf %s "$POSTGRES_DB"' < /dev/null)"
  restore_into "$real_db" "$dump_file"
  echo "==> Số liệu sau khôi phục:"
  sanity_counts "$real_db"

  echo "==> Bật app"
  docker compose up -d --no-build --wait redis app
  rm -rf "$BACKUP_DIR/.restore-tmp"
  echo "==> Xong. Nhớ khôi phục cả ảnh nếu thư mục uploads trống: bash restore.sh files"
}

restore_files() {
  mkdir -p "$DATA_DIR/uploads"
  echo "==> Kéo ảnh từ $R2_DEST/files về $DATA_DIR/uploads (chỉ thêm file thiếu)"
  rclone copy "$R2_DEST/files" "$DATA_DIR/uploads" --progress
  chown -R "$UPLOADS_OWNER" "$DATA_DIR/uploads"
  echo "==> Xong: $(find "$DATA_DIR/uploads" -type f | wc -l) file trong $DATA_DIR/uploads"
}

case "$command_name" in
  list) list_backups ;;
  db) restore_db ;;
  files) restore_files ;;
  *) usage ;;
esac
