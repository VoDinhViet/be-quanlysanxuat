import type { StructuredToolInterface } from '@langchain/core/tools';

import { ProductionJobStatus } from '../../../database/schemas';
import { AiToolPermissionService } from '../core/ai-tool-permission.service';
import { ProductionJobsAiTools } from './production-jobs.ai-tools';

// The real service pulls in puppeteer (ESM-only), which jest's CJS runtime can't load.
jest.mock('../../production-jobs/production-jobs.service', () => ({
  ProductionJobsService: class {},
}));

describe('production jobs tools', () => {
  const getProductionJobs = jest.fn();
  const getPermissionCodes = jest.fn();
  let listOverdueProductionJobs: StructuredToolInterface;

  beforeEach(() => {
    jest.clearAllMocks();
    getPermissionCodes.mockResolvedValue(['production:read']);
    [listOverdueProductionJobs] = new ProductionJobsAiTools(
      { getProductionJobs } as never,
      new AiToolPermissionService({ getPermissionCodes } as never),
    ).getTools();
  });

  const invoke = (input: object = {}, userId = 'user-1') =>
    listOverdueProductionJobs.invoke(input, {
      configurable: { userId },
    }) as Promise<string>;

  it('returns the FORBIDDEN payload and never reads jobs without permission', async () => {
    getPermissionCodes.mockResolvedValue(['orders:read']);

    const result = JSON.parse(await invoke()) as { error: string };

    expect(result.error).toBe('FORBIDDEN');
    expect(getPermissionCodes).toHaveBeenCalledWith('user-1');
    expect(getProductionJobs).not.toHaveBeenCalled();
  });

  it('asks only for unfinished jobs past their due date and returns the job summary', async () => {
    getProductionJobs.mockResolvedValue({
      data: [
        {
          id: 'job-id',
          code: 'JOB-1',
          orderCode: 'SO-1',
          buyerPoNo: 'PO-9',
          client: {
            id: 'c1',
            code: 'KH-1',
            name: 'Khách A',
            taxCode: '0123',
            phoneNumber: '0900',
            email: 'a@b.c',
            address: 'Hà Nội',
          },
          item: { id: 'i1', code: 'TR-1', revision: 'A', name: 'Trục' },
          quantity: 10,
          dueDate: new Date('2026-09-20T00:00:00.000Z'),
          status: ProductionJobStatus.IN_PROGRESS,
          image: { url: 'https://files/x.png' },
        },
      ],
      pagination: { totalRecords: 7 },
    });

    const result = JSON.parse(await invoke({ limit: 5 })) as {
      total: number;
      rows: Record<string, unknown>[];
    };

    const request = (
      getProductionJobs.mock.calls as [
        { limit: number; statuses: ProductionJobStatus[]; endDate: Date },
      ][]
    )[0][0];
    expect(request.limit).toBe(5);
    expect(request.statuses).not.toContain(ProductionJobStatus.COMPLETED);
    expect(request.endDate).toBeInstanceOf(Date);
    expect(result.total).toBe(7);
    expect(result.rows).toEqual([
      {
        code: 'JOB-1',
        orderCode: 'SO-1',
        buyerPoNo: 'PO-9',
        client: { id: 'c1', code: 'KH-1', name: 'Khách A' },
        item: { id: 'i1', code: 'TR-1', revision: 'A', name: 'Trục' },
        quantity: 10,
        dueDate: '20/09/2026',
        status: 'IN_PROGRESS',
      },
    ]);
  });
});
