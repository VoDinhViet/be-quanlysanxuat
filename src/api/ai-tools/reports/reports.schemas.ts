import { z } from 'zod';

export const getReportStatsSchema = z.object({});

export const getReportProductionProgressSchema = z.object({
  dueFrom: z
    .string()
    .optional()
    .describe('Hạn giao của đơn từ ngày (yyyy-MM-dd)'),
  dueTo: z
    .string()
    .optional()
    .describe('Hạn giao của đơn đến ngày (yyyy-MM-dd)'),
});
export type GetReportProductionProgressInput = z.infer<
  typeof getReportProductionProgressSchema
>;

export const getReportQualitySchema = z.object({});
