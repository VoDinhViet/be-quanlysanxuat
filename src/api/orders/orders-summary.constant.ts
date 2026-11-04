import { OrderStatus } from '../../database/schemas';

// Xếp hạng đơn/nhóm theo giá trị: mặc định ngắn hơn `SUMMARY_DEFAULT_LIMIT` vì chỉ cần top đầu
export const DEFAULT_ORDER_RANKING_LIMIT = 10;

// Đơn đã vào sản xuất mà chưa xong: chỉ nhóm này mới "trễ hạn" hay có tiến độ để theo dõi
export const IN_PRODUCTION_STATUSES: readonly OrderStatus[] = [
  OrderStatus.AWAITING_PRODUCTION,
  OrderStatus.IN_PROGRESS,
];

export const MAX_DUE_WITHIN_DAYS = 30;
