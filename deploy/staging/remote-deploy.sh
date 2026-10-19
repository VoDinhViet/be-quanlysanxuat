#!/usr/bin/env bash
# Chạy trên VPS trong /opt/qlsx-staging (CI copy file này cùng docker-compose.yml rồi gọi qua SSH).
# Bản sao của deploy/remote-deploy.sh cho môi trường test; không đụng container hay image của prod.
#
#   bash remote-deploy.sh infra                          # bật Postgres + Redis
#   GHCR_USER=<user> bash remote-deploy.sh app <image>   # đọc token GHCR từ stdin rồi pull; bỏ GHCR_USER nếu image đã có sẵn
#
# CI chạy `infra` → migrate DB (qua SSH tunnel tới cổng 5442) → `app`.
# `app`: pull image → khởi động lại app → chờ healthcheck → lỗi thì quay về image cũ.
# Tag image staging là staging-v<số lần chạy>; rollback tay bằng cách chạy lại `app` với tag cần quay về.
set -euo pipefail

COMMAND="${1:?Cách dùng: remote-deploy.sh infra | app <image>}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${STAGING_DATA_DIR:-/var/lib/qlsx-staging}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-150}"

cd "$APP_DIR"

exec 9>/var/lock/qlsx-staging-deploy.lock
flock -n 9 || { echo "Đang có một lần deploy staging khác chạy, dừng." >&2; exit 1; }

deploy_infra() {
  echo "==> Tạo thư mục dữ liệu"
  mkdir -p "$DATA_DIR/postgres" "$DATA_DIR/redis" "$DATA_DIR/uploads"
  chown -R 1000:1000 "$DATA_DIR/uploads"

  echo "==> Bật Postgres và Redis"
  docker compose up -d --no-build --wait --wait-timeout "$WAIT_TIMEOUT" postgres redis

  # DB trống không dựng được bằng `pnpm db:migrate` (lịch sử migration đã squash). Dựng bằng
  # refresh-from-prod.sh trước, nếu không app sẽ chạy trên DB rỗng.
  local users_table
  users_table="$(docker compose exec -T postgres sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select to_regclass(\$\$public.users\$\$)"')"
  if [[ -z "${users_table//[[:space:]]/}" ]]; then
    echo "!!! DB staging chưa có schema (không có bảng public.users)." >&2
    echo "!!! Chạy: bash refresh-from-prod.sh rồi chạy lại deploy." >&2
    exit 1
  fi
  echo "==> Postgres và Redis sẵn sàng"
}

deploy_app() {
  local image="${1:?Cách dùng: remote-deploy.sh app <image>}"

  if [[ -n "${GHCR_USER:-}" ]]; then
    trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
    docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
  fi

  echo "==> Pull $image"
  docker pull "$image"

  local prev_container prev_image=""
  prev_container="$(docker compose ps -q app || true)"
  if [[ -n "$prev_container" ]]; then
    prev_image="$(docker inspect "$prev_container" --format '{{.Config.Image}}')"
  fi
  echo "==> Bản đang chạy: ${prev_image:-<chưa có>}"

  echo "==> Khởi động $image"
  if APP_IMAGE="$image" docker compose up -d --no-build --wait --wait-timeout "$WAIT_TIMEOUT" app; then
    touch .env
    grep -v '^APP_IMAGE=' .env > .env.tmp || true
    echo "APP_IMAGE=$image" >> .env.tmp
    mv .env.tmp .env
    # Không prune image toàn máy: image của prod nằm chung Docker daemon và không được đụng tới.
    echo "==> Deploy xong: $image"
    return 0
  fi

  echo "!!! Bản mới không healthy sau ${WAIT_TIMEOUT}s. 100 dòng log cuối:" >&2
  docker compose logs --tail 100 app >&2 || true

  if [[ -z "$prev_image" ]]; then
    echo "!!! Không có bản trước để quay lại." >&2
    return 1
  fi

  echo "==> Rollback về $prev_image" >&2
  APP_IMAGE="$prev_image" docker compose up -d --no-build --wait --wait-timeout "$WAIT_TIMEOUT" app >&2
  echo "!!! Đã quay về $prev_image, lần deploy này thất bại." >&2
  return 1
}

case "$COMMAND" in
  infra) deploy_infra ;;
  app) deploy_app "${2:-}" ;;
  *) echo "Lệnh không hợp lệ: $COMMAND (infra | app)" >&2; exit 2 ;;
esac
