import { join } from 'path';

/** Loại chứng từ đã có template từ KINH DOANH.xlsx:
 * - `ORDER`: chi tiết 1 đơn hàng bán, file `order.html`
 * - `ORDER_SUMMARY`: danh sách tổng hợp nhiều đơn hàng bán (mã BM-03/KD), file `order-summary.html`
 * - `PRODUCTION_ORDER`: lệnh sản xuất (mã BM-02/KD), file `production-order.html`
 * - `PRODUCTION_PLAN`: kế hoạch sản xuất nhiều Job (mã BM 08-01), file `production-plan.html`
 * - `STOCK_IN_SLIP`: phiếu nhập kho (mã BM 09-01), file `stock-in-slip.html`
 */
export enum FormTemplateType {
  ORDER = 'ORDER',
  ORDER_SUMMARY = 'ORDER_SUMMARY',
  PRODUCTION_ORDER = 'PRODUCTION_ORDER',
  PRODUCTION_PLAN = 'PRODUCTION_PLAN',
  STOCK_IN_SLIP = 'STOCK_IN_SLIP',
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
 * file HTML tương ứng. */
export const FORM_TEMPLATES: Record<FormTemplateType, FormTemplateDefinition> =
  {
    [FormTemplateType.ORDER]: {
      fileName: 'order.html',
      placeholders: [
        { key: 'code', label: 'Số đơn', group: 'meta' },
        { key: 'order_date', label: 'Ngày tạo đơn', group: 'meta' },
        { key: 'customer_name', label: 'Khách hàng', group: 'meta' },
        {
          key: 'customer_address',
          label: 'Địa chỉ khách hàng',
          group: 'meta',
        },
        { key: 'subtotal', label: 'Thành tiền trước thuế', group: 'totals' },
        { key: 'discount_amount', label: 'Chiết khấu', group: 'totals' },
        { key: 'shipping_fee', label: 'Phí vận chuyển', group: 'totals' },
        { key: 'vat_percent', label: '% Thuế GTGT', group: 'totals' },
        { key: 'vat_amount', label: 'Tiền thuế GTGT', group: 'totals' },
        { key: 'grand_total', label: 'Tổng tiền', group: 'totals' },
        { key: 'amount_in_words', label: 'Số tiền bằng chữ', group: 'totals' },
        {
          key: 'assigned_user_name',
          label: 'NV Kinh doanh',
          group: 'signatures',
        },
        {
          key: 'approver_name',
          label: 'Giám đốc duyệt',
          group: 'signatures',
        },
      ],
    },
    [FormTemplateType.ORDER_SUMMARY]: {
      fileName: 'order-summary.html',
      placeholders: [
        { key: 'period_from', label: 'Từ ngày', group: 'meta' },
        { key: 'period_to', label: 'Đến ngày', group: 'meta' },
        { key: 'report_code', label: 'Mã báo cáo', group: 'meta' },
        { key: 'report_date', label: 'Ngày lập báo cáo', group: 'meta' },
        {
          key: 'subtotal',
          label: 'Tổng thành tiền trước thuế',
          group: 'totals',
        },
        { key: 'vat_amount', label: 'Tổng tiền thuế GTGT', group: 'totals' },
        { key: 'grand_total', label: 'Tổng cộng', group: 'totals' },
        {
          key: 'amount_in_words',
          label: 'Tổng số tiền bằng chữ',
          group: 'totals',
        },
        {
          key: 'preparer_name',
          label: 'Người lập biểu',
          group: 'signatures',
        },
      ],
    },
    [FormTemplateType.PRODUCTION_ORDER]: {
      fileName: 'production-order.html',
      placeholders: [
        { key: 'code', label: 'Mã lệnh SX / PO', group: 'meta' },
        { key: 'order_date', label: 'Ngày tạo lệnh', group: 'meta' },
        { key: 'customer_name', label: 'Tên khách hàng', group: 'meta' },
        { key: 'customer_address', label: 'Địa chỉ khách hàng', group: 'meta' },
      ],
    },
    [FormTemplateType.PRODUCTION_PLAN]: {
      fileName: 'production-plan.html',
      placeholders: [
        { key: 'customer_name', label: 'Khách hàng', group: 'meta' },
        { key: 'report_code', label: 'Số hiệu', group: 'meta' },
        { key: 'report_date', label: 'Ngày lập', group: 'meta' },
        { key: 'total_quantity', label: 'Tổng số lượng', group: 'totals' },
      ],
    },
    [FormTemplateType.STOCK_IN_SLIP]: {
      fileName: 'stock-in-slip.html',
      placeholders: [
        { key: 'code', label: 'Số phiếu nhập', group: 'meta' },
        { key: 'receipt_date', label: 'Ngày nhập kho', group: 'meta' },
        { key: 'delivery_unit', label: 'Đơn vị giao', group: 'meta' },
      ],
    },
  };

/** Đường dẫn tuyệt đối tới file template đã build — `__dirname` là thư mục chứa file .js đã biên
 * dịch (`dist/src/templates`), nên trỏ đúng cả khi chạy `nest start` lẫn `node dist/src/main`. */
export function getFormTemplatePath(type: FormTemplateType): string {
  return join(__dirname, FORM_TEMPLATES[type].fileName);
}
