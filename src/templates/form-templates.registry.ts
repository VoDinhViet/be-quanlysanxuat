import { join } from 'path';

import { getFileDate } from '../common/utils/time';

/** Các biểu mẫu PDF của công ty, mỗi loại ứng với một file HTML:
 * - `ORDER`: chi tiết 1 đơn hàng bán (mã BM 10-03), file `order.html`
 * - `ORDER_SUMMARY`: danh sách tổng hợp nhiều đơn hàng bán (mã BM-03/KD), file `order-summary.html`
 * - `PRODUCTION_PLAN`: kế hoạch sản xuất nhiều Job (mã BM 08-01), file `production-plan.html`
 * - `STOCK_IN_SLIP`: phiếu nhập kho (mã BM 09-01), file `stock-in-slip.html`
 * - `STOCK_OUT_SLIP`: phiếu xuất kho (mã BM 09-02), file `stock-out-slip.html`
 * - `MATERIAL_REQUISITION`: phiếu lãnh vật tư (mã BM 09-06), file `material-requisition.html`
 * - `PURCHASE_REQUEST`: đề xuất mua hàng (mã BM 09-03), file `purchase-request.html`
 * - `PURCHASE_ORDER`: đơn đặt hàng NCC (mã BM 05-04), file `purchase-order.html`
 * - `OUTSOURCING_SEND_SLIP`: phiếu xuất gia công ngoài (mã BM 09-06), file `outsourcing-send-slip.html`
 * - `OUTSOURCING_RECEIVE_SLIP`: phiếu nhập gia công ngoài (mã BM 09-07), file `outsourcing-receive-slip.html`
 * - `SUPPLIER_RETURN_SLIP`: phiếu xuất trả nhà cung cấp (mã BM 09-08), file `supplier-return-slip.html`
 * - `DELIVERY_NOTE`: phiếu giao hàng (mã BM 09-04), file `delivery-note.html`
 * - `PRODUCTION_JOB_ORDER`: lệnh sản xuất theo Job (mã BM 08-05), file `production-job-order.html`
 */
export enum FormTemplateType {
  ORDER = 'ORDER',
  ORDER_SUMMARY = 'ORDER_SUMMARY',
  PRODUCTION_PLAN = 'PRODUCTION_PLAN',
  STOCK_IN_SLIP = 'STOCK_IN_SLIP',
  STOCK_OUT_SLIP = 'STOCK_OUT_SLIP',
  MATERIAL_REQUISITION = 'MATERIAL_REQUISITION',
  PURCHASE_REQUEST = 'PURCHASE_REQUEST',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  OUTSOURCING_SEND_SLIP = 'OUTSOURCING_SEND_SLIP',
  OUTSOURCING_RECEIVE_SLIP = 'OUTSOURCING_RECEIVE_SLIP',
  SUPPLIER_RETURN_SLIP = 'SUPPLIER_RETURN_SLIP',
  DELIVERY_NOTE = 'DELIVERY_NOTE',
  PRODUCTION_JOB_ORDER = 'PRODUCTION_JOB_ORDER',
}

export interface FormTemplatePlaceholder {
  key: string;
  label: string;
  group?: string;
}

