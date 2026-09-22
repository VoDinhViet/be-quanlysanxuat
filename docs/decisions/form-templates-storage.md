# Template biểu mẫu lưu cứng trong repo, không qua registry `files`

**Trạng thái:** còn hiệu lực

## Bối cảnh

Chuẩn bị hạ tầng cho tính năng xuất biểu mẫu PDF trong tương lai — chưa có engine render, mới cài
sẵn `handlebars`/`puppeteer` (`package.json`) làm sẵn, chưa import/dùng ở đâu.

Cân nhắc ban đầu: quản lý template qua registry `files` (admin upload qua `POST /files`, giống
`items.imageFileId`). Đã đảo hướng — template là **file tĩnh trong repo**, không qua registry.

## Quyết định

- File template (`.html`) nằm ở `src/templates/`, build sang `dist/src/templates/` qua `assets`
  của `nest-cli.json` (`outDir: "dist/src"` — khớp vị trí `.js` biên dịch từ cùng thư mục, để
  `join(__dirname, fileName)` resolve đúng ở cả `nest start` lẫn `node dist/src/main`).
- `src/templates/form-templates.registry.ts` khai `FormTemplateType` (enum, hiện chỉ
  `PURCHASE_ORDER` — đơn mua hàng, khớp mẫu "ĐƠN HÀNG"/"PURCHASE ORDER" BM-01/KD) + `FORM_TEMPLATES`
  (map loại → tên file + `placeholders` mô tả token có trong file) + `getFormTemplatePath()`.
- Sửa nội dung template = sửa file + commit + deploy, **không có API upload/CRUD nào** — khác hẳn
  đính kèm qua `files` (`docs/decisions/files-registry.md`), nơi admin tự thay ảnh/tài liệu không
  cần deploy lại.
- `placeholders` thuần mô tả, **chưa có logic binding/render nào đọc nó**. `purchase-order.html`
  hiện là file mockup tĩnh (dữ liệu mẫu cứng, chưa phải Handlebars) — chuyển sang token thật +
  điền `placeholders` khi làm tính năng render (`docs/superpowers/specs/2026-09-22-purchase-order-pdf-export-design.md`).

## Không làm

- Không có bảng DB nào cho template — cả danh sách loại lẫn nội dung đều sống trong code/git.
- Không viết logic render/xuất PDF, không endpoint nào gọi tới `getFormTemplatePath`/`FORM_TEMPLATES`
  ở đợt này.
- Không đụng module `orders`.

## Đừng hoàn lại

Đừng quay lại phương án "template qua registry `files`" (admin upload) trừ khi có yêu cầu rõ ràng
cần sửa template không qua deploy — đã cân nhắc và loại bỏ hướng đó.
