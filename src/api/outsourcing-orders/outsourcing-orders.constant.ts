import { OutsourcingOrderStatus } from '../../database/schemas';

// Phiếu đã gửi đi mà chưa nhận đủ hàng về: chỉ các phiếu này mới có thể trễ hạn trả
export const OUTSOURCING_AWAITING_RETURN_STATUSES: OutsourcingOrderStatus[] = [
  OutsourcingOrderStatus.SENT,
  OutsourcingOrderStatus.PARTIAL,
  OutsourcingOrderStatus.WAITING_QC,
];