interface FormTemplateDefinition {
  fileName: string;
  /** Tiêu đề in trên biểu mẫu, viết thường, không dấu, nối bằng `-`; là phần đầu tên file tải về. */
  downloadName: string;
  /** Mã biểu mẫu in ở chân trang bên phải, đúng nguyên văn trên biểu mẫu chuẩn. */
  formCode: string;
  /** Có giá trị thì chân trang in `<nhãn> n/m` và bỏ mã biểu mẫu, vì mã đã in ở khung đầu trang. */
  pageLabel?: string;
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
      downloadName: 'don-hang',
      formCode: 'BM 10-03/Rev 01; 21.10.2026',
      landscape: true,
      placeholders: [
        { key: 'code', label: 'Mã đơn hàng', group: 'meta' },
        { key: 'buyer_po_no', label: 'Số PO', group: 'meta' },
        { key: 'order_date', label: 'Ngày đặt', group: 'meta' },
        { key: 'due_date', label: 'Ngày giao', group: 'meta' },
        { key: 'customer_name', label: 'Khách hàng', group: 'meta' },
        { key: 'customer_address', label: 'Địa chỉ', group: 'meta' },
        { key: 'customer_tax_code', label: 'Mã số thuế', group: 'meta' },
        { key: 'customer_phone', label: 'Điện thoại', group: 'meta' },
        { key: 'customer_contact', label: 'Người liên hệ', group: 'meta' },
        { key: 'customer_email', label: 'Email', group: 'meta' },
        { key: 'note', label: 'Ghi chú', group: 'meta' },
        { key: 'payment_term', label: 'Điều khoản thanh toán', group: 'meta' },
        { key: 'subtotal', label: 'Thành tiền (chưa thuế)', group: 'totals' },
        { key: 'discount_amount', label: 'Chiết khấu', group: 'totals' },
        { key: 'vat_percent', label: '% Thuế VAT', group: 'totals' },
        { key: 'vat_amount', label: 'Tiền thuế VAT', group: 'totals' },
        { key: 'shipping_fee', label: 'Chi phí khác', group: 'totals' },
        { key: 'grand_total', label: 'Tổng tiền', group: 'totals' },
        {
          key: 'sales_staff_name',
          label: 'Nhân viên kinh doanh',
          group: 'signatures',
        },
        { key: 'sales_staff_date', label: 'Ngày đặt đơn', group: 'signatures' },
        { key: 'approver_name', label: 'Giám đốc duyệt', group: 'signatures' },
        {
          key: 'approver_date',
          label: 'Ngày Giám đốc duyệt',
          group: 'signatures',
        },
      ],
    },
    [FormTemplateType.ORDER_SUMMARY]: {
      fileName: 'order-summary.html',
      downloadName: 'danh-sach-tong-hop-don-hang',
      formCode: 'BM-03/KD',
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
    [FormTemplateType.PRODUCTION_PLAN]: {
      fileName: 'production-plan.html',
      downloadName: 'ke-hoach-san-xuat',
      formCode: 'BM 08-01/Rev 01; 11.03.2024',
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
      downloadName: 'phieu-nhap-kho',
      formCode: 'BM 09-01/Rev 02; 01.07.2025',
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
      downloadName: 'phieu-xuat-kho',
      formCode: 'BM 09-02/Rev 01; 19.10.2026',
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
      downloadName: 'phieu-lanh-vat-tu',
      formCode: 'BM 09-06/Rev 01; 22.10.2026',
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
      downloadName: 'de-xuat-mua-hang',
      formCode: 'BM 09-03/Rev 02; 01.07.2025',
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
      downloadName: 'don-dat-hang',
      formCode: 'BM 05-04/Rev 01; 11.03.2024',
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
    [FormTemplateType.OUTSOURCING_SEND_SLIP]: {
      fileName: 'outsourcing-send-slip.html',
      downloadName: 'phieu-xuat-gia-cong-ngoai',
      formCode: 'BM 09-06/Rev 01; 21.10.2026',
      landscape: false,
      placeholders: [
        { key: 'code', label: 'Mã phiếu xuất', group: 'meta' },
        { key: 'send_date', label: 'Ngày gửi đi', group: 'meta' },
        {
          key: 'expected_return_date',
          label: 'Ngày cần nhận về',
          group: 'meta',
        },
        { key: 'supplier_name', label: 'Nhà cung cấp', group: 'meta' },
        { key: 'supplier_address', label: 'Địa chỉ', group: 'meta' },
        { key: 'supplier_tax_code', label: 'Mã số thuế', group: 'meta' },
        { key: 'note', label: 'Ghi chú', group: 'meta' },
        { key: 'creator_name', label: 'Người lập phiếu', group: 'signatures' },
        { key: 'creator_date', label: 'Ngày lập phiếu', group: 'signatures' },
        { key: 'approver_name', label: 'Người phê duyệt', group: 'signatures' },
        {
          key: 'approver_date',
          label: 'Ngày phê duyệt',
          group: 'signatures',
        },
      ],
    },
    [FormTemplateType.OUTSOURCING_RECEIVE_SLIP]: {
      fileName: 'outsourcing-receive-slip.html',
      downloadName: 'phieu-nhap-gia-cong-ngoai',
      formCode: 'BM 09-07/Rev 01; 21.10.2026',
      landscape: false,
      placeholders: [
        { key: 'code', label: 'Mã phiếu nhập', group: 'meta' },
        { key: 'order_codes', label: 'Mã phiếu xuất', group: 'meta' },
        { key: 'receipt_date', label: 'Ngày nhập', group: 'meta' },
        { key: 'supplier_name', label: 'Nhà cung cấp', group: 'meta' },
        { key: 'supplier_address', label: 'Địa chỉ', group: 'meta' },
        { key: 'supplier_tax_code', label: 'Mã số thuế', group: 'meta' },
        { key: 'note', label: 'Ghi chú', group: 'meta' },
        { key: 'creator_name', label: 'Người lập phiếu', group: 'signatures' },
        { key: 'creator_date', label: 'Ngày lập phiếu', group: 'signatures' },
        { key: 'qc_name', label: 'Người QC', group: 'signatures' },
        { key: 'qc_date', label: 'Ngày QC', group: 'signatures' },
        {
          key: 'poster_name',
          label: 'Người xác nhận nhập kho',
          group: 'signatures',
        },
        {
          key: 'poster_date',
          label: 'Ngày xác nhận nhập kho',
          group: 'signatures',
        },
      ],
    },
    [FormTemplateType.SUPPLIER_RETURN_SLIP]: {
      fileName: 'supplier-return-slip.html',
      downloadName: 'phieu-xuat-tra-nha-cung-cap',
      formCode: 'BM 09-08/Rev 02; 01.07.2025',
      landscape: false,
      placeholders: [
        { key: 'supplier_name', label: 'Tên nhà cung cấp', group: 'supplier' },
        { key: 'supplier_address', label: 'Địa chỉ', group: 'supplier' },
        { key: 'supplier_tax_code', label: 'Mã số thuế', group: 'supplier' },
        { key: 'return_reason', label: 'Lý do trả hàng', group: 'meta' },
        { key: 'code', label: 'Mã phiếu trả', group: 'meta' },
        { key: 'iqc_code', label: 'Mã IQC', group: 'meta' },
        { key: 'return_date', label: 'Ngày trả', group: 'meta' },
        { key: 'note', label: 'Ghi chú', group: 'meta' },
        { key: 'qc_name', label: 'Bộ phận QC', group: 'signatures' },
        { key: 'qc_date', label: 'Ngày QC xác nhận IQC', group: 'signatures' },
        { key: 'poster_name', label: 'Xác nhận trả NCC', group: 'signatures' },
        {
          key: 'poster_date',
          label: 'Ngày xác nhận trả NCC',
          group: 'signatures',
        },
        { key: 'approver_name', label: 'Phê duyệt', group: 'signatures' },
        {
          key: 'approver_date',
          label: 'Ngày phê duyệt IQC',
          group: 'signatures',
        },
      ],
    },
    [FormTemplateType.DELIVERY_NOTE]: {
      fileName: 'delivery-note.html',
      downloadName: 'phieu-giao-hang',
      formCode: 'BM 09-04/Rev 02; 10.03.2026',
      landscape: false,
      placeholders: [
        { key: 'code', label: 'Số phiếu giao', group: 'meta' },
        { key: 'fulfillment_date', label: 'Ngày giao', group: 'meta' },
        { key: 'client_name', label: 'Khách hàng', group: 'client' },
        { key: 'delivery_address', label: 'Địa chỉ giao', group: 'client' },
        { key: 'client_tax_code', label: 'Mã số thuế', group: 'client' },
        { key: 'client_phone', label: 'Điện thoại', group: 'client' },
        { key: 'receiver_name', label: 'Người liên hệ', group: 'client' },
        { key: 'client_email', label: 'Email', group: 'client' },
        { key: 'note', label: 'Ghi chú', group: 'meta' },
        { key: 'creator_name', label: 'Người lập phiếu', group: 'signatures' },
        { key: 'creator_date', label: 'Ngày lập phiếu', group: 'signatures' },
        { key: 'approver_name', label: 'Người phê duyệt', group: 'signatures' },
        { key: 'approver_date', label: 'Ngày phê duyệt', group: 'signatures' },
      ],
    },
    [FormTemplateType.PRODUCTION_JOB_ORDER]: {
      fileName: 'production-job-order.html',
      downloadName: 'lenh-san-xuat',
      formCode: 'BM 08-05/Rev 01; 20.10.2026',
      pageLabel: 'Page',
      landscape: false,
      placeholders: [
        { key: 'job_code', label: 'Mã số Job', group: 'meta' },
        {
          key: 'barcode_svg',
          label: 'Mã vạch Code128 của mã Job (SVG)',
          group: 'meta',
        },
        {
          key: 'order_po_code',
          label: 'Mã đơn hàng (PO khách)',
          group: 'meta',
        },
        { key: 'order_date', label: 'Ngày đặt', group: 'meta' },
        { key: 'due_date', label: 'Ngày giao', group: 'meta' },
        { key: 'customer_name', label: 'Khách hàng', group: 'product' },
        { key: 'item_code', label: 'Mã sản phẩm', group: 'product' },
        { key: 'item_name', label: 'Tên sản phẩm', group: 'product' },
        { key: 'revision', label: 'Phiên bản', group: 'product' },
        { key: 'quantity', label: 'Số lượng', group: 'product' },
        { key: 'unit_name', label: 'Đơn vị', group: 'product' },
        { key: 'note', label: 'Ghi chú', group: 'product' },
        {
          key: 'image_data_uri',
          label: 'Ảnh sản phẩm (data URI)',
          group: 'product',
        },
        {
          key: 'approver_name',
          label: 'Người xác nhận kế hoạch',
          group: 'signatures',
        },
        { key: 'approver_date', label: 'Ngày xác nhận', group: 'signatures' },
      ],
    },
  };

/** Đường dẫn tuyệt đối tới file template đã build — `__dirname` là thư mục chứa file .js đã biên
 * dịch (`dist/src/templates`), nên trỏ đúng cả khi chạy `nest start` lẫn `node dist/src/main`. */
export function getFormTemplatePath(type: FormTemplateType): string {
  return join(__dirname, FORM_TEMPLATES[type].fileName);
}

/**
 * Tên file PDF tải về, dạng `ten-bieu-mau_MA-CHUNG-TU.pdf`.
 *
 * Rules:
 * - Không có mã (biểu mẫu danh sách, LSX chưa cấp mã) thì lấy ngày xuất `yyyyMMdd` thay cho mã.
 * - Tên nằm trong header `Content-Disposition` dạng quoted nên mã chỉ giữ ký tự ASCII an toàn.
 */
export function buildFormPdfFileName(
  type: FormTemplateType,
  documentCode: string | null = null,
): string {
  const reference = documentCode
    ? documentCode.replace(/[^\w.-]+/g, '-')
    : getFileDate();
  return `${FORM_TEMPLATES[type].downloadName}_${reference}.pdf`;
}
