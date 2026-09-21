import { receivedQuantitySubquery } from './purchase-ledger.query';

describe('purchase-ledger.query', () => {
  describe('receivedQuantitySubquery', () => {
    it('builds subquery with receipt and return aggregations for purchase request items', () => {
      const mockChain: any = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        as: jest.fn().mockImplementation((alias: string) => ({ alias })),
      };
      const mockDb = {
        select: jest.fn().mockReturnValue(mockChain),
      } as any;

      const subquery = receivedQuantitySubquery(mockDb);

      expect(mockDb.select).toHaveBeenCalled();
      expect(subquery).toBeDefined();
    });
  });
});
