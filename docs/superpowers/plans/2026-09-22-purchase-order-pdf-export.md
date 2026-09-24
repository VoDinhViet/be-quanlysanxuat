# Xuất PDF đơn mua hàng (Purchase Order) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm `GET /purchase-orders/:purchaseOrderId/export-pdf` trả file PDF render từ
`src/templates/purchase-order.html` (Handlebars thật) + dữ liệu PO thật, VAT/subtotal/tổng tiền/đọc
số thành chữ tính ở server (TypeScript), không phụ thuộc script client trong file HTML.

**Architecture:** Controller mỏng → `PurchaseOrdersService.exportPurchaseOrderPdf` (tái dùng raw
fetch tách từ `getPurchaseOrder`, tự tính subtotal/VAT/tổng tiền/đọc số) → context phẳng →
`PdfRendererService.render` (Puppeteer, 1 browser sống suốt vòng đời app + cache Handlebars compile)
→ `StreamableFile` (`application/pdf`).

**Tech Stack:** NestJS 11, Drizzle ORM, `handlebars` ^4.7.9, `puppeteer` ^25.11.0 (đã có trong
`package.json`, chưa dùng ở đâu).

**Spec:** `docs/superpowers/specs/2026-09-22-purchase-order-pdf-export-design.md`

## Global Constraints

- Không viết `*.spec.ts`, không chạy `pnpm test*` (`docs/decisions/testing-paused.md`) — mỗi task
  thay bước TDD bằng: sửa code → `npx tsc --noEmit` → xác minh thủ công (build/node script) → không
  tự commit.
- Không tự `git commit` bất kỳ bước nào trừ khi người dùng yêu cầu rõ (`.claude/rules/general.md`).
- Comment code: tiếng Việt, ≤ 6 dòng, chỉ khi qua 1 trong 4 test ở
  `.claude/rules/documentation.md`.
- DTO dùng field decorator composite (`src/decorators/field.decorators.ts`), không hand-roll
  `class-validator`. Response DTO `@Exclude()` + mọi field `@Expose()`.
- Controller handler mỏng — `return this.xService.method(...)`, không branching.
- Service ném lỗi qua `new AppException(ErrorCode.Exxx, HttpStatus.XXX)`, mã mới thêm vào
  `src/constants/error-code.constant.ts`.
- Mã lỗi tiếp theo còn trống là **`E274`** (đã xác nhận lại: `E273` là mã cao nhất đang dùng, `E272`
  là số đã nghỉ hưu/bỏ qua) — spec cũ ghi nhầm `E276`, plan này dùng `E274`.
- Verification cuối đợt: `npx tsc --noEmit` + `pnpm lint` + `pnpm build` (một lần, sau khi xong hết
  task, không chạy sau mỗi sửa nhỏ).

---

## File Structure

| File | Vai trò |
| --- | --- |
| `src/templates/purchase-order.html` (sửa) | Chuyển dữ liệu mẫu cứng → token Handlebars thật; bỏ script tính tiền client + toolbar không dùng tới. |
| `src/common/utils/vietnamese-number.util.ts` (mới) | `readAmountInWords` (đọc số tiền thành chữ) + `formatVndAmount` (nhóm hàng nghìn, làm tròn đồng) — hàm thuần, không phụ thuộc DB/request. |
| `src/templates/pdf-renderer.service.ts` (mới) | Vòng đời Puppeteer (1 browser sống suốt app) + cache compile Handlebars theo `FormTemplateType` + `render()`. |
| `src/templates/templates.module.ts` (mới) | Export `PdfRendererService` cho module khác import. |
| `src/api/purchase-orders/types/purchase-order-pdf-context.type.ts` (mới) | Shape phẳng truyền vào Handlebars — 1 type cho dòng, 1 type cho toàn bộ context. |
| `src/api/purchase-orders/purchase-orders.service.ts` (sửa) | Tách `getPurchaseOrderEntity` (raw fetch dùng chung) khỏi `getPurchaseOrder`; thêm `exportPurchaseOrderPdf`. |
| `src/api/purchase-orders/dto/export-purchase-order-pdf.req.dto.ts` (mới) | Query DTO `vatPercent` optional, `[0,100]`. |
| `src/api/purchase-orders/purchase-orders.controller.ts` (sửa) | Thêm route `GET :purchaseOrderId/export-pdf`. |
| `src/api/purchase-orders/purchase-orders.module.ts` (sửa) | Import `TemplatesModule`. |
| `src/constants/error-code.constant.ts` (sửa) | Thêm `E274` (lỗi render PDF). |

---

## Task 1: Đổi tên `ORDER` → `PURCHASE_ORDER` (đã hoàn tất)

**Files:**
- Modify: `src/templates/form-templates.registry.ts`
- Modify: `docs/decisions/form-templates-storage.md`
- Rename: `src/templates/order.html` → `src/templates/purchase-order.html`

**Interfaces:**
- Produces: `FormTemplateType.PURCHASE_ORDER`, `getFormTemplatePath(FormTemplateType.PURCHASE_ORDER)`
  → `.../dist/src/templates/purchase-order.html` — dùng ở Task 4/5.

- [x] **Step 1:** `mv src/templates/order.html src/templates/purchase-order.html`.
- [x] **Step 2:** `form-templates.registry.ts`: enum `ORDER` → `PURCHASE_ORDER`, `fileName:
  'purchase-order.html'`, cập nhật 2 comment nhắc tên cũ.
- [x] **Step 3:** `docs/decisions/form-templates-storage.md`: sửa mọi chỗ nhắc `ORDER`/`order.html`
  sang `PURCHASE_ORDER`/`purchase-order.html`.
- [x] **Step 4:** Xác minh: `pnpm build` → `find dist -iname "*.html"` → phải thấy
  `dist/src/templates/purchase-order.html` → `node -e` gọi `getFormTemplatePath` xác nhận
  `existsSync` true → `rm -rf dist` dọn lại.

---

## Task 2: Utility đọc số tiền thành chữ + format VNĐ

**Files:**
- Create: `src/common/utils/vietnamese-number.util.ts`

**Interfaces:**
- Produces: `readAmountInWords(amount: number): string`, `formatVndAmount(amount: number): string`
  — dùng ở Task 5 (`purchase-orders.service.ts`) và Task 3 (không trực tiếp, chỉ tham chiếu số ví
  dụ khi soát template).

- [x] **Step 1: Viết file**

```ts
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
 * phân. Dùng cho khối "Số tiền viết bằng chữ" trên PDF PO (`purchase-order.html`). */
export function readAmountInWords(amount: number): string {
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

/** Format số tiền VNĐ: làm tròn về đồng, nhóm hàng nghìn bằng dấu phẩy (khớp cách trình bày gốc
 * của mockup `purchase-order.html`, VD `185,000,000`). */
export function formatVndAmount(amount: number): string {
  return Math.round(amount).toLocaleString('en-US');
}
```

