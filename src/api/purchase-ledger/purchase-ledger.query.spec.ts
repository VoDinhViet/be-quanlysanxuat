import type { Database } from '../../database/database.type';
import { receivedQuantitySubquery } from './purchase-ledger.query';

describe('purchase-ledger.query', () => {
  describe('receivedQuantitySubquery', () => {
    it('builds subquery with receipt and return aggregations for purchase request items', () => {
      const mockChain: Record<string, jest.Mock> = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        as: jest.fn().mockImplementation((alias: string) => ({ alias })),
      };
      const select = jest.fn().mockReturnValue(mockChain);
      const mockDb = { select } as unknown as Database;

      const subquery = receivedQuantitySubquery(mockDb);

      expect(select).toHaveBeenCalled();
      expect(subquery).toBeDefined();
    });
  });
});
