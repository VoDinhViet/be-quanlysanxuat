import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import { OrderStatus } from '../../database/schemas';
import {
  chainable,
  chainableMock,
  QueryMockArgs,
} from '../../test-utils/chainable-mock.util';
import { CreateOrderReqDto } from './dto/create-order.req.dto';
import { GetOrdersReqDto } from './dto/get-orders.req.dto';
import { UpdateOrderReqDto } from './dto/update-order.req.dto';
import { OrdersService } from './orders.service';

/** Minimal stand-in for drizzle's insert builder: `.values().returning()` or a bare `await`. */
interface InsertChain {
  values: jest.Mock;
  returning: jest.Mock;
  then: (resolve: (value: unknown) => unknown) => unknown;
}

describe('OrdersService', () => {
  let service: OrdersService;
  let mockDb: {
    query: {
      orders: {
        findMany: jest.Mock<any, [QueryMockArgs]>;
        findFirst: jest.Mock<any, [QueryMockArgs]>;
      };
      clients: { findFirst: jest.Mock };
      users: { findFirst: jest.Mock };
      products: { findMany: jest.Mock };
    };
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    transaction: jest.Mock;
  };
  /** Rows handed to each `insert(...).values(...)` call, in order. */
  let insertedValues: unknown[];

  /**
   * `chainable()` hands back a fresh jest.fn on every property access, so `.values()` arguments
   * can't be read back from it. This capturing variant records them while still supporting both
   * `insert().values().returning()` and a bare `await insert().values()`.
   */
  const buildInsertMock = () =>
    jest.fn(() => {
      const chain: InsertChain = {
        values: jest.fn((rows: unknown) => {
          insertedValues.push(rows);
          return chain;
        }),
        returning: jest.fn().mockResolvedValue([{ id: 'new-order-id' }]),
        then: (resolve) => resolve(undefined),
      };
      return chain;
    });

  const DETAIL_ROW = {
    id: 'new-order-id',
    code: 'SO0001',
    clientId: 'client-1',
    staffId: null,
    orderDate: new Date('2026-07-24'),
    deliveryDate: null as Date | null,
    paymentTerms: null,
    status: OrderStatus.DRAFT,
    totalAmount: '0.00',
    note: null,
    client: { id: 'client-1', code: 'KH0001', name: 'Công ty A' },
    staff: null,
    creator: { id: 'user-1', username: 'admin' },
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const buildListReqDto = (
    overrides: Partial<GetOrdersReqDto> = {},
  ): GetOrdersReqDto => Object.assign(new GetOrdersReqDto(), overrides);

  const buildCreateReqDto = (
    overrides: Partial<CreateOrderReqDto> = {},
  ): CreateOrderReqDto =>
    Object.assign(new CreateOrderReqDto(), {
      clientId: 'client-1',
      ...overrides,
    });

  beforeEach(async () => {
    insertedValues = [];
    mockDb = {
      query: {
        orders: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
          findFirst: jest
            .fn<any, [QueryMockArgs]>()
            .mockResolvedValue(DETAIL_ROW),
        },
        clients: {
          findFirst: jest.fn().mockResolvedValue({ id: 'client-1' }),
        },
        users: { findFirst: jest.fn().mockResolvedValue({ id: 'staff-1' }) },
        products: {
          findMany: jest.fn().mockResolvedValue([{ id: 'product-1' }]),
        },
      },
      select: chainableMock([{ total: 0 }]),
      insert: buildInsertMock(),
      update: chainableMock(undefined),
      delete: chainableMock(undefined),
      // Passing mockDb itself as the transaction handle keeps `tx.insert(...)` pointing at the
      // same jest mock, so call-count assertions work whether a write is inside the tx or not.
      transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(mockDb),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OrdersService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrders', () => {
    it('paginates with default page options and pulls the list relations', async () => {
      await service.getOrders(buildListReqDto());

      const callArgs = mockDb.query.orders.findMany.mock.calls[0][0];
      expect(callArgs.limit).toBe(10);
      expect(callArgs.offset).toBe(0);
      expect(callArgs.with).toEqual({
        client: true,
        staff: true,
        creator: true,
      });
    });

    it('builds a keyword search predicate when q is given', async () => {
      await service.getOrders(buildListReqDto({ q: 'SO0001' }));

      expect(mockDb.query.orders.findMany.mock.calls[0][0].where).toBeDefined();
    });

    it('builds a predicate for each filter', async () => {
      await service.getOrders(
        buildListReqDto({
          status: OrderStatus.CONFIRMED,
          clientId: 'client-1',
          staffId: 'staff-1',
          fromDate: new Date('2026-07-01'),
          toDate: new Date('2026-07-31'),
        }),
      );

      expect(mockDb.query.orders.findMany.mock.calls[0][0].where).toBeDefined();
    });

    it('marks an order overdue when past its deliveryDate and not in a terminal state', async () => {
      mockDb.query.orders.findMany.mockResolvedValue([
        {
          ...DETAIL_ROW,
          deliveryDate: new Date('2020-01-01'),
          status: OrderStatus.DRAFT,
        },
      ]);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getOrders(buildListReqDto());

      expect(result.data[0].isOverdue).toBe(true);
    });

    it('never marks a COMPLETED order overdue, even past its deliveryDate', async () => {
      mockDb.query.orders.findMany.mockResolvedValue([
        {
          ...DETAIL_ROW,
          deliveryDate: new Date('2020-01-01'),
          status: OrderStatus.COMPLETED,
        },
      ]);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getOrders(buildListReqDto());

      expect(result.data[0].isOverdue).toBe(false);
    });

    it('is never overdue without a deliveryDate', async () => {
      mockDb.query.orders.findMany.mockResolvedValue([DETAIL_ROW]);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getOrders(buildListReqDto());

      expect(result.data[0].isOverdue).toBe(false);
    });
  });

  describe('getOrderStats', () => {
    it('aggregates order count/value by status and counts overdue separately', async () => {
      // First `select` call = the grouped status/count/sum query; second = the overdue count.
      mockDb.select = jest
        .fn()
        .mockImplementationOnce(() =>
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          chainable([
            { status: OrderStatus.DRAFT, total: 2, value: '100.00' },
            { status: OrderStatus.COMPLETED, total: 1, value: '50.00' },
          ]),
        )
        .mockImplementationOnce(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          () => chainable([{ total: 1 }]),
        );

      const result = await service.getOrderStats();

      expect(result.totalOrders).toBe(3);
      expect(result.totalValue).toBe(150);
      expect(result.draft).toBe(2);
      expect(result.completed).toBe(1);
      expect(result.confirmed).toBe(0);
      expect(result.cancelled).toBe(0);
      expect(result.overdue).toBe(1);
    });
  });

  describe('getOrderDetail', () => {
    it('returns the mapped order with items ordered by sortOrder', async () => {
      const result = await service.getOrderDetail('new-order-id');

      expect(result.code).toBe('SO0001');
      const callArgs = mockDb.query.orders.findFirst.mock.calls[0][0];
      const withArg = callArgs.with as Record<string, unknown>;
      expect(withArg.client).toBe(true);
      expect(withArg.staff).toBe(true);
      expect(withArg.creator).toBe(true);
      expect((withArg.items as Record<string, unknown>).with).toEqual({
        product: true,
      });
    });

    it('throws E057 when the order does not exist', async () => {
      mockDb.query.orders.findFirst.mockResolvedValue(undefined);

      await expect(service.getOrderDetail('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E057 },
      });
    });
  });

  describe('createOrder', () => {
    it('auto-generates a code, validates the client, and inserts with a zero total when no items', async () => {
      const result = await service.createOrder(buildCreateReqDto(), 'user-1');

      expect(mockDb.query.clients.findFirst).toHaveBeenCalled();
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(mockDb.insert).toHaveBeenCalledTimes(1); // order row only, no items
      const orderRow = insertedValues[0] as Record<string, unknown>;
      expect(orderRow.code).toBe('SO0001');
      expect(orderRow.totalAmount).toBe('0.00');
      expect(orderRow.createdBy).toBe('user-1');
      expect(result).toBeDefined();
    });

    it('computes lineTotal/totalAmount from items and defaults sortOrder to submission order', async () => {
      await service.createOrder(
        buildCreateReqDto({
          items: [
            { productId: 'product-1', quantity: 2, unitPrice: 100 },
            { productId: 'product-1', quantity: 1, unitPrice: 50 },
          ],
        }),
        'user-1',
      );

      expect(mockDb.query.products.findMany).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalledTimes(2); // order row + items

      const orderRow = insertedValues[0] as Record<string, unknown>;
      expect(orderRow.totalAmount).toBe('250.00');

      const itemRows = insertedValues[1] as Record<string, unknown>[];
      expect(itemRows[0]).toMatchObject({ lineTotal: '200.00', sortOrder: 0 });
      expect(itemRows[1]).toMatchObject({ lineTotal: '50.00', sortOrder: 1 });
    });

    it('throws E059 when the client does not exist', async () => {
      mockDb.query.clients.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createOrder(buildCreateReqDto(), 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E059 },
      });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E060 when the staff does not exist', async () => {
      mockDb.query.users.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createOrder(buildCreateReqDto({ staffId: 'ghost' }), 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E060 },
      });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E061 when an item references a product that does not exist', async () => {
      mockDb.query.products.findMany.mockResolvedValue([]);

      await expect(
        service.createOrder(
          buildCreateReqDto({
            items: [{ productId: 'ghost', quantity: 1, unitPrice: 10 }],
          }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E061 },
      });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E058 when the explicit code is already taken', async () => {
      mockDb.query.orders.findFirst.mockResolvedValueOnce({
        id: 'other-order',
      });

      await expect(
        service.createOrder(buildCreateReqDto({ code: 'SO0001' }), 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E058 },
      });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('rolls back and never re-reads the detail when a write inside the transaction fails', async () => {
      const failure = new Error('item insert failed');
      mockDb.transaction.mockRejectedValue(failure);

      await expect(
        service.createOrder(buildCreateReqDto(), 'user-1'),
      ).rejects.toThrow(failure);
      // No explicit code was sent, so `orders.findFirst` (validateCodeUniqueness / the
      // post-commit re-fetch) is never called across the whole call.
      expect(mockDb.query.orders.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('updateOrder', () => {
    it('throws E057 when the order does not exist', async () => {
      mockDb.query.orders.findFirst.mockResolvedValue(undefined);

      await expect(
        service.updateOrder('missing', new UpdateOrderReqDto()),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E057 },
      });
    });

    it('issues a safe updatedAt-only UPDATE and leaves items untouched when omitted', async () => {
      await service.updateOrder('order-1', new UpdateOrderReqDto());

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('replaces items and recomputes totalAmount when items are sent', async () => {
      await service.updateOrder(
        'order-1',
        Object.assign(new UpdateOrderReqDto(), {
          items: [{ productId: 'product-1', quantity: 2, unitPrice: 100 }],
        }),
      );

      expect(mockDb.delete).toHaveBeenCalled(); // replaceOrderItems ran
      expect(mockDb.insert).toHaveBeenCalledTimes(1); // re-inserted items
    });

    it('clears items with an empty array without inserting anything', async () => {
      await service.updateOrder(
        'order-1',
        Object.assign(new UpdateOrderReqDto(), { items: [] }),
      );

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('throws E058 when the new code is already taken by another order', async () => {
      mockDb.query.orders.findFirst
        .mockResolvedValueOnce({ id: 'order-1' }) // ensureOrderExists
        .mockResolvedValueOnce({ id: 'other-order' }); // validateCodeUniqueness conflict

      await expect(
        service.updateOrder(
          'order-1',
          Object.assign(new UpdateOrderReqDto(), { code: 'SO0002' }),
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E058 },
      });
    });

    it('throws E059 when clientId is changed to a client that does not exist', async () => {
      mockDb.query.clients.findFirst.mockResolvedValue(undefined);

      await expect(
        service.updateOrder(
          'order-1',
          Object.assign(new UpdateOrderReqDto(), { clientId: 'ghost' }),
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E059 },
      });
    });
  });

  describe('deleteOrder', () => {
    it('soft-deletes the order', async () => {
      await service.deleteOrder('order-1');

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws E057 when the order does not exist', async () => {
      mockDb.query.orders.findFirst.mockResolvedValue(undefined);

      await expect(service.deleteOrder('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E057 },
      });
    });
  });
});