- [x] **Step 2: Xác minh bằng build + node smoke check (không viết test file)**

```bash
npx tsc --noEmit
pnpm build
node -e "
const { readAmountInWords, formatVndAmount } = require('./dist/src/common/utils/vietnamese-number.util');
console.log(formatVndAmount(269500000));
console.log(readAmountInWords(269500000));
console.log(readAmountInWords(1234567));
console.log(readAmountInWords(0));
"
rm -rf dist
```

Expected:
```
269,500,000
Hai trăm sáu mươi chín triệu năm trăm nghìn đồng chẵn.
Một triệu hai trăm ba mươi bốn nghìn năm trăm sáu mươi bảy đồng chẵn.
Không đồng chẵn.
```

Đây là bước xác minh thủ công thay TDD (repo cấm `*.spec.ts`/`pnpm test*`,
`docs/decisions/testing-paused.md`) — không bỏ qua bước này, output sai nghĩa là thuật toán port
sai, phải sửa lại trước khi sang Task 3.

---

## Task 3: Chuyển `purchase-order.html` sang Handlebars thật

**Files:**
- Modify: `src/templates/purchase-order.html`

**Interfaces:**
- Consumes: không (chỉ sửa HTML tĩnh).
- Produces: template đọc đúng các key của `PurchaseOrderPdfContext` (Task 4) khi Task 5 gọi
  `PdfRendererService.render`. Token cấp 1: `code`, `orderDate`, `supplierName`, `supplierAddress`,
  `subtotal`, `vatPercent`, `vatAmount`, `grandTotal`, `amountInWords`, `assignedUserName`,
  `ordererName`. Mảng `items[]`, mỗi dòng: `stt`, `itemCode`, `purchaseRequestCode`, `itemName`,
  `unitName`, `quantity`, `unitPrice`, `lineTotal`, `neededDate`, `note`.

File này 903 dòng, có 2 dòng base64 logo (~60KB/dòng, không đụng tới). Mọi `old_string` dưới đây là
nguyên văn đã đọc trực tiếp từ file — copy đúng để `Edit` khớp.

- [x] **Step 1: Bỏ toolbar màn hình không dùng tới**

Toolbar chỉ hiện khi xem trực tiếp trong trình duyệt (`.no-print`, không bao giờ vào PDF), nhưng
trỏ tới 2 file không tồn tại trong repo (`lenh_san_xuat.html`, `tong_hop_don_hang.html`) — dead
link, không còn ý nghĩa khi file này chỉ còn là nguồn render cho Puppeteer. Xoá hẳn.

```
OLD:
<body>
  <!-- THANH ĐIỀU KHIỂN CHUYỂN TRANG NGOÀI KHỔ GIẤY (ẨN KHI IN) -->
  <aside class="screen-toolbar no-print">
    <div><strong>TIẾN HUY MOLD • ĐƠN HÀNG (BM-01/KD)</strong></div>
    <div class="nav-pills">
      <a href="don_hang.html" class="tab-btn active">📄 1. ĐƠN HÀNG (PO)</a>
      <a href="lenh_san_xuat.html" class="tab-btn">⚙️ 2. LỆNH SẢN XUẤT</a>
      <a href="tong_hop_don_hang.html" class="tab-btn">📊 3. TỔNG HỢP ĐƠN HÀNG</a>
    </div>
    <button class="btn-print-action" onclick="window.print()">🖨️ In Biểu Mẫu (A4)</button>
  </aside>

  <div class="form-wrapper">

NEW:
<body>
  <div class="form-wrapper">
```

- [x] **Step 2: Meta grid — nhãn khách hàng → NCC, giá trị cứng → token**

```
OLD:
          <div>
            <div class="meta-row-item">
              <span class="meta-item-lbl">Tên khách hàng <span>/Customer:</span></span>
              <div class="meta-item-val font-semibold" contenteditable="true">CÔNG TY TNHH NHỰA & KHUÔN MẪU ĐỒNG NAI</div>
            </div>
            <div class="meta-row-item">
              <span class="meta-item-lbl">Địa chỉ <span>/Address:</span></span>
              <div class="meta-item-val" contenteditable="true">Đường số 3, KCN Sông Mây, Huyện Trảng Bom, Tỉnh Đồng Nai</div>
            </div>
          </div>

          <div>
            <div class="meta-row-item">
              <span class="meta-item-lbl">Số PO <span>/P.O No:</span></span>
              <div class="meta-item-val font-bold font-mono" style="color: var(--navy);" contenteditable="true">PO-TH-2026/0912</div>
            </div>
            <div class="meta-row-item">
              <span class="meta-item-lbl">Ngày tạo đơn <span>/Date:</span></span>
              <div class="meta-item-val font-mono" id="po-date-input" contenteditable="true">22/09/2026</div>
            </div>
          </div>

NEW:
          <div>
            <div class="meta-row-item">
              <span class="meta-item-lbl">Nhà cung cấp <span>/Supplier:</span></span>
              <div class="meta-item-val font-semibold">{{supplierName}}</div>
            </div>
            <div class="meta-row-item">
              <span class="meta-item-lbl">Địa chỉ <span>/Address:</span></span>
              <div class="meta-item-val">{{supplierAddress}}</div>
            </div>
          </div>

          <div>
            <div class="meta-row-item">
              <span class="meta-item-lbl">Số PO <span>/P.O No:</span></span>
              <div class="meta-item-val font-bold font-mono" style="color: var(--navy);">{{code}}</div>
            </div>
            <div class="meta-row-item">
              <span class="meta-item-lbl">Ngày tạo đơn <span>/Date:</span></span>
              <div class="meta-item-val font-mono">{{orderDate}}</div>
            </div>
          </div>
```

- [x] **Step 3: Bảng dòng — 5 `<tr>` mẫu cứng → `{{#each items}}`**

