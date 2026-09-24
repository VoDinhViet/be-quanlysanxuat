# Xuất PDF đơn mua hàng (Purchase Order) — thiết kế

**Ngày:** 2026-09-22
**Trạng thái:** đã duyệt thiết kế, chuyển sang lập kế hoạch

## Bối cảnh

Đợt trước (`docs/decisions/form-templates-storage.md`) đã chuẩn bị hạ tầng: `src/templates/`
(file HTML tĩnh trong repo) + `form-templates.registry.ts` (enum + map loại→file) + cài sẵn
`handlebars`/`puppeteer`. Người dùng cung cấp file HTML thật (mockup "ĐƠN HÀNG"/"PURCHASE ORDER",
mã BM-01/KD) — ban đầu gán nhầm cho `orders` (đơn hàng bán), đã sửa lại: đây là **PO** (đơn mua
hàng từ NCC, module `purchase-orders`). Đợt này hiện thực tính năng render PDF thật đầu tiên.

## Mục tiêu

- `GET /purchase-orders/:purchaseOrderId/export-pdf?vatPercent=` trả file PDF render từ
  `src/templates/purchase-order.html` (chuyển thành Handlebars thật) + dữ liệu PO thật.
- Cơ chế render (Puppeteer service) đặt ở hạ tầng chung `src/templates/`, tái dùng được cho
  loại biểu mẫu khác sau này (chỉ `PURCHASE_ORDER` lúc mở đầu).

## Ngoài phạm vi

- Không cache PDF đã render, không lưu vào registry `files`.
- Không thêm cột DB nào (VAT không lưu — nhận qua query param mỗi lần gọi).
- Không làm biểu mẫu nào khác ngoài PO.
- Không viết test (`docs/decisions/testing-paused.md`).

## Đổi tên do sửa sai trước đó

| Cũ | Mới |
| --- | --- |
| `FormTemplateType.ORDER` | `FormTemplateType.PURCHASE_ORDER` |
| `src/templates/order.html` | `src/templates/purchase-order.html` |

`docs/decisions/form-templates-storage.md` cập nhật theo (không xoá lịch sử, sửa tên loại +
đường dẫn).

## Kiến trúc

```
GET /purchase-orders/:id/export-pdf?vatPercent=10
        │
        ▼
PurchaseOrdersController.exportPurchaseOrderPdf   (permission: purchasing:read)
        │  gọi PurchaseOrdersService.getPurchaseOrder(id)  ← TÁI DÙNG query hiện có
        ▼
PurchaseOrdersService lấy PurchaseOrderResDto đầy đủ (supplier/assignedUser/ordererBy/items...)
        │  map sang PurchaseOrderPdfContext (shape phẳng cho template)
        ▼
PdfRendererService.render(FormTemplateType.PURCHASE_ORDER, context)
        │  1. đọc + compile Handlebars template (cache theo formType, compile 1 lần)
        │  2. render HTML string
        │  3. page = browser.newPage(); page.setContent(html); pdf = page.pdf({...}); page.close()
        ▼
Buffer PDF → StreamableFile (application/pdf) → response
```

## Thành phần

### 1. `src/templates/purchase-order.html` (sửa)

- Xoá dữ liệu mẫu cứng (`<!-- TODO -->` không còn), thay bằng token Handlebars.
- Sửa nhãn "Tên khách hàng/Customer" → "Nhà cung cấp/Supplier".
- Field đơn (không lặp): `{{code}}`, `{{orderDate}}`, `{{supplierName}}`, `{{supplierAddress}}`,
  `{{subtotal}}`, `{{vatPercent}}`, `{{vatAmount}}`, `{{grandTotal}}`, `{{amountInWords}}`,
  `{{assignedUserName}}`, `{{ordererName}}`.
- Bảng dòng: `{{#each items}}` — mỗi dòng có `stt`, `itemCode`, `purchaseRequestCode`, `itemName`,
  `unitName`, `quantity`, `unitPrice`, `lineTotal`, `neededDate`, `note`. `stt` tính sẵn ở service
  (không dùng Handlebars helper `@index`), 1-based.
