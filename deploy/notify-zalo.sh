#!/usr/bin/env bash
# Gửi tin Zalo Bot cho admin. Cài tay ở /opt/quanlysanxuat (CI không copy), cần curl và jq.
#
#   notify-zalo.sh --maintenance "22:00-23:00 ngày 16/10/2026" "Nâng cấp máy chủ" ["Ảnh hưởng"]
#   notify-zalo.sh "Nội dung bất kỳ"                         # thông báo chung
#   notify-zalo.sh --report "<tiêu đề>" "Nhãn: giá trị" ...  # báo cáo có khung chuẩn (backup.sh dùng)
#   notify-zalo.sh --updates                                 # in chat_id của người vừa nhắn bot
# Mọi tin gửi tới các chat_id trong ZALO_CHAT_IDS, cùng một khung: tiêu đề, các dòng "Nhãn: giá trị", chân tin.
#
# Đọc $ZALO_ENV (mặc định zalo.env cạnh script, chmod 600, không có trong repo):
#   ZALO_BOT_TOKEN=<số:chuỗi>
#   ZALO_CHAT_IDS=<id1>,<id2>
# Gửi tin không bao giờ làm lệnh gọi nó thất bại (luôn thoát 0): thông báo hỏng không được làm hỏng backup.
# Không in URL và không bật `set -x`, vì token nằm trong URL.
set -uo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZALO_ENV="${ZALO_ENV:-$APP_DIR/zalo.env}"
API_BASE="https://bot-api.zaloplatforms.com"
MAX_TEXT_CHARS=2000
SEPARATOR='━━━━━━━━━━━━━━━━━━'
CURL_TIMEOUT=15

warn() { echo "notify-zalo: $*" >&2; }

# Đọc đúng hai khoá thay vì `source`: cron chạy bằng root, `source` sẽ biến file này thành mã chạy với quyền root.
read_env_value() { grep -m1 "^$1=" "$ZALO_ENV" 2> /dev/null | cut -d= -f2- | tr -d "\"'\r"; }
if [[ -f "$ZALO_ENV" ]]; then
  ZALO_BOT_TOKEN="${ZALO_BOT_TOKEN:-$(read_env_value ZALO_BOT_TOKEN)}"
  ZALO_CHAT_IDS="${ZALO_CHAT_IDS:-$(read_env_value ZALO_CHAT_IDS)}"
fi

if [[ -z "${ZALO_BOT_TOKEN:-}" ]]; then
  warn "chưa có ZALO_BOT_TOKEN (khai báo trong $ZALO_ENV), bỏ qua."
  exit 0