```
OLD:
          <tbody>
            <tr>
              <td class="text-center font-bold">1</td>
              <td><div class="cell-edit text-center font-mono" contenteditable="true">KM-TH-010</div></td>
              <td><div class="cell-edit text-center font-mono" contenteditable="true">PR-2026-08</div></td>
              <td><div class="cell-edit text-left font-semibold" contenteditable="true">Khuôn ép nhựa nắp hộp thực phẩm định hình 4 cavities</div></td>
              <td><div class="cell-edit text-center" contenteditable="true">Bộ</div></td>
              <td><div class="cell-edit text-right font-bold cell-qty font-mono" contenteditable="true" oninput="recalcPO()">1</div></td>
              <td><div class="cell-edit text-right font-mono cell-price" contenteditable="true" onblur="formatPriceCell(this)" oninput="recalcPO()">185,000,000</div></td>
              <td><div class="cell-edit text-right font-bold font-mono cell-amount" style="color: var(--navy);">185,000,000</div></td>
              <td><div class="cell-edit text-center font-mono" contenteditable="true">28/09/2026</div></td>
              <td><div class="cell-edit text-left" contenteditable="true">Thép NAK80</div></td>
            </tr>
            <tr>
              <td class="text-center font-bold">2</td>
              <td><div class="cell-edit text-center font-mono" contenteditable="true">KM-TH-012</div></td>
              <td><div class="cell-edit text-center font-mono" contenteditable="true">PR-2026-09</div></td>
              <td><div class="cell-edit text-left font-semibold" contenteditable="true">Gia công chi tiết chốt dẫn hướng SKD11</div></td>
              <td><div class="cell-edit text-center" contenteditable="true">Cái</div></td>
              <td><div class="cell-edit text-right font-bold cell-qty font-mono" contenteditable="true" oninput="recalcPO()">12</div></td>
              <td><div class="cell-edit text-right font-mono cell-price" contenteditable="true" onblur="formatPriceCell(this)" oninput="recalcPO()">3,500,000</div></td>
              <td><div class="cell-edit text-right font-bold font-mono cell-amount" style="color: var(--navy);">42,000,000</div></td>
              <td><div class="cell-edit text-center font-mono" contenteditable="true">25/09/2026</div></td>
              <td><div class="cell-edit text-left" contenteditable="true">HRC 58-60</div></td>
            </tr>
            <tr>
              <td class="text-center font-bold">3</td>
              <td><div class="cell-edit text-center font-mono" contenteditable="true">KM-TH-015</div></td>
              <td><div class="cell-edit text-center font-mono" contenteditable="true">PR-2026-10</div></td>
              <td><div class="cell-edit text-left font-semibold" contenteditable="true">Gia công tấm trượt đồng hợp kim tự bôi trơn</div></td>
              <td><div class="cell-edit text-center" contenteditable="true">Cái</div></td>
              <td><div class="cell-edit text-right font-bold cell-qty font-mono" contenteditable="true" oninput="recalcPO()">8</div></td>
              <td><div class="cell-edit text-right font-mono cell-price" contenteditable="true" onblur="formatPriceCell(this)" oninput="recalcPO()">2,250,000</div></td>
              <td><div class="cell-edit text-right font-bold font-mono cell-amount" style="color: var(--navy);">18,000,000</div></td>
              <td><div class="cell-edit text-center font-mono" contenteditable="true">26/09/2026</div></td>
              <td><div class="cell-edit text-left" contenteditable="true">Ra 0.8</div></td>
            </tr>
            <tr>
              <td class="text-center font-bold">4</td>
              <td><div class="cell-edit text-center font-mono" contenteditable="true"></div></td>
              <td><div class="cell-edit text-center font-mono" contenteditable="true"></div></td>
              <td><div class="cell-edit text-left font-semibold" contenteditable="true"></div></td>
              <td><div class="cell-edit text-center" contenteditable="true"></div></td>
              <td><div class="cell-edit text-right font-bold cell-qty font-mono" contenteditable="true" oninput="recalcPO()"></div></td>
              <td><div class="cell-edit text-right font-mono cell-price" contenteditable="true" onblur="formatPriceCell(this)" oninput="recalcPO()"></div></td>
              <td><div class="cell-edit text-right font-bold font-mono cell-amount"></div></td>
              <td><div class="cell-edit text-center font-mono" contenteditable="true"></div></td>
              <td><div class="cell-edit text-left" contenteditable="true"></div></td>
            </tr>
            <tr>
              <td class="text-center font-bold">5</td>
              <td><div class="cell-edit text-center font-mono" contenteditable="true"></div></td>
              <td><div class="cell-edit text-center font-mono" contenteditable="true"></div></td>
              <td><div class="cell-edit text-left font-semibold" contenteditable="true"></div></td>
              <td><div class="cell-edit text-center" contenteditable="true"></div></td>
              <td><div class="cell-edit text-right font-bold cell-qty font-mono" contenteditable="true" oninput="recalcPO()"></div></td>
              <td><div class="cell-edit text-right font-mono cell-price" contenteditable="true" onblur="formatPriceCell(this)" oninput="recalcPO()"></div></td>
              <td><div class="cell-edit text-right font-bold font-mono cell-amount"></div></td>
              <td><div class="cell-edit text-center font-mono" contenteditable="true"></div></td>
              <td><div class="cell-edit text-left" contenteditable="true"></div></td>
            </tr>
          </tbody>

NEW:
          <tbody>
            {{#each items}}
            <tr>
              <td class="text-center font-bold">{{this.stt}}</td>
              <td><div class="cell-edit text-center font-mono">{{this.itemCode}}</div></td>
              <td><div class="cell-edit text-center font-mono">{{this.purchaseRequestCode}}</div></td>
              <td><div class="cell-edit text-left font-semibold">{{this.itemName}}</div></td>
              <td><div class="cell-edit text-center">{{this.unitName}}</div></td>
              <td><div class="cell-edit text-right font-bold font-mono">{{this.quantity}}</div></td>
              <td><div class="cell-edit text-right font-mono">{{this.unitPrice}}</div></td>
              <td><div class="cell-edit text-right font-bold font-mono" style="color: var(--navy);">{{this.lineTotal}}</div></td>
              <td><div class="cell-edit text-center font-mono">{{this.neededDate}}</div></td>
              <td><div class="cell-edit text-left">{{this.note}}</div></td>
            </tr>
            {{/each}}
          </tbody>
```

Không ép số dòng tối thiểu (5 dòng mẫu cũ) — bảng dài/ngắn theo đúng `items.length` thật, khớp
spec.

- [x] **Step 4: tfoot — số tiền/VAT cứng → token**

