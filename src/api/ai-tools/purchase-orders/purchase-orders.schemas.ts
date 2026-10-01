import { z } from 'zod';

export const listPurchaseOrdersSchema = z.object({
  onlyOverdue: z
    .boolean()
    .optional()
    .describe('Chỉ lấy đơn đã trễ ngày giao dự kiến'),
  limit: z
    .number()
    .int()
    .optional()
    .describe('Số dòng tối đa, mặc định 10, tối đa 20'),
});
export type ListPurchaseOrdersInput = z.infer<typeof listPurchaseOrdersSchema>;
