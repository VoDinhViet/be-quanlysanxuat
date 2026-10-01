import type { PermissionCode } from '../../../constants/permission.constant';
import { RiskAiTools } from './risk.ai-tools';
import type { AiToolPermissionService } from '../core/ai-tool-permission.service';

describe('assess_operational_risks', () => {
  const reportsService = {
    getStats: jest.fn(),
    getAlerts: jest.fn(),
    getJobDueDate: jest.fn(),
    getOpenNcr: jest.fn(),
    getOutsourcingOrderDueDate: jest.fn(),
  };
  const inventoryDirectsService = { getInventoryDirects: jest.fn() };
  const purchaseOrdersService = { getPurchaseOrders: jest.fn() };

  const buildTool = (grantedCodes: PermissionCode[]) =>
    new RiskAiTools(
      reportsService as never,
      inventoryDirectsService as never,
      purchaseOrdersService as never,
      {
        loadGrantedCodes: jest.fn().mockResolvedValue(grantedCodes),
      } as unknown as AiToolPermissionService,
    ).getTools()[0];

  const run = async (grantedCodes: PermissionCode[]) =>
    JSON.parse(
      (await buildTool(grantedCodes).invoke(
        {},
        { configurable: { userId: 'user-1' } },
      )) as string,
    ) as {
      overallLevel: string;
      risks: { signal: string; level: string }[];
      skippedSources: string[];
    };

  beforeEach(() => {
    jest.clearAllMocks();
    reportsService.getStats.mockResolvedValue({
      orderDueDate: 0,
      upcomingDueOrders: 0,
    });
    reportsService.getAlerts.mockResolvedValue({
      jobDueDate: 6,
      openNcr: 0,
      outsourcingOrderDueDate: 0,
      upcomingDeliveries: 0,
    });
    reportsService.getJobDueDate.mockResolvedValue([{ code: 'JOB-1' }]);
    reportsService.getOpenNcr.mockResolvedValue([]);
    reportsService.getOutsourcingOrderDueDate.mockResolvedValue([]);
    inventoryDirectsService.getInventoryDirects.mockResolvedValue({
      data: [],
      pagination: { totalRecords: 0 },
    });
    purchaseOrdersService.getPurchaseOrders.mockResolvedValue({
      data: [],
      pagination: { totalRecords: 0 },
    });
  });

  it('skips sources the user has no permission for and says so', async () => {
    const result = await run(['reports:read']);

    expect(result.skippedSources).toHaveLength(2);
    expect(inventoryDirectsService.getInventoryDirects).not.toHaveBeenCalled();
    expect(purchaseOrdersService.getPurchaseOrders).not.toHaveBeenCalled();
    expect(result.overallLevel).toBe('CAO');
    expect(result.risks.map((risk) => risk.signal)).toEqual(['overdueJobs']);
  });

  it('reads every source for a super admin', async () => {
    const result = await run(['system:manage']);

    expect(result.skippedSources).toEqual([]);
    expect(inventoryDirectsService.getInventoryDirects).toHaveBeenCalled();
    expect(purchaseOrdersService.getPurchaseOrders).toHaveBeenCalled();
  });
});