```
OLD:
          <tfoot>
            <tr class="tfoot-calc-row">
              <td colspan="6" rowspan="3" class="tfoot-notes-cell">
                <div class="tfoot-words-line">
                  <span class="tfoot-words-lbl">Số tiền viết bằng chữ / In words:</span>
                  <div id="po-words-txt" class="tfoot-words-val font-semibold" style="margin-top: 2px;">Hai trăm sáu mươi chín triệu năm trăm ngàn đồng chẵn.</div>
                </div>
                <div class="tfoot-subnotes" contenteditable="true" style="outline: none;">
                  • Điều khoản thanh toán: Chuyển khoản trong vòng 30 ngày kể từ ngày nhận đủ hàng và hóa đơn hợp lệ.<br>
                  • Tiêu chuẩn đóng gói: Theo quy cách kỹ thuật gia công khuôn mẫu Tiến Huy Mold.
                </div>
              </td>
              <td class="tfoot-calc-lbl" colspan="2">Thành tiền / Subtotal:</td>
              <td class="tfoot-calc-val font-mono" colspan="2">
                <span id="po-subtotal-txt">245,000,000</span> <span class="tfoot-curr">VNĐ</span>
              </td>
            </tr>
            <tr class="tfoot-calc-row">
              <td class="tfoot-calc-lbl" colspan="2">
                Thuế GTGT / VAT (<span id="po-vat-badge" contenteditable="true" onblur="recalcPO()" style="color: var(--navy); font-weight: bold; cursor: text;">10%</span>):
              </td>
              <td class="tfoot-calc-val font-mono" colspan="2">
                <span id="po-vat-txt">24,500,000</span> <span class="tfoot-curr">VNĐ</span>
              </td>
            </tr>
            <tr class="tfoot-grand-row">
              <td class="tfoot-grand-lbl" colspan="2">TỔNG TIỀN / GRAND TOTAL:</td>
              <td class="tfoot-grand-val font-mono" colspan="2">
                <span id="po-grand-txt">269,500,000</span> <span class="tfoot-curr" style="color: var(--navy); font-weight: 700;">VNĐ</span>
              </td>
            </tr>
          </tfoot>

NEW:
          <tfoot>
            <tr class="tfoot-calc-row">
              <td colspan="6" rowspan="3" class="tfoot-notes-cell">
                <div class="tfoot-words-line">
                  <span class="tfoot-words-lbl">Số tiền viết bằng chữ / In words:</span>
                  <div class="tfoot-words-val font-semibold" style="margin-top: 2px;">{{amountInWords}}</div>
                </div>
                <div class="tfoot-subnotes" style="outline: none;">
                  • Điều khoản thanh toán: Chuyển khoản trong vòng 30 ngày kể từ ngày nhận đủ hàng và hóa đơn hợp lệ.<br>
                  • Tiêu chuẩn đóng gói: Theo quy cách kỹ thuật gia công khuôn mẫu Tiến Huy Mold.
                </div>
              </td>
              <td class="tfoot-calc-lbl" colspan="2">Thành tiền / Subtotal:</td>
              <td class="tfoot-calc-val font-mono" colspan="2">
                <span>{{subtotal}}</span> <span class="tfoot-curr">VNĐ</span>
              </td>
            </tr>
            <tr class="tfoot-calc-row">
              <td class="tfoot-calc-lbl" colspan="2">
                Thuế GTGT / VAT (<span style="color: var(--navy); font-weight: bold;">{{vatPercent}}%</span>):
              </td>
              <td class="tfoot-calc-val font-mono" colspan="2">
                <span>{{vatAmount}}</span> <span class="tfoot-curr">VNĐ</span>
              </td>
            </tr>
            <tr class="tfoot-grand-row">
              <td class="tfoot-grand-lbl" colspan="2">TỔNG TIỀN / GRAND TOTAL:</td>
              <td class="tfoot-grand-val font-mono" colspan="2">
                <span>{{grandTotal}}</span> <span class="tfoot-curr" style="color: var(--navy); font-weight: 700;">VNĐ</span>
              </td>
            </tr>
          </tfoot>
```

- [x] **Step 5: Chữ ký — tên cứng → token, bỏ ngày ký giả (form in ra ký tay)**

```
OLD:
        <div class="signatures-flat-row" style="justify-content: space-between; padding: 0 70px;">
          <div class="sig-flat-col">
            <div>
              <div class="sig-title-main">NV Kinh Doanh</div>
              <div class="sig-title-sub">Sales Staff (Ký, ghi rõ họ tên)</div>
            </div>
            <div class="sig-name-block">
              <div class="sig-person-name" contenteditable="true">NGUYỄN VĂN AN</div>
              <div class="sig-date-note">Ngày ký: 22/09/2026</div>
            </div>
          </div>

          <div class="sig-flat-col">
            <div>
              <div class="sig-title-main">Giám Đốc</div>
              <div class="sig-title-sub">General Director (Ký duyệt, đóng dấu)</div>
            </div>
            <div class="sig-name-block">
              <div class="sig-person-name">TRƯƠNG THẾ TRUNG</div>
              <div class="sig-date-note">Ngày ký: 22/09/2026</div>
            </div>
          </div>
        </div>

NEW:
        <div class="signatures-flat-row" style="justify-content: space-between; padding: 0 70px;">
          <div class="sig-flat-col">
            <div>
              <div class="sig-title-main">NV Kinh Doanh</div>
              <div class="sig-title-sub">Sales Staff (Ký, ghi rõ họ tên)</div>
            </div>
            <div class="sig-name-block">
              <div class="sig-person-name">{{assignedUserName}}</div>
              <div class="sig-date-note">Ngày ký: ....................</div>
            </div>
          </div>

          <div class="sig-flat-col">
            <div>
              <div class="sig-title-main">Giám Đốc</div>
              <div class="sig-title-sub">General Director (Ký duyệt, đóng dấu)</div>
            </div>
            <div class="sig-name-block">
              <div class="sig-person-name">{{ordererName}}</div>
              <div class="sig-date-note">Ngày ký: ....................</div>
            </div>
          </div>
        </div>
```

Ghi chú cho người review: nhãn "Giám Đốc/General Director" giữ nguyên dù người thật ký (`ordererBy`,
người bấm `POST :id/confirm`) chỉ cần quyền `purchasing:update`, không nhất thiết là giám đốc — đây
là quyết định giữ nguyên nhãn gốc của mockup, không tự ý đổi tên chức danh trên chứng từ đối ngoại;
nếu người dùng muốn đổi nhãn, sửa lại ở bước này.

- [x] **Step 6: Xoá `<script>` tính tiền client — server đã tính hết, giữ lại sẽ không có DOM
  `#po-*` để chạy vào (đã đổi hết sang `{{token}}`), chỉ còn là code chết.**

