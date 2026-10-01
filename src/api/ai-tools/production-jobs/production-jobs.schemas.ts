import { z } from 'zod';

export const listOverdueProductionJobsSchema = z.object({
  limit: z
    .number()
    .int()
    .optional()
    .describe('Số dòng tối đa, mặc định 10, tối đa 20'),
});
export type ListOverdueProductionJobsInput = z.infer<
  typeof listOverdueProductionJobsSchema
>;