- Không ép số dòng tối thiểu — bảng dài/ngắn theo đúng `items.length` thật.

### 2. `src/templates/pdf-renderer.service.ts` (mới)

- `@Injectable() implements OnModuleInit, OnModuleDestroy` — 1 browser Puppeteer sống suốt vòng
  đời app (`puppeteer.launch({headless: true})` lúc init, `browser.close()` lúc destroy). Tránh
  chi phí khởi động Chromium (~1-2s) mỗi request.
- Compile Handlebars cache theo `FormTemplateType` (Map trong bộ nhớ, compile lần đầu gọi mỗi
  loại, đọc file qua `getFormTemplatePath`).
- `async render(type: FormTemplateType, context: object): Promise<Buffer>` — mở `page` mới mỗi
  lần gọi (không dùng lại page giữa các request), `setContent(html, {waitUntil: 'networkidle0'})`
  (chờ Google Fonts tải xong — template có `@import`/`<link>` font ngoài), `page.pdf({format:
  'A4', landscape: true, printBackground: true})` (khớp `@page` CSS có sẵn), đóng `page` trong
  `finally`.
- Nếu browser crash giữa chừng (Puppeteer ném lỗi "Target closed"): bắt lỗi, thử `launch` lại 1
  lần rồi ném tiếp nếu vẫn lỗi — tránh app đứng render PDF vĩnh viễn sau 1 lần Chromium chết.

### 3. `PurchaseOrdersService` (sửa)

- `async exportPurchaseOrderPdf(purchaseOrderId: string, vatPercent: number): Promise<Buffer>`:
  gọi `getPurchaseOrder` (tái dùng, không viết query mới) → map `PurchaseOrderResDto` sang context
  phẳng (tính `lineTotal` mỗi dòng, `subtotal` tổng, `vatAmount = subtotal * vatPercent / 100`,
  `grandTotal`, `amountInWords` qua util mới) → `PdfRendererService.render(PURCHASE_ORDER,
  context)`.

### 4. `src/common/utils/vietnamese-number.util.ts` (mới)

- `numberToVietnameseWords(amount: number): string` — đọc số tiền VNĐ thành chữ (nghìn/triệu/tỷ,
  xử lý "linh"/"lẻ", "mốt"/"một", "lăm"/"năm" theo quy tắc tiếng Việt chuẩn). Hàm thuần, không phụ
  thuộc DB/request — test được độc lập dù đợt này không viết test.

### 5. Controller + DTO

- `PurchaseOrdersController.exportPurchaseOrderPdf` — `GET :purchaseOrderId/export-pdf`,
  `@ApiAuth`, `@Permissions('purchasing:read')`, query DTO `ExportPurchaseOrderPdfReqDto`
  (`vatPercent: NumberField({min: 0, max: 100})`, mặc định 0 nếu không truyền — không bắt buộc,
  PO có thể không chịu VAT). Trả `StreamableFile`, `Content-Type: application/pdf`, tên file
  `<code>-yyyyLLdd-HHmm.pdf` (khuôn timestamp giống export Excel hiện có).

## Xử lý lỗi

- PO không tồn tại → `getPurchaseOrder` đã ném `E121` sẵn, tái dùng nguyên.
- `vatPercent` ngoài [0,100] → validate ở DTO (422 chuẩn `ValidationPipe`), không cần `ErrorCode`
  riêng.
- Puppeteer render lỗi (Chromium crash cả sau khi thử lại) → ném `AppException` mã mới `E276`
  (`purchase_order.error.pdf_render_failed`, 500).

## Xác minh

1. `pnpm add` không cần (đã có `handlebars`/`puppeteer`).
2. `npx tsc --noEmit`, `pnpm lint`, `pnpm build`.
3. Thử tay: `nest start:dev` (cần Chromium tải thành công qua `pnpm approve-builds puppeteer` —
   đã chạy đợt trước, môi trường sandbox từng lỗi thiếu `unzip`, cần xác nhận lại) → gọi
   `GET /purchase-orders/:id/export-pdf` với 1 PO thật → mở file PDF trả về, so khớp layout với
   mockup gốc.