```
OLD:
  <script>
    function parseNum(str) {
      if (!str) return 0;
      var clean = str.toString().replace(/,/g, '').replace(/\./g, '').trim();
      var v = parseFloat(clean);
      return isNaN(v) ? 0 : v;
    }

    function formatNumber(n) {
      if (isNaN(n) || n === 0) return '';
      return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    function formatPriceCell(cell) {
      var v = parseNum(cell.innerText);
      if (v > 0) {
        cell.innerText = formatNumber(v);
      }
    }

    var CHU_SO = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

    function docBlock3(num, dayDu) {
      var tram = Math.floor(num / 100);
      var chuc = Math.floor((num % 100) / 10);
      var donvi = num % 10;
      var res = "";

      if (tram > 0 || dayDu) res += CHU_SO[tram] + " trăm ";

      if (chuc > 1) {
        res += CHU_SO[chuc] + " mươi ";
        if (donvi === 1) res += "mốt ";
        else if (donvi === 5) res += "lăm ";
        else if (donvi > 0) res += CHU_SO[donvi] + " ";
      } else if (chuc === 1) {
        res += "mười ";
        if (donvi === 5) res += "lăm ";
        else if (donvi > 0) res += CHU_SO[donvi] + " ";
      } else {
        if (tram > 0 || dayDu) {
          if (donvi > 0) res += "lẻ " + CHU_SO[donvi] + " ";
        } else if (donvi > 0) {
          res += CHU_SO[donvi] + " ";
        }
      }
      return res;
    }

    function docSoThanhChu(tien) {
      tien = Math.round(tien);
      if (tien <= 0) return "Không đồng chẵn.";

      var res = "";
      var ty = Math.floor(tien / 1000000000);
      tien = tien % 1000000000;
      var trieu = Math.floor(tien / 1000000);
      tien = tien % 1000000;
      var nghin = Math.floor(tien / 1000);
      var dong = tien % 1000;

      if (ty > 0) res += docBlock3(ty, false) + "tỷ ";
      if (trieu > 0) res += docBlock3(trieu, ty > 0) + "triệu ";
      if (nghin > 0) res += docBlock3(nghin, (ty > 0 || trieu > 0)) + "nghìn ";
      if (dong > 0) res += docBlock3(dong, (ty > 0 || trieu > 0 || nghin > 0)) + "đồng";
      else res += "đồng";

      res = res.trim().replace(/\s+/g, ' ');
      return res.charAt(0).toUpperCase() + res.slice(1) + " chẵn.";
    }

    function recalcPO() {
      var rows = document.querySelectorAll('#table-po tbody tr');
      var subtotal = 0;

      rows.forEach(function(tr) {
        var qtyEl = tr.querySelector('.cell-qty');
        var priceEl = tr.querySelector('.cell-price');
        var amountEl = tr.querySelector('.cell-amount');

        var qty = parseNum(qtyEl ? qtyEl.innerText : 0);
        var price = parseNum(priceEl ? priceEl.innerText : 0);
        var amount = qty * price;

        if (amount > 0) {
          amountEl.innerText = formatNumber(amount);
          subtotal += amount;
        } else {
          amountEl.innerText = '';
        }
      });

      var subTotalEl = document.getElementById('po-subtotal-txt');
      if (subTotalEl) subTotalEl.innerText = formatNumber(subtotal);

      var vatEl = document.getElementById('po-vat-badge');
      var vatStr = vatEl ? vatEl.innerText.replace('%', '').trim() : '10';
      var vatRate = (parseFloat(vatStr) || 0) / 100;
      var vatAmount = Math.round(subtotal * vatRate);

      var vatTxtEl = document.getElementById('po-vat-txt');
      if (vatTxtEl) vatTxtEl.innerText = formatNumber(vatAmount);

      var grandTotal = subtotal + vatAmount;
      var grandTxtEl = document.getElementById('po-grand-txt');
      if (grandTxtEl) grandTxtEl.innerText = formatNumber(grandTotal);

      var wordsTxtEl = document.getElementById('po-words-txt');
      if (wordsTxtEl) wordsTxtEl.innerText = docSoThanhChu(grandTotal);
    }

    window.addEventListener('DOMContentLoaded', function() {
      var d = new Date();
      var dd = String(d.getDate()).padStart(2, '0');
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var yyyy = d.getFullYear();
      var todayStr = dd + '/' + mm + '/' + yyyy;

      var dInput = document.getElementById('po-date-input');
      if (dInput) dInput.innerText = todayStr;

      recalcPO();
    });
  </script>
</body>
</html>

NEW:
</body>
</html>
```

- [x] **Step 7: Xác minh không còn tham chiếu chết**

```bash
grep -n "recalcPO\|docSoThanhChu\|formatPriceCell\|po-date-input\|po-subtotal-txt\|po-vat-badge\|po-vat-txt\|po-grand-txt\|po-words-txt\|cell-qty\|cell-price\|cell-amount\|contenteditable\|screen-toolbar\|lenh_san_xuat\|tong_hop_don_hang" src/templates/purchase-order.html
```

Expected: không output nào (mọi tham chiếu đã xoá hết). `.cell-qty`/`.cell-price`/`.cell-amount`
trong khối `<style>` (nếu CSS có định nghĩa riêng cho các class này) không cần xoá — style chết vô
hại, không quét trong bước này, chỉ quét phần đã sửa ở body.

---

## Task 4: `PdfRendererService` + `TemplatesModule`

**Files:**
- Create: `src/templates/pdf-renderer.service.ts`
- Create: `src/templates/templates.module.ts`

**Interfaces:**
- Consumes: `FormTemplateType`, `getFormTemplatePath` từ `./form-templates.registry` (Task 1,
  không đổi); `ErrorCode.E274` (thêm ở Task 6).
- Produces: `PdfRendererService.render(type: FormTemplateType, context: object): Promise<Buffer>` —
  dùng ở Task 5.

- [x] **Step 1: Thêm `ErrorCode.E274`**

Sửa `src/constants/error-code.constant.ts`, chèn ngay sau `E273` (trước `V003`):

```ts
  // Puppeteer render PDF lỗi cả sau khi thử khởi động lại browser 1 lần — Chromium crash liên tục.
  E274 = 'purchase_order.error.pdf_render_failed',
```

- [x] **Step 2: Viết `pdf-renderer.service.ts`**

