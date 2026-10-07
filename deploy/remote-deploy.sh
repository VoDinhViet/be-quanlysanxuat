#!/usr/bin/env bash
# Chạy trên VPS trong /opt/quanlysanxuat (CI copy file này cùng docker-compose.yml rồi gọi qua SSH).
#
#   bash remote-deploy.sh infra                     # bật Postgres + Redis, kiểm tra DB đã có schema
#   bash remote-deploy.sh app <image>               # image đã có sẵn trên máy
#   GHCR_USER=<user> bash remote-deploy.sh app <image>   # đọc token GHCR từ stdin rồi pull
#
# CI chạy `infra` → migrate DB (qua SSH tunnel tới Postgres) → `app`.
# `app`: pull image mới → khởi động lại app → chờ healthcheck → lỗi thì quay về image cũ.
# Rollback tay: chạy lại `app` với tag của bản muốn quay về (tag là v<số lần chạy>, ví dụ v42; xem danh sách
# bằng `docker images ghcr.io/vodinhviet/be-quanlysanxuat` hoặc tab Packages của repo).
set -euo pipefail

COMMAND="${1:?Cách dùng: remote-deploy.sh infra | app <image>}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-150}"

cd "$APP_DIR"

# Hai lần deploy không được chạy chồng lên nhau.
exec 9>/var/lock/qlsx-deploy.lock
flock -n 9 || { echo "Đang có một lần deploy khác chạy, dừng." >&2; exit 1; }

deploy_infra() {
  echo "==> Bật Postgres và Redis"
  docker compose up -d --no-build --wait --wait-timeout "$WAIT_TIMEOUT" postgres redis

  # Database mới tinh không dựng được bằng `pnpm db:migrate`: lịch sử migration đã bị squash nên file
  # 0010 trở đi cần schema có sẵn. Phải khôi phục từ bản dump trước, nếu không app sẽ chạy trên DB rỗng.
  local users_table
  users_table="$(docker compose exec -T postgres sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select to_regclass(\$\$public.users\$\$)"')"
  if [[ -z "${users_table//[[:space:]]/}" ]]; then
    echo "!!! Database trong container chưa có schema (không có bảng public.users)." >&2
    echo "!!! Khôi phục dữ liệu bằng pg_restore/psql trước, rồi chạy lại deploy." >&2
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
    # Ghi lại để `docker compose up` chạy tay sau này vẫn dùng đúng bản đang chạy.
    touch .env
    grep -v '^APP_IMAGE=' .env > .env.tmp || true
    echo "APP_IMAGE=$image" >> .env.tmp
    mv .env.tmp .env

    echo "==> Dọn image cũ hơn 72 giờ không còn container nào dùng"
    docker image prune -af --filter "until=72h" >/dev/null
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
