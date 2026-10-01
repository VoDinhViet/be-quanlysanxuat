import { z } from 'zod';

import { StockStatus } from '../../inventory/inventory.constant';

export const STOCK_SHORTAGE_STATUSES = [
  StockStatus.SHORTAGE,
  StockStatus.WARNING,
] as const;

export const listInventoryShortagesSchema = z.object({
  status: z.enum(STOCK_SHORTAGE_STATUSES).describe('Mức thiếu cần xem'),
  limit: z
    .number()
    .int()
    .optional()
    .describe('Số dòng tối đa, mặc định 10, tối đa 20'),
});
export type ListInventoryShortagesInput = z.infer<
  typeof listInventoryShortagesSchema
>;