```ts
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import Handlebars from 'handlebars';
import puppeteer, { Browser } from 'puppeteer';

import { ErrorCode } from '../constants/error-code.constant';
import { AppException } from '../exceptions/app.exception';
import {
  FormTemplateType,
  getFormTemplatePath,
} from './form-templates.registry';

@Injectable()
export class PdfRendererService {
  private static readonly PDF_OPTIONS = {
    format: 'A4' as const,
    landscape: true,
    printBackground: true,
  };

  private readonly logger = new Logger(PdfRendererService.name);
  private readonly compiledTemplates = new Map<
    FormTemplateType,
    Handlebars.TemplateDelegate
  >();
  private browser: Browser | undefined;

  async onModuleInit(): Promise<void> {
    this.browser = await puppeteer.launch({ headless: true });
  }

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close();
  }

  async render(type: FormTemplateType, context: object): Promise<Buffer> {
    const html = this.compile(type)(context);

    try {
      return await this.renderPdf(html);
    } catch {
      // Chromium có thể đã crash giữa chừng — thử khởi động lại browser 1 lần rồi render lại,
      // tránh app đứng render PDF vĩnh viễn sau 1 lần crash.
      this.logger.warn(
        'Puppeteer render PDF thất bại, thử khởi động lại browser',
      );
      await this.browser?.close().catch(() => undefined);
      this.browser = await puppeteer.launch({ headless: true });

      try {
        return await this.renderPdf(html);
      } catch {
        throw new AppException(
          ErrorCode.E274,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  private async renderPdf(html: string): Promise<Buffer> {
    if (!this.browser) {
      throw new AppException(
        ErrorCode.E274,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const page = await this.browser.newPage();
    try {
      // Puppeteer 25 bỏ `networkidle0`/`networkidle2` khỏi `setContent` — `load` đã đợi xong
      // stylesheet/font ngoài (Google Fonts), thêm `document.fonts.ready` để chắc chắn.
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluateHandle('document.fonts.ready');
      const pdf = await page.pdf(PdfRendererService.PDF_OPTIONS);
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  private compile(type: FormTemplateType): Handlebars.TemplateDelegate {
    const cached = this.compiledTemplates.get(type);
    if (cached) return cached;

    const source = readFileSync(getFormTemplatePath(type), 'utf-8');
    const compiled = Handlebars.compile(source);
    this.compiledTemplates.set(type, compiled);
    return compiled;
  }
}
```

Lưu ý: NestJS tự gọi `onModuleInit`/`onModuleDestroy` nếu class implement đúng interface
(`OnModuleInit`/`OnModuleDestroy` từ `@nestjs/common`) — thêm `implements OnModuleInit,
OnModuleDestroy` vào class declaration (đã lược trong khối code trên cho gọn, phải thêm khi gõ
thật):

```ts
export class PdfRendererService implements OnModuleInit, OnModuleDestroy {
```

và import `OnModuleInit, OnModuleDestroy` cùng dòng `HttpStatus, Injectable, Logger` ở đầu file.

- [x] **Step 3: Viết `templates.module.ts`**

```ts
import { Module } from '@nestjs/common';

import { PdfRendererService } from './pdf-renderer.service';

@Module({
  providers: [PdfRendererService],
  exports: [PdfRendererService],
})
export class TemplatesModule {}
```

- [x] **Step 4: Xác minh**

```bash
npx tsc --noEmit
pnpm lint
```

Không build/chạy thật ở bước này — chưa có module nào import `TemplatesModule` (Task 5 mới wiring),
chỉ cần qua typecheck/lint.

---

## Task 5: `PurchaseOrdersService.exportPurchaseOrderPdf` + wiring

**Files:**
- Create: `src/api/purchase-orders/types/purchase-order-pdf-context.type.ts`
- Create: `src/api/purchase-orders/dto/export-purchase-order-pdf.req.dto.ts`
- Modify: `src/api/purchase-orders/purchase-orders.service.ts`
- Modify: `src/api/purchase-orders/purchase-orders.controller.ts`
- Modify: `src/api/purchase-orders/purchase-orders.module.ts`

**Interfaces:**
- Consumes: `PdfRendererService.render` (Task 4), `readAmountInWords`/`formatVndAmount` (Task 2),
  `formatExcelDate` (đã có sẵn, `src/common/utils/excel.util.ts`, tái dùng — cột `date` UTC-midnight,
  format `dd/MM/yyyy`).
- Produces: `PurchaseOrdersService.exportPurchaseOrderPdf(purchaseOrderId: string, vatPercent:
  number): Promise<StreamableFile>`; route `GET /purchase-orders/:purchaseOrderId/export-pdf`.

- [x] **Step 1: Viết type context**

`src/api/purchase-orders/types/purchase-order-pdf-context.type.ts`:

```ts
export interface PurchaseOrderPdfItemContext {
  stt: number;
  itemCode: string;
  purchaseRequestCode: string;
  itemName: string;
  unitName: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  neededDate: string;
  note: string;
}

export interface PurchaseOrderPdfContext {
  code: string;
  orderDate: string;
  supplierName: string;
  supplierAddress: string;
  subtotal: string;
  vatPercent: number;
  vatAmount: string;
  grandTotal: string;
  amountInWords: string;
  assignedUserName: string;
  ordererName: string;
  items: PurchaseOrderPdfItemContext[];
}
```

- [x] **Step 2: Viết query DTO**

`src/api/purchase-orders/dto/export-purchase-order-pdf.req.dto.ts`:

```ts
import { NumberFieldOptional } from '../../../decorators/field.decorators';

export class ExportPurchaseOrderPdfReqDto {
  @NumberFieldOptional({
    min: 0,
    max: 100,
    description:
      'Thuế GTGT (%) áp cho toàn bộ PO khi xuất PDF — không lưu DB, bỏ trống = 0%',
  })
  vatPercent?: number;
}
```

- [x] **Step 3: Sửa `purchase-orders.service.ts` — tách raw fetch dùng chung**

Thay method `getPurchaseOrder` hiện tại (dòng 336-381) bằng 2 method: `getPurchaseOrderEntity`
(private, raw fetch) + `getPurchaseOrder` gọi lại nó, giữ nguyên hành vi cũ.

