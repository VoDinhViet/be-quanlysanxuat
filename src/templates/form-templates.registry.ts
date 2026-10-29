import { join } from 'path';

/** Loại chứng từ đã có template từ KINH DOANH.xlsx:
 * - `ORDER`: chi tiết 1 đơn hàng bán, file `order.html`
 * - `ORDER_SUMMARY`: danh sách tổng hợp nhiều đơn hàng bán (mã BM-03/KD), file `order-summary.html`
 * - `PRODUCTION_ORDER`: lệnh sản xuất (mã BM-02/KD), file `production-order.html`
 * - `PRODUCTION_PLAN`: kế hoạch sản xuất nhiều Job (mã BM 08-01), file `production-plan.html`
 * - `STOCK_IN_SLIP`: phiếu nhập kho (mã BM 09-01), file `stock-in-slip.html`
 * - `STOCK_OUT_SLIP`: phiếu xuất kho (mã BM 09-02), file `stock-out-slip.html`
 * - `MATERIAL_REQUISITION`: phiếu lãnh vật tư (mã BM 09-03), file `material-requisition.html`
 * - `PURCHASE_REQUEST`: đề xuất mua hàng (mã BM 07-01), file `purchase-request.html`
 * - `PURCHASE_ORDER`: đơn đặt hàng NCC (mã BM 07-02), file `purchase-order.html`
 */
export enum FormTemplateType {
  ORDER = 'ORDER',
  ORDER_SUMMARY = 'ORDER_SUMMARY',
  PRODUCTION_ORDER = 'PRODUCTION_ORDER',
  PRODUCTION_PLAN = 'PRODUCTION_PLAN',
  STOCK_IN_SLIP = 'STOCK_IN_SLIP',
  STOCK_OUT_SLIP = 'STOCK_OUT_SLIP',
  MATERIAL_REQUISITION = 'MATERIAL_REQUISITION',
  PURCHASE_REQUEST = 'PURCHASE_REQUEST',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
}

export interface FormTemplatePlaceholder {
  key: string;
  label: string;
  group?: string;
}

interface FormTemplateDefinition {
  fileName: string;
  landscape: boolean;
  placeholders: FormTemplatePlaceholder[];
}

/** Hai token của partial `creator-signature.html`, dùng chung cho các biểu mẫu có cột "Người lập". */
const creatorSignaturePlaceholders: FormTemplatePlaceholder[] = [
  { key: 'creator_name', label: 'Người lập', group: 'signatures' },
  { key: 'creator_date', label: 'Ngày in', group: 'signatures' },
];

/** Mỗi loại chứng từ trỏ 1 file HTML tĩnh trong `src/templates/` (build sang `dist/src/templates/`
 * qua `assets` của `nest-cli.json`) — file **lưu cứng trong repo**, sửa nội dung là commit code +
 * deploy, không qua registry `files`/API upload. `placeholders` thuần mô tả token thật sự có trong
 * file HTML tương ứng. */