fi
# Token đi vào chuỗi config của curl: chỉ nhận đúng dạng <số>:<chuỗi> để ký tự lạ không chèn được directive.
if [[ ! "$ZALO_BOT_TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
  warn "ZALO_BOT_TOKEN sai định dạng (cần <số>:<chuỗi>), bỏ qua."
  exit 0
fi
if ! command -v jq > /dev/null || ! command -v curl > /dev/null; then
  warn "thiếu jq hoặc curl, bỏ qua."
  exit 0
fi

# Token nằm trong URL nên đưa URL qua stdin (-K -) để không lộ ở `ps`.
call_api() {
  local method="$1" body="$2"
  printf 'url = "%s/bot%s/%s"\n' "$API_BASE" "$ZALO_BOT_TOKEN" "$method" |
    curl -s --fail --max-time "$CURL_TIMEOUT" -K - \
      -H 'Content-Type: application/json' -d "$body" 2> /dev/null
}

list_updates() {
  local response
  # timeout ngắn để lệnh trả về nhanh thay vì chờ long-poll 30 giây.
  # API trả HTTP 200 kèm {"ok":false,...} khi sai token, nên phải kiểm tra trường `ok`.
  response="$(call_api getUpdates '{"timeout":"3"}')" || response=""
  # Không có tin nào đang chờ thì API trả lỗi 408 "Request timeout", không phải lỗi token.
  if echo "$response" | jq -e '.error_code == 408' > /dev/null 2>&1; then
    echo "Chưa có tin nào: nhắn bot một tin trên Zalo rồi chạy lại."
    return 0
  fi
  if ! echo "$response" | jq -e '.ok == true' > /dev/null 2>&1; then
    warn "getUpdates lỗi: $(echo "${response:-}" | jq -r '.description // empty' 2> /dev/null) - sai token, hoặc đang đặt webhook (gọi deleteWebhook trước)."
    return 0
  fi
  echo "$response" | jq -r '
    [.result] | flatten | map(select(type == "object" and .message != null))
    | if length == 0 then "Chưa có tin nào: nhắn bot một tin trên Zalo rồi chạy lại."
      else .[] | "chat_id=\(.message.chat.id)  tên=\(.message.from.display_name // "?")  tin=\(.message.text // "")" end
    | gsub("[[:cntrl:]]"; " ")'  # ai cũng nhắn được bot: bỏ ký tự điều khiển trước khi in ra terminal
}

# Khung tin: tiêu đề, đường kẻ, các dòng nội dung, đường kẻ, chân tin (máy chủ và giờ gửi).
build_report() {
  local title="$1" line message
  shift
  message="$title"$'\n'"$SEPARATOR"
  for line in "$@"; do
    message+=$'\n'"$line"
  done
  message+=$'\n'"$SEPARATOR"$'\n'"🖥️ QLSX · $(hostname -s 2> /dev/null || echo vps) · $(date '+%d/%m/%Y %H:%M')"
  printf '%s' "$message"
}

send_text() {
  local text="$1" chat_id payload sent=0 failed=0
  if [[ -z "${ZALO_CHAT_IDS:-}" ]]; then
    warn "chưa có ZALO_CHAT_IDS (khai báo trong $ZALO_ENV), bỏ qua."
    return 0
  fi

  IFS=',' read -ra chat_ids <<< "$ZALO_CHAT_IDS"
  for chat_id in "${chat_ids[@]}"; do
    chat_id="${chat_id//[[:space:]]/}"
    [[ -z "$chat_id" ]] && continue
    # Cắt bằng jq (theo ký tự Unicode): cron không có LANG nên bash cắt theo byte, dễ chém đôi chữ tiếng Việt.
    payload="$(jq -n --arg chat_id "$chat_id" --arg text "$text" --argjson max "$MAX_TEXT_CHARS" \
      '{chat_id: $chat_id, text: $text[:$max]}')"
    if call_api sendMessage "$payload" | jq -e '.ok == true' > /dev/null 2>&1; then
      sent=$((sent + 1))
    else
      failed=$((failed + 1))
      warn "gửi tới $chat_id lỗi."
    fi
  done
  echo "notify-zalo: đã gửi $sent, lỗi $failed."
}

case "${1:-}" in
  --updates) list_updates ;;
  --report)
    shift
    send_text "$(build_report "$@")"
    ;;
  --maintenance)
    if (($# < 3)); then
      warn "cách dùng: notify-zalo.sh --maintenance \"<thời gian>\" \"<nội dung>\" [\"<ảnh hưởng>\"]"
    else
      send_text "$(build_report "🛠️ THÔNG BÁO BẢO TRÌ HỆ THỐNG" \
        "🕒 Thời gian: $2" \
        "📋 Nội dung: $3" \
        "⚠️ Ảnh hưởng: ${4:-Hệ thống tạm thời không truy cập được trong thời gian bảo trì}" \
        "" \
        "Xin lỗi vì sự bất tiện này.")"
    fi
    ;;
  "") warn "cách dùng: notify-zalo.sh \"nội dung\" | --maintenance | --report | --updates" ;;
  *) send_text "$(build_report "📢 THÔNG BÁO HỆ THỐNG" "$*")" ;;
esac
exit 0