```
OLD:
  async getPurchaseOrder(
    purchaseOrderId: string,
  ): Promise<PurchaseOrderResDto> {
    const order = await this.db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.id, purchaseOrderId),
      with: {
        supplier: true,
        quotation: true,
        assignedUser: true,
        ordererBy: true,
        cancellerBy: true,
        creatorBy: true,
        items: {
          with: {
            purchaseRequestItem: {
              with: { purchaseRequest: true, item: { with: { unit: true } } },
            },
          },
        },
      },
    });

    if (!order) {
      throw new AppException(ErrorCode.E121, HttpStatus.NOT_FOUND);
    }

    const receivedByItemId = await getReceivedQuantityByPurchaseOrderItemId(
      this.db,
      {
        purchaseOrderItemIds: order.items.map((item) => item.id),
        statuses: [InventoryDocumentStatus.POSTED],
      },
    );

    return plainToInstance(
      PurchaseOrderResDto,
      {
        ...order,
        items: order.items.map((item) => ({
          ...item,
          receivedQuantity: receivedByItemId.get(item.id) ?? 0,
        })),
      },
      { excludeExtraneousValues: true },
    );
  }

NEW:
  async getPurchaseOrder(
    purchaseOrderId: string,
  ): Promise<PurchaseOrderResDto> {
    const order = await this.getPurchaseOrderEntity(purchaseOrderId);

    const receivedByItemId = await getReceivedQuantityByPurchaseOrderItemId(
      this.db,
      {
        purchaseOrderItemIds: order.items.map((item) => item.id),
        statuses: [InventoryDocumentStatus.POSTED],
      },
    );

    return plainToInstance(
      PurchaseOrderResDto,
      {
        ...order,
        items: order.items.map((item) => ({
          ...item,
          receivedQuantity: receivedByItemId.get(item.id) ?? 0,
        })),
      },
      { excludeExtraneousValues: true },
    );
  }

  /** Fetch quan hệ đầy đủ dùng chung cho `getPurchaseOrder` (map DTO) và `exportPurchaseOrderPdf`
   * (dùng field thô: `supplier.address`/`purchaseRequest.neededDate` — 2 field DTO public không
   * có, không đáng thêm vào DTO chỉ vì PDF). */
  private async getPurchaseOrderEntity(purchaseOrderId: string) {
    const order = await this.db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.id, purchaseOrderId),
      with: {
        supplier: true,
        quotation: true,
        assignedUser: true,
        ordererBy: true,
        cancellerBy: true,
        creatorBy: true,
        items: {
          with: {
            purchaseRequestItem: {
              with: { purchaseRequest: true, item: { with: { unit: true } } },
            },
          },
        },
      },
    });

    if (!order) {
      throw new AppException(ErrorCode.E121, HttpStatus.NOT_FOUND);
    }

    return order;
  }
```

- [x] **Step 4: Thêm `exportPurchaseOrderPdf` + constructor/import**

Sửa phần đầu file — thêm import và tham số constructor:

```
OLD:
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';

NEW:
import {
  HttpStatus,
  Inject,
  Injectable,
  StreamableFile,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { DateTime } from 'luxon';
```

```
OLD:
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import {
  DocumentType,
  generateDocumentSequence,
} from '../../common/utils/document-sequence.util';
import { hasFields } from '../../common/utils/object.util';
import { unaccentILike } from '../../common/utils/search.util';

NEW:
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import {
  DocumentType,
  generateDocumentSequence,
} from '../../common/utils/document-sequence.util';
import { formatExcelDate } from '../../common/utils/excel.util';
import { hasFields } from '../../common/utils/object.util';
import { unaccentILike } from '../../common/utils/search.util';
import {
  formatVndAmount,
  readAmountInWords,
} from '../../common/utils/vietnamese-number.util';
```

```
OLD:
import { CancelPurchaseOrderReqDto } from './dto/cancel-purchase-order.req.dto';
import { CreatePurchaseOrderItemReqDto } from './dto/create-purchase-order-item.req.dto';
import { CreatePurchaseOrderReqDto } from './dto/create-purchase-order.req.dto';
import { GetPurchaseOrdersReqDto } from './dto/get-purchase-orders.req.dto';

NEW:
import { CancelPurchaseOrderReqDto } from './dto/cancel-purchase-order.req.dto';
import { CreatePurchaseOrderItemReqDto } from './dto/create-purchase-order-item.req.dto';
import { CreatePurchaseOrderReqDto } from './dto/create-purchase-order.req.dto';
import { ExportPurchaseOrderPdfReqDto } from './dto/export-purchase-order-pdf.req.dto';
import { GetPurchaseOrdersReqDto } from './dto/get-purchase-orders.req.dto';
```

`ExportPurchaseOrderPdfReqDto` chỉ dùng ở controller (Step 5), import này thật ra không cần ở
service — bỏ qua, xem lại: service nhận `vatPercent: number` trực tiếp, không nhận DTO. Xoá dòng
import `ExportPurchaseOrderPdfReqDto` vừa thêm ở service (chỉ thêm ở controller, Step 5).

```
OLD:
import type {
  CreateDraftOrdersFromQuotationInput,
  PurchaseOrderDraftLine,
} from './types/draft-order.type';

NEW:
import type {
  CreateDraftOrdersFromQuotationInput,
  PurchaseOrderDraftLine,
} from './types/draft-order.type';
import type { PurchaseOrderPdfContext } from './types/purchase-order-pdf-context.type';
import { FormTemplateType } from '../../templates/form-templates.registry';
import { PdfRendererService } from '../../templates/pdf-renderer.service';
```

Sửa constructor:

```
OLD:
export class PurchaseOrdersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

NEW:
export class PurchaseOrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly pdfRendererService: PdfRendererService,
  ) {}
```

Thêm method mới ngay sau `getPurchaseOrderEntity` (cuối khối vừa sửa ở Step 3):

```ts
  /** Xuất PDF PO — subtotal/VAT/tổng tiền/đọc số thành chữ tính ở server (không phụ thuộc script
   * client cũ trong `purchase-order.html`, đã xoá — `docs/superpowers/specs/2026-09-22-purchase-order-pdf-export-design.md`). */
  async exportPurchaseOrderPdf(
    purchaseOrderId: string,
    vatPercent: number,
  ): Promise<StreamableFile> {
    const order = await this.getPurchaseOrderEntity(purchaseOrderId);

    let subtotal = 0;
    const items = order.items.map((item, index) => {
      const lineTotal =
        item.unitPrice !== null ? item.quantity * item.unitPrice : null;
      if (lineTotal !== null) subtotal += lineTotal;

      return {
        stt: index + 1,
        itemCode: item.purchaseRequestItem.item.code,
        purchaseRequestCode: item.purchaseRequestItem.purchaseRequest.code,
        itemName: item.purchaseRequestItem.item.name,
        unitName: item.purchaseRequestItem.item.unit.name,
        quantity: item.quantity.toLocaleString('en-US', {
          maximumFractionDigits: 3,
        }),
        unitPrice:
          item.unitPrice !== null ? formatVndAmount(item.unitPrice) : '',
        lineTotal: lineTotal !== null ? formatVndAmount(lineTotal) : '',
        neededDate: formatExcelDate(
          item.purchaseRequestItem.purchaseRequest.neededDate,
        ),
        note: item.note ?? '',
      };
    });

    const vatAmount = Math.round((subtotal * vatPercent) / 100);
    const grandTotal = subtotal + vatAmount;

    const context: PurchaseOrderPdfContext = {
      code: order.code,
      orderDate: formatExcelDate(order.orderDate),
      supplierName: order.supplier.name,
      supplierAddress: order.supplier.address,
      subtotal: formatVndAmount(subtotal),
      vatPercent,
      vatAmount: formatVndAmount(vatAmount),
      grandTotal: formatVndAmount(grandTotal),
      amountInWords: readAmountInWords(grandTotal),
      assignedUserName: order.assignedUser?.fullName ?? '',
      ordererName: order.ordererBy?.fullName ?? '',
      items,
    };

    const buffer = await this.pdfRendererService.render(
      FormTemplateType.PURCHASE_ORDER,
      context,
    );

    const fileName = `${order.code}-${DateTime.now().toFormat('yyyyLLdd-HHmm')}.pdf`;
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
```

