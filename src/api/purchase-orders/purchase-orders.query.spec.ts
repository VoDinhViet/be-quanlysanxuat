import { InventoryDocumentStatus } from '../../database/schemas';
import {
  getReceivedQuantityByPurchaseOrderItemId,
  orderReceivedQuantitySubquery,
} from './purchase-orders.query';

describe('purchase-orders.query', () => {
  describe('orderReceivedQuantitySubquery', () => {
    it('builds subquery with receipt and return aggregations', () => {
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

      const subquery = orderReceivedQuantitySubquery(mockDb);

      expect(mockDb.select).toHaveBeenCalled();
      expect(subquery).toBeDefined();
    });
  });
  describe('getReceivedQuantityByPurchaseOrderItemId', () => {
    it('returns empty Map when purchaseOrderItemIds is empty', async () => {
      const mockDb = { select: jest.fn() } as any;

      const result = await getReceivedQuantityByPurchaseOrderItemId(mockDb, {
        purchaseOrderItemIds: [],
        statuses: [InventoryDocumentStatus.POSTED],
      });

      expect(result.size).toBe(0);
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('deducts returned quantity from received quantity for each purchase order item', async () => {
      const receivedRows = [
        { purchaseOrderItemId: 'poi-1', received: 100 },
        { purchaseOrderItemId: 'poi-2', received: 50 },
      ];
      const returnedRows = [{ purchaseOrderItemId: 'poi-1', returned: 30 }];

      let callCount = 0;
      const mockDb = {
        select: jest.fn().mockImplementation(() => {
          callCount++;
          const currentCall = callCount;
          return {
            from: jest.fn().mockReturnValue({
              innerJoin: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnValue({
                  groupBy: jest.fn().mockImplementation(() => {
                    if (currentCall === 1) {
                      return Promise.resolve(receivedRows);
                    }
                    return Promise.resolve(returnedRows);
                  }),
                }),
              }),
            }),
          };
        }),
      } as any;

      const result = await getReceivedQuantityByPurchaseOrderItemId(mockDb, {
        purchaseOrderItemIds: ['poi-1', 'poi-2'],
        statuses: [InventoryDocumentStatus.POSTED],
      });

      // poi-1: 100 received - 30 returned = 70 net
      expect(result.get('poi-1')).toBe(70);
      // poi-2: 50 received - 0 returned = 50 net
      expect(result.get('poi-2')).toBe(50);
    });

    it('clamps net received quantity to 0 if returned exceeds received', async () => {
      const receivedRows = [{ purchaseOrderItemId: 'poi-1', received: 20 }];
      const returnedRows = [{ purchaseOrderItemId: 'poi-1', returned: 30 }];

      let callCount = 0;
      const mockDb = {
        select: jest.fn().mockImplementation(() => {
          callCount++;
          const currentCall = callCount;
          return {
            from: jest.fn().mockReturnValue({
              innerJoin: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnValue({
                  groupBy: jest.fn().mockImplementation(() => {
                    if (currentCall === 1) {
                      return Promise.resolve(receivedRows);
                    }
                    return Promise.resolve(returnedRows);
                  }),
                }),
              }),
            }),
          };
        }),
      } as any;

      const result = await getReceivedQuantityByPurchaseOrderItemId(mockDb, {
        purchaseOrderItemIds: ['poi-1'],
        statuses: [InventoryDocumentStatus.POSTED],
      });

      expect(result.get('poi-1')).toBe(0);
    });
  });
});