export const FORM_TEMPLATES: Record<FormTemplateType, FormTemplateDefinition> =
  {
    [FormTemplateType.ORDER]: {
      fileName: 'order.html',
      landscape: true,
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
      landscape: true,
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
        ...creatorSignaturePlaceholders,
      ],
    },
    [FormTemplateType.PRODUCTION_ORDER]: {
      fileName: 'production-order.html',
      landscape: true,
      placeholders: [
        { key: 'code', label: 'Mã lệnh SX / PO', group: 'meta' },
        { key: 'order_date', label: 'Ngày tạo lệnh', group: 'meta' },
        { key: 'customer_name', label: 'Tên khách hàng', group: 'meta' },
        { key: 'customer_address', label: 'Địa chỉ khách hàng', group: 'meta' },
      ],
    },
    [FormTemplateType.PRODUCTION_PLAN]: {
      fileName: 'production-plan.html',
      landscape: true,
      placeholders: [
        { key: 'customer_name', label: 'Khách hàng', group: 'meta' },
        { key: 'report_code', label: 'Số hiệu', group: 'meta' },
        { key: 'report_date', label: 'Ngày lập', group: 'meta' },
        { key: 'total_quantity', label: 'Tổng số lượng', group: 'totals' },
      ],
    },
    [FormTemplateType.STOCK_IN_SLIP]: {
      fileName: 'stock-in-slip.html',
      landscape: false,
      placeholders: [
        { key: 'code', label: 'Mã phiếu nhập', group: 'meta' },
        { key: 'receipt_date', label: 'Ngày nhập', group: 'meta' },
        { key: 'purchase_order_codes', label: 'Mã phiếu mua', group: 'meta' },
        { key: 'source', label: 'PO / Lý do', group: 'meta' },
        {
          key: 'partner_title',
          label: 'Tiêu đề khối NCC / khách hàng',
          group: 'meta',
        },
        {
          key: 'partner_label',
          label: 'Nhãn tên NCC / khách hàng',
          group: 'meta',
        },
        { key: 'partner_name', label: 'Tên NCC / khách hàng', group: 'meta' },
        {
          key: 'partner_address',
          label: 'Địa chỉ NCC / khách hàng',
          group: 'meta',
        },
        { key: 'partner_tax_code', label: 'Mã số thuế', group: 'meta' },
        ...creatorSignaturePlaceholders,
      ],
    },
    [FormTemplateType.STOCK_OUT_SLIP]: {
      fileName: 'stock-out-slip.html',
      landscape: false,
      placeholders: [
        { key: 'code', label: 'Mã phiếu xuất', group: 'meta' },
        { key: 'requisition_code', label: 'Mã phiếu lãnh', group: 'meta' },
        { key: 'issue_date', label: 'Ngày xuất kho', group: 'meta' },
        { key: 'department_name', label: 'Bộ phận lãnh', group: 'meta' },
        { key: 'requester_name', label: 'Người tạo phiếu lãnh', group: 'meta' },
        { key: 'source', label: 'PO / Lý do', group: 'meta' },
        { key: 'job_code', label: 'Job', group: 'meta' },
        ...creatorSignaturePlaceholders,
      ],
    },
    [FormTemplateType.MATERIAL_REQUISITION]: {
      fileName: 'material-requisition.html',
      landscape: false,
      placeholders: [
        { key: 'code', label: 'Mã phiếu lãnh', group: 'meta' },
        { key: 'requisition_date', label: 'Ngày lãnh', group: 'meta' },
        { key: 'source', label: 'PO / Lý do', group: 'meta' },
        { key: 'job_code', label: 'Job', group: 'meta' },
        { key: 'department_name', label: 'Bộ phận đề xuất', group: 'meta' },
        { key: 'note', label: 'Ghi chú', group: 'meta' },
        ...creatorSignaturePlaceholders,
      ],
    },
    [FormTemplateType.PURCHASE_REQUEST]: {
      fileName: 'purchase-request.html',
      landscape: false,
      placeholders: [
        { key: 'code', label: 'Số phiếu đề xuất', group: 'meta' },
        { key: 'request_date', label: 'Ngày đề xuất', group: 'meta' },
        { key: 'needed_date', label: 'Ngày cần', group: 'meta' },
        { key: 'source', label: 'PO / Lý do', group: 'meta' },
        { key: 'job_code', label: 'Job', group: 'meta' },
        { key: 'department_name', label: 'Bộ phận đề xuất', group: 'meta' },
        ...creatorSignaturePlaceholders,
      ],
    },
    [FormTemplateType.PURCHASE_ORDER]: {
      fileName: 'purchase-order.html',
      landscape: false,
      placeholders: [
        { key: 'code', label: 'Số đơn đặt hàng', group: 'meta' },
        { key: 'order_date', label: 'Ngày đặt hàng', group: 'meta' },
        { key: 'expected_date', label: 'Ngày giao dự kiến', group: 'meta' },
        { key: 'supplier_name', label: 'Tên nhà cung cấp', group: 'meta' },
        { key: 'supplier_address', label: 'Địa chỉ NCC', group: 'meta' },
        { key: 'supplier_tax_code', label: 'Mã số thuế NCC', group: 'meta' },
        { key: 'supplier_phone', label: 'Điện thoại NCC', group: 'meta' },
        { key: 'supplier_contact', label: 'Người liên hệ', group: 'meta' },
        { key: 'supplier_email', label: 'Email NCC', group: 'meta' },
        { key: 'payment_term', label: 'Điều khoản thanh toán', group: 'meta' },
        { key: 'note', label: 'Ghi chú', group: 'meta' },
        {
          key: 'subtotal',
          label: 'Tổng tiền hàng (chưa thuế)',
          group: 'totals',
        },
        { key: 'vat_percent', label: '% Thuế VAT', group: 'totals' },
        { key: 'vat_amount', label: 'Tiền thuế VAT', group: 'totals' },
        { key: 'other_cost', label: 'Chi phí khác', group: 'totals' },
        { key: 'grand_total', label: 'Tổng thanh toán', group: 'totals' },
        { key: 'advance_payment', label: 'Tạm ứng đơn hàng', group: 'totals' },
        {
          key: 'balance_due',
          label: 'Còn lại phải thanh toán',
          group: 'totals',
        },
        {
          key: 'amount_in_words',
          label: 'Tổng thanh toán bằng chữ',
          group: 'totals',
        },
        {
          key: 'creator_name',
          label: 'Người lập báo giá',
          group: 'signatures',
        },
        {
          key: 'creator_date',
          label: 'Ngày tạo báo giá',
          group: 'signatures',
        },
        {
          key: 'approver_name',
          label: 'Người phê duyệt',
          group: 'signatures',
        },
        {
          key: 'approver_date',
          label: 'Ngày phê duyệt',
          group: 'signatures',
        },
      ],
    },
  };

/** Đường dẫn tuyệt đối tới file template đã build — `__dirname` là thư mục chứa file .js đã biên
 * dịch (`dist/src/templates`), nên trỏ đúng cả khi chạy `nest start` lẫn `node dist/src/main`. */
export function getFormTemplatePath(type: FormTemplateType): string {
  return join(__dirname, FORM_TEMPLATES[type].fileName);
}

export const CREATOR_SIGNATURE_PARTIAL_NAME = 'creator-signature';

export const CREATOR_SIGNATURE_PARTIAL_PATH = join(
  __dirname,
  'partials',
  'creator-signature.html',
);