- [x] **Step 5: Sửa controller — thêm route**

```
OLD:
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

NEW:
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
```

```
OLD:
import { CancelPurchaseOrderReqDto } from './dto/cancel-purchase-order.req.dto';
import { CreatePurchaseOrderReqDto } from './dto/create-purchase-order.req.dto';
import { GetPurchaseOrdersReqDto } from './dto/get-purchase-orders.req.dto';

NEW:
import { CancelPurchaseOrderReqDto } from './dto/cancel-purchase-order.req.dto';
import { CreatePurchaseOrderReqDto } from './dto/create-purchase-order.req.dto';
import { ExportPurchaseOrderPdfReqDto } from './dto/export-purchase-order-pdf.req.dto';
import { GetPurchaseOrdersReqDto } from './dto/get-purchase-orders.req.dto';
```

Thêm route ngay sau `getPurchaseOrder` (trước `@Post()` của `createPurchaseOrder`):

```ts
  @Get(':purchaseOrderId/export-pdf')
  @Permissions('purchasing:read')
  @ApiAuth({
    summary:
      'Xuất PDF đơn mua (PO) — subtotal/VAT/tổng tiền tính ở server, VAT truyền qua query',
    fileType: 'application/pdf',
  })
  exportPurchaseOrderPdf(
    @UUIDParam('purchaseOrderId') purchaseOrderId: string,
    @Query() reqDto: ExportPurchaseOrderPdfReqDto,
  ): Promise<StreamableFile> {
    return this.purchaseOrdersService.exportPurchaseOrderPdf(
      purchaseOrderId,
      reqDto.vatPercent ?? 0,
    );
  }
```

- [x] **Step 6: Sửa `purchase-orders.module.ts` — import `TemplatesModule`**

```
OLD:
import { Module } from '@nestjs/common';

import { PurchaseNotesModule } from '../purchase-notes/purchase-notes.module';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({
  imports: [PurchaseNotesModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}

NEW:
import { Module } from '@nestjs/common';

import { PurchaseNotesModule } from '../purchase-notes/purchase-notes.module';
import { TemplatesModule } from '../../templates/templates.module';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({
  imports: [PurchaseNotesModule, TemplatesModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
```

- [x] **Step 7: Xác minh**

```bash
npx tsc --noEmit
```

Sửa mọi lỗi type trước khi sang Task 6 (kỳ vọng sạch — mọi field truy cập trên `order`/`item` đã
xác nhận tồn tại trong raw relational query ở Task khảo sát: `supplier.address`,
`purchaseRequestItem.purchaseRequest.neededDate`, `purchaseRequestItem.item.code/name/unit.name`,
`assignedUser.fullName`, `ordererBy.fullName`).

---

## Task 6: Verification toàn bộ + smoke test thủ công

**Files:** không sửa file mới — chỉ chạy lệnh.

- [x] **Step 1: Lint + build**

```bash
pnpm lint
pnpm build
```

Sửa mọi lỗi phát sinh trước khi tiếp tục.

- [x] **Step 2: Xác nhận Puppeteer Chromium đã tải được**

```bash
node -e "require('puppeteer').launch({headless: true}).then(b => { console.log('OK'); return b.close(); }).catch(e => { console.error('FAIL', e.message); process.exit(1); })"
```

Nếu FAIL (sandbox trước đây thiếu `unzip`/`yauzl` khiến `pnpm approve-builds puppeteer` tải Chromium
lỗi) — báo lại cho người dùng, đây là giới hạn môi trường chạy lệnh, không phải lỗi code; cần chạy
lại `pnpm approve-builds puppeteer` (hoặc cài `unzip`) trên máy thật sẽ chạy tính năng này.

**Kết quả chạy đợt này (2026-09-22):** ban đầu FAIL — `Could not find Chrome` (môi trường thiếu
`unzip`, không có quyền `sudo` để cài). Người dùng cài `unzip` cho sandbox ngay sau đó —
`npx puppeteer browsers install chrome` chạy lại thành công, `puppeteer.launch()` OK.

**Xác minh render thật (thay Step 3, không cần DB/auth):** viết script `ts-node` gọi thẳng
`PdfRendererService.render(FormTemplateType.PURCHASE_ORDER, context)` với context mẫu (context tay,
không qua `PurchaseOrdersService`/DB) — ra PDF 432KB, đọc lại bằng mắt: đúng layout mockup gốc, mọi
token `{{...}}` đã thay đúng giá trị (header công ty, mã PO, NCC, bảng dòng, subtotal/VAT/tổng
tiền, đọc số thành chữ, 2 khối chữ ký), không còn placeholder nào sót. Xác nhận pipeline
Handlebars→Puppeteer hoạt động đúng. **Chưa** chạy full HTTP smoke test qua `pnpm start:dev` +
token thật + PO thật trong DB (cần Postgres/Redis + 1 PO có sẵn) — nếu cần xác minh thêm phần
DB→context (query/join/tính subtotal từ dữ liệu thật), chạy Step 3 gốc bên dưới.

- [ ] **Step 3: Smoke test qua API thật (chỉ khi Step 2 OK và người dùng cho phép chạy dev server)**

```bash
pnpm start:dev
```

Gọi (thay `<TOKEN>`/`<PO_ID>` bằng token đăng nhập thật + id 1 PO có sẵn trong DB dev):

```bash
curl -s -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:8003/api/purchase-orders/<PO_ID>/export-pdf?vatPercent=10" \
  -o /tmp/po-export-test.pdf
```

Mở `/tmp/po-export-test.pdf` — so khớp: bảng dòng đúng SL dòng PO, subtotal/VAT/tổng tiền/đọc số
đúng theo dữ liệu PO đó (tính tay 1 dòng để đối chiếu), không còn khối toolbar/thanh nút In, tên NV
kinh doanh/Giám đốc đúng `assignedUser`/`ordererBy` của PO (hoặc rỗng nếu PO chưa gán/chưa confirm).

- [ ] **Step 4: Dừng dev server, dọn file build tạm nếu Step 1 đã chạy `pnpm build`**

```bash
rm -rf dist
```

- [ ] **Step 5: Báo cáo lại người dùng** — không tự `git add`/`git commit`, đợi người dùng xác nhận
  trước khi commit (`.claude/rules/general.md`).
