#!/usr/bin/env bash
# Làm mới dữ liệu môi trường test từ prod. Chạy trên VPS trong /opt/qlsx-staging.
#
#   STAGING_PASSWORD='<mật khẩu test>' bash refresh-from-prod.sh [--yes]
#
# Prod chỉ được ĐỌC: `pg_dump` từ container qlsx-postgres và `rsync` từ thư mục uploads của prod. Mọi thao tác ghi
# (xoá DB, restore, đặt lại mật khẩu, xoá file thừa) chỉ nhắm vào container qlsx-staging-postgres và thư mục
# dữ liệu staging. Dùng khi dựng staging lần đầu và khi muốn đưa dữ liệu mới của prod sang.
#
# Sau khi restore, MỌI tài khoản trong bảng credentials bị đặt lại thành STAGING_PASSWORD, nên không ai đăng nhập
# staging được bằng mật khẩu thật. Token JWT của prod cũng vô dụng vì staging có secret riêng.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${STAGING_DATA_DIR:-/var/lib/qlsx-staging}"
PROD_UPLOADS="${PROD_UPLOADS_DIR:-/var/lib/quanlysanxuat/uploads}"
PROD_POSTGRES="qlsx-postgres"
STAGING_POSTGRES="qlsx-staging-postgres"
STAGING_PASSWORD="${STAGING_PASSWORD:?Đặt STAGING_PASSWORD (mật khẩu test cho mọi tài khoản, tối thiểu 8 ký tự)}"

[[ ${#STAGING_PASSWORD} -ge 8 ]] || { echo "STAGING_PASSWORD phải từ 8 ký tự." >&2; exit 2; }
[[ "$DATA_DIR" != "$(dirname "$PROD_UPLOADS")" && "$APP_DIR" != "/opt/quanlysanxuat" ]] \
  || { echo "Thư mục staging trùng prod, dừng." >&2; exit 1; }

assume_yes=false
[[ "${1:-}" == "--yes" ]] && assume_yes=true

cd "$APP_DIR"
umask 077
dump_file="$(mktemp /tmp/qlsx-staging-refresh.XXXXXX.dump)"
trap 'rm -f "$dump_file"' EXIT

docker inspect "$PROD_POSTGRES" > /dev/null || { echo "Không thấy container $PROD_POSTGRES." >&2; exit 1; }

echo "==> Bật Postgres staging"
mkdir -p "$DATA_DIR/postgres" "$DATA_DIR/redis" "$DATA_DIR/uploads"
docker compose up -d --no-build --wait postgres redis
[[ "$(docker compose ps -q postgres | xargs docker inspect --format '{{.Name}}')" == "/$STAGING_POSTGRES" ]] \
  || { echo "Container Postgres của compose không phải $STAGING_POSTGRES, dừng." >&2; exit 1; }

if ! $assume_yes; then
  read -r -p "Xoá DB staging và thay bằng dữ liệu prod (mật khẩu mọi tài khoản đặt lại)? [y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || { echo "Huỷ."; exit 0; }
fi

echo "==> Dump DB prod (chỉ đọc)"
docker exec "$PROD_POSTGRES" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$dump_file"
docker compose exec -T postgres pg_restore --list < "$dump_file" > /dev/null || { echo "File dump hỏng, dừng." >&2; exit 1; }

echo "==> Dừng app staging và dựng lại DB staging"
docker compose stop app > /dev/null 2>&1 || true
docker compose exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists \"$POSTGRES_DB\" with (force)" -c "create database \"$POSTGRES_DB\""'

status=0
docker compose exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl' < "$dump_file" || status=$?
# pg_restore trả mã khác 0 cả khi chỉ có cảnh báo vô hại; số liệu đối chiếu bên dưới mới là bằng chứng.
[[ $status -eq 0 ]] || echo "!!! pg_restore trả mã $status, xem các dòng lỗi phía trên và số liệu bên dưới." >&2

echo "==> Đặt lại mật khẩu mọi tài khoản staging"
# pgcrypto cho hash $2a$ mà bcryptjs của app so khớp được; extension chỉ tồn tại trong lúc đặt lại.
docker compose exec -T -e STAGING_PASSWORD postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v pw="$STAGING_PASSWORD"' << 'SQL'
create extension if not exists pgcrypto;
update credentials set password = crypt(:'pw', gen_salt('bf', 10)), updated_at = now();
drop extension pgcrypto;
SQL

echo "==> Đồng bộ uploads (chỉ đọc từ prod)"
rsync -a --delete "$PROD_UPLOADS/" "$DATA_DIR/uploads/"
chown -R 1000:1000 "$DATA_DIR/uploads"

if grep -q '^APP_IMAGE=' .env 2> /dev/null; then
  echo "==> Bật lại app staging"
  docker compose up -d --no-build --wait app
else
  echo "==> Chưa có APP_IMAGE (chưa deploy lần nào); app sẽ lên khi CI deploy."
fi

echo "==> Đối chiếu số bản ghi prod / staging"
for table in users credentials purchase_requests inventory_receipts payment_requests; do
  prod_count="$(docker exec "$PROD_POSTGRES" sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc 'select count(*) from $table'")"
  staging_count="$(docker compose exec -T postgres sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc 'select count(*) from $table'")"
  printf '    %-22s prod=%s staging=%s\n' "$table" "$prod_count" "$staging_count"
done
echo "==> Xong. Mọi tài khoản staging dùng mật khẩu bạn vừa đặt."
