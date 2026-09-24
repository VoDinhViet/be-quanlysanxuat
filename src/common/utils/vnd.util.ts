const DIGIT_WORDS = [
  'không',
  'một',
  'hai',
  'ba',
  'bốn',
  'năm',
  'sáu',
  'bảy',
  'tám',
  'chín',
];

/** Đọc 1 khối 3 chữ số (0-999) thành chữ — `forcePadHundred` = luôn đọc "không trăm"/"lẻ" dù hàng
 * trăm bằng 0, dùng khi khối này không phải khối cao nhất (VD "1 triệu không trăm lẻ năm nghìn"). */
function readThreeDigits(value: number, forcePadHundred: boolean): string {
  const hundred = Math.floor(value / 100);
  const ten = Math.floor((value % 100) / 10);
  const unit = value % 10;
  let res = '';

  if (hundred > 0 || forcePadHundred) res += `${DIGIT_WORDS[hundred]} trăm `;

  if (ten > 1) {
    res += `${DIGIT_WORDS[ten]} mươi `;
    if (unit === 1) res += 'mốt ';
    else if (unit === 5) res += 'lăm ';
    else if (unit > 0) res += `${DIGIT_WORDS[unit]} `;
  } else if (ten === 1) {
    res += 'mười ';
    if (unit === 5) res += 'lăm ';
    else if (unit > 0) res += `${DIGIT_WORDS[unit]} `;
  } else if (hundred > 0 || forcePadHundred) {
    if (unit > 0) res += `lẻ ${DIGIT_WORDS[unit]} `;
  } else if (unit > 0) {
    res += `${DIGIT_WORDS[unit]} `;
  }

  return res;
}

/** Đọc số tiền VNĐ thành chữ (tỷ/triệu/nghìn/đồng) — làm tròn về đồng, không xử lý số âm/thập
 * phân. Dùng cho khối "Số tiền viết bằng chữ" trên các template PDF (`src/templates/`). */
export function formatVndInWords(amount: number): string {
  let remaining = Math.round(amount);
  if (remaining <= 0) return 'Không đồng chẵn.';

  const billion = Math.floor(remaining / 1_000_000_000);
  remaining %= 1_000_000_000;
  const million = Math.floor(remaining / 1_000_000);
  remaining %= 1_000_000;
  const thousand = Math.floor(remaining / 1_000);
  const unit = remaining % 1_000;

  let res = '';
  if (billion > 0) res += `${readThreeDigits(billion, false)}tỷ `;
  if (million > 0) res += `${readThreeDigits(million, billion > 0)}triệu `;
  if (thousand > 0) {
    res += `${readThreeDigits(thousand, billion > 0 || million > 0)}nghìn `;
  }
  if (unit > 0) {
    res += `${readThreeDigits(unit, billion > 0 || million > 0 || thousand > 0)}đồng`;
  } else {
    res += 'đồng';
  }

  res = res.trim().replace(/\s+/g, ' ');
  return `${res.charAt(0).toUpperCase()}${res.slice(1)} chẵn.`;
}

const VND_FORMATTER = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 0,
});

/** Format số tiền VNĐ theo chuẩn Việt Nam: làm tròn về đồng, nhóm hàng nghìn bằng dấu chấm
 * (VD `185.000.000`). */
export function formatVnd(amount: number): string {
  if (!Number.isFinite(amount)) return '0';
  return VND_FORMATTER.format(amount);
}

const QUANTITY_FORMATTER = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 3,
});

export function formatQuantity(value: number): string {
  return QUANTITY_FORMATTER.format(value);
}
