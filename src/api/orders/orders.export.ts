import { join } from 'node:path';
import {
  type ExcelCellValue,
  type ExcelTemplateColumn,
} from '../../common/utils/excel';

export const ORDER_TRACKING_TEMPLATE_PATH = join(
  __dirname,
  'templates',
  'order-tracking-template.xlsx',
);
/** Dòng khung trống của template; header nằm ở dòng 4. */
export const ORDER_TRACKING_FIRST_DATA_ROW = 5;

/** Hai nhãn này phải khớp `M1:M2` của template: đó là nguồn của dropdown và của định dạng có điều
 * kiện cột Trạng thái. */
const DELIVERY_STATUS_PENDING = 'Chưa giao hàng';
const DELIVERY_STATUS_DELIVERED = 'Đã giao hàng';

/** Theo dõi một dòng hàng của đơn; mọi số tiền đã quy về VND theo tỷ giá của đơn. */
export interface OrderItemTracking {
  itemCode: string;
  buyerPoNo: string | null;
  clientCode: string | null;
  clientName: string | null;
  itemName: string;
  unitName: string;
  orderedQuantity: number;
  unitPriceVnd: number;
  exchangeRate: number;
  discountPercent: number;
  /** Thành tiền thật của dòng (đã trừ chiết khấu dòng), lấy từ `lineTotal` của hệ thống. */
  lineTotalVnd: number;
  orderDate: Date;
  dueDate: Date | null;
  /** Đã giao đủ số lượng đặt; giao một phần vẫn chưa tính là đã giao. */
  isFullyDelivered: boolean;
  invoiceNumbers: string | null;
  latestInvoiceDate: Date | null;
  note: string | null;
}

/** Định dạng mẫu của cột Số lượng và Đơn giá là số nguyên, hiển thị 2,5 thành "3"; chỉ giá trị lẻ
 * mới đổi sang định dạng có phần thập phân, số nguyên giữ đúng định dạng của mẫu. */
const FRACTIONAL_QUANTITY_FORMAT = '#,##0.###';
const FRACTIONAL_PRICE_FORMAT = '#,##0.00 _₫';

/** Công thức Thành tiền của một dòng: `=H*I` như mẫu, thêm `*(1-x/100)` khi dòng có chiết khấu để
 * sửa số lượng hoặc đơn giá trong Excel vẫn ra đúng thành tiền. */
function lineTotalFormula(
  tracking: OrderItemTracking,
  rowNumber: number,
): string {
  const quantityTimesPrice = `H${rowNumber}*I${rowNumber}`;

  return tracking.discountPercent > 0
    ? `${quantityTimesPrice}*(1-${tracking.discountPercent}/100)`
    : quantityTimesPrice;
}

/**
 * Ô Thành tiền: số tiền thật của hệ thống, kèm công thức khi Excel tính lại ra cùng số đó.
 *
 * Rules:
 * - Đơn VND: ghi công thức kèm kết quả đã lưu; Excel tính lại `H*I*(1-x/100)` khớp `lineTotal` (lệch
 *   dưới 1 đồng do làm tròn).
 * - Đơn ngoại tệ: ghi số thẳng. Hệ thống làm tròn thành tiền theo xu của ngoại tệ rồi mới nhân tỷ
 *   giá, còn công thức trong Excel không có bước đó nên tính lại sẽ lệch tới vài chục đồng.
 */
function lineTotalCell(
  tracking: OrderItemTracking,
  rowNumber: number,
): ExcelCellValue {
  if (tracking.exchangeRate !== 1) {
    return tracking.lineTotalVnd;
  }

  return {
    formula: lineTotalFormula(tracking, rowNumber),
    result: tracking.lineTotalVnd,
  };
}

/** Thứ tự phần tử là thứ tự cột A..P của template. */
export const ORDER_ITEM_TRACKING_COLUMNS: ExcelTemplateColumn<OrderItemTracking>[] =
  [
    // A: STT
    {
      value: (_tracking, rowNumber) =>
        rowNumber - ORDER_TRACKING_FIRST_DATA_ROW + 1,
    },
    // B..G: sản phẩm và khách hàng
    { value: (tracking) => tracking.itemCode },
    { value: (tracking) => tracking.buyerPoNo },
    { value: (tracking) => tracking.clientCode },
    { value: (tracking) => tracking.clientName },
    { value: (tracking) => tracking.itemName },
    { value: (tracking) => tracking.unitName },
    // H..J: số lượng, đơn giá, thành tiền
    {
      value: (tracking) => tracking.orderedQuantity,
      numFmtOf: (tracking) =>
        Number.isInteger(tracking.orderedQuantity)
          ? undefined
          : FRACTIONAL_QUANTITY_FORMAT,
    },
    {
      value: (tracking) => tracking.unitPriceVnd,
      numFmtOf: (tracking) =>
        Number.isInteger(tracking.unitPriceVnd)
          ? undefined
          : FRACTIONAL_PRICE_FORMAT,
    },
    { value: lineTotalCell },
    // K..M: ngày đặt, hạn giao, trạng thái giao
    { value: (tracking) => tracking.orderDate },
    { value: (tracking) => tracking.dueDate },
    {
      value: (tracking) =>
        tracking.isFullyDelivered
          ? DELIVERY_STATUS_DELIVERED
          : DELIVERY_STATUS_PENDING,
    },
    // N..P: hoá đơn và ghi chú
    { value: (tracking) => tracking.invoiceNumbers },
    { value: (tracking) => tracking.latestInvoiceDate },
    { value: (tracking) => tracking.note },
  ];
