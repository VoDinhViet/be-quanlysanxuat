import { join } from 'path';

/** Loại chứng từ đã có template — chỉ `PURCHASE_ORDER` (đơn mua hàng, mã BM-01/KD) lúc mở đầu,
 * thêm giá trị khác qua đăng ký thêm 1 dòng ở `FORM_TEMPLATES` khi cần. */
export enum FormTemplateType {
  PURCHASE_ORDER = 'PURCHASE_ORDER',
}

export interface FormTemplatePlaceholder {
  key: string;
  label: string;
  group?: string;
}

interface FormTemplateDefinition {
  fileName: string;
  placeholders: FormTemplatePlaceholder[];
}

/** Mỗi loại chứng từ trỏ 1 file HTML tĩnh trong `src/templates/` (build sang `dist/src/templates/`
 * qua `assets` của `nest-cli.json`) — file **lưu cứng trong repo**, sửa nội dung là commit code +
 * deploy, không qua registry `files`/API upload. `placeholders` thuần mô tả token thật sự có trong
 * file HTML tương ứng — điền khi file thật được cung cấp, chưa có logic binding/render nào đọc nó.
 * Chuẩn bị cho tính năng xuất PDF sau này, xem `docs/decisions/form-templates-storage.md`. */
export const FORM_TEMPLATES: Record<FormTemplateType, FormTemplateDefinition> =
  {
    [FormTemplateType.PURCHASE_ORDER]: {
      fileName: 'purchase-order.html',
      // TODO: điền đúng key/label khi chuyển nội dung sang Handlebars thật (mã PO, NCC, ngày,
      // dòng vật tư lặp lại...).
      placeholders: [],
    },
  };

/** Đường dẫn tuyệt đối tới file template đã build — `__dirname` là thư mục chứa file .js đã biên
 * dịch (`dist/src/templates`), nên trỏ đúng cả khi chạy `nest start` lẫn `node dist/src/main`. */
export function getFormTemplatePath(type: FormTemplateType): string {
  return join(__dirname, FORM_TEMPLATES[type].fileName);
}
