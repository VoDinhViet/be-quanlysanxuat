#!/usr/bin/env bash
# Clone DB prod về Postgres local (docker). Chỉ ĐỌC từ prod (pg_dump), chỉ GHI vào DB local.
# Dùng: bash deploy/local/clone-prod-db.sh [ssh-host]   (mặc định alias `qlsx-vps`)
# Chạy lại để làm mới: DB local bị xoá và dựng lại từ bản dump mới.
set -euo pipefail

VPS="${1:-qlsx-vps}"
HERE="$(cd "$(dirname "$0")" && pwd)"
COMPOSE=(docker compose -f "$HERE/docker-compose.yml")
DUMP="$(mktemp --suffix=.dump)"
trap 'rm -f "$DUMP"' EXIT

echo "==> Bật Postgres/Redis local"
"${COMPOSE[@]}" up -d --wait

echo "==> Dump DB prod qua SSH ($VPS)"
ssh "$VPS" 'cd /opt/quanlysanxuat && docker compose exec -T postgres sh -c '"'"'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl'"'" > "$DUMP"
[ -s "$DUMP" ] || { echo "Dump rỗng, dừng." >&2; exit 1; }
echo "    $(du -h "$DUMP" | cut -f1)"

echo "==> Dựng lại DB local"
"${COMPOSE[@]}" exec -T postgres psql -U qlsx -d postgres -v ON_ERROR_STOP=1 \
  -c 'DROP DATABASE IF EXISTS qlsx WITH (FORCE)' -c 'CREATE DATABASE qlsx'
"${COMPOSE[@]}" exec -T postgres pg_restore -U qlsx -d qlsx --no-owner --no-acl --exit-on-error < "$DUMP"

echo "==> Kiểm tra"
"${COMPOSE[@]}" exec -T postgres psql -U qlsx -d qlsx -Atc \
  "select 'bảng: '||count(*) from information_schema.tables where table_schema='public'" \
  -c "select 'users: '||count(*) from users"

echo "Xong. DATABASE_URL=postgresql://qlsx:qlsx@localhost:5433/qlsx  REDIS_URL=redis://localhost:6380"
