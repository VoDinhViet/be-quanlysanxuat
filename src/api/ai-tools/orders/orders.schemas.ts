import { z } from 'zod';

export const ORDER_SCOPES = ['overdue', 'due_soon', 'running'] as const;
export type OrderScope = (typeof ORDER_SCOPES)[number];

export const listOrdersSchema = z.object({
  scope: z.enum(ORDER_SCOPES).describe('Phạm vi lọc đơn'),
  limit: z
    .number()
    .int()
    .optional()
    .describe('Số dòng tối đa, mặc định 10, tối đa 20'),
});
export type ListOrdersInput = z.infer<typeof listOrdersSchema>;
