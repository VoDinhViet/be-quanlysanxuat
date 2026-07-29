import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import { Currency, OrderStatus } from '../../database/schemas';
import {
  chainableMock,
  QueryMockArgs,
} from '../../test-utils/chainable-mock.util';
import { FilesService } from '../files/files.service';
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

/** Minimal stand-in for drizzle's update builder: `.set().where()`. */
interface UpdateChain {
  set: jest.Mock;
  where: jest.Mock;
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
    execute: jest.Mock;
    transaction: jest.Mock;
  };
  let mockFilesService: { linkFiles: jest.Mock };
  /** Rows handed to each `insert(...).values(...)` call, in order. */
  let insertedValues: unknown[];
  /** Values handed to each `update(...).set(...)` call, in order. */
  let updatedValues: unknown[];

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

  /** Same rationale as `buildInsertMock` — captures what `.set()` was called with. */
  const buildUpdateMock = () =>
    jest.fn(() => {
      const chain: UpdateChain = {
        set: jest.fn((values: unknown) => {
          updatedValues.push(values);
          return chain;
        }),
        where: jest.fn().mockResolvedValue(undefined),
      };
      return chain;
    });

  const DETAIL_ROW = {
    id: 'new-order-id',
    code: 'SO0001',
    clientId: 'client-1',
    client: { id: 'client-1', code: 'KH0001', name: 'Khách hàng A' },
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    staffId: null,
    staff: null,
    orderDate: new Date('2026-07-27'),
    dueDate: null as Date | null,
    deliveryAddress: null,
    paymentTerm: null,
    currency: 'VND',
    exchangeRate: 1,
    status: OrderStatus.CONFIRMED,
    subtotal: 0,
    discountType: 'PERCENT',
    discountValue: 0,
    discountAmount: 0,
    vatPercent: 0,
    vatAmount: 0,
    shippingFee: 0,
    total: 0,
    note: null,
    internalNote: null,
    items: [],
    attachments: [],
    creator: { id: 'user-1', username: 'admin' },
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
      orderDate: new Date('2026-07-27'),
      dueDate: new Date('2026-08-01'),
      ...overrides,
    });

  beforeEach(async () => {
    insertedValues = [];
    updatedValues = [];
    mockDb = {
      query: {
        orders: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
          findFirst: jest
            .fn<any, [QueryMockArgs]>()
            .mockResolvedValue(DETAIL_ROW),
        },
        clients: { findFirst: jest.fn().mockResolvedValue({ id: 'client-1' }) },
        users: { findFirst: jest.fn().mockResolvedValue({ id: 'staff-1' }) },
        products: {
          findMany: jest.fn().mockResolvedValue([{ id: 'product-1' }]),
        },
      },
      select: chainableMock([{ total: 0 }]),
      insert: buildInsertMock(),
      update: buildUpdateMock(),
      delete: chainableMock(undefined),
      execute: jest.fn().mockResolvedValue(undefined),
      transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(mockDb),
      ),
    };
    mockFilesService = { linkFiles: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: FilesService, useValue: mockFilesService },
      ],
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
    it('paginates with default page options and pulls client/staff/creator', async () => {
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

    // `expired`/`totalVnd` are computed by Postgres (see `expiredSql`/`totalVndSql`), not
    // re-derived in JS from the fetched row — so a unit test can only confirm they're requested,
    // not the resulting values.
    it('requests expired and totalVnd as SQL extras computed by Postgres', async () => {
      await service.getOrders(buildListReqDto());

      const callArgs = mockDb.query.orders.findMany.mock.calls[0][0];
      expect(callArgs.extras).toHaveProperty('expired');
      expect(callArgs.extras).toHaveProperty('totalVnd');
    });
  });

  describe('getOrderStats', () => {
    it('reads the pre-aggregated stats row (6 dashboard cards) from a single query', async () => {
      mockDb.select = chainableMock([
        {
          totalOrders: 128,
          totalOrdersTrendPercent: 12,
          totalValue: 125_000_000_000,
          totalValueTrendPercent: 15,
          completedValue: 45_000_000_000,
          completedValuePercentOfTotal: 36,
          inProgress: 63,
          inProgressPercentOfTotal: 49.2,
          expired: 5,
          expiredTrendCount: -2,
          completed: 60,
          completedPercentOfTotal: 46.9,
        },
      ]);

      const result = await service.getOrderStats();

      expect(result.totalOrders).toBe(128);
      expect(result.totalOrdersTrendPercent).toBe(12);
      expect(result.totalValue).toBe(125_000_000_000);
      expect(result.completedValue).toBe(45_000_000_000);
      expect(result.inProgress).toBe(63);
      expect(result.expired).toBe(5);
      expect(result.expiredTrendCount).toBe(-2);
      expect(result.completed).toBe(60);
    });

    // `totalOrdersTrendPercent`/`totalValueTrendPercent` are `null` when there's no prior month
    // to compare against (Postgres side: see `mapNullableNumber` in the service, which guards
    // against `.mapWith(Number)` silently turning SQL `null` into a misleading `0`). This test
    // only checks the DTO mapping preserves `null` through `plainToInstance` — the SQL/mapWith
    // behaviour itself needs a real Postgres round trip, not a mock.
    it('keeps trend percentages null when there is no prior month to compare against', async () => {
      mockDb.select = chainableMock([
        {
          totalOrders: 3,
          totalOrdersTrendPercent: null,
          totalValue: 100,
          totalValueTrendPercent: null,
          completedValue: 0,
          completedValuePercentOfTotal: 0,
          inProgress: 0,
          inProgressPercentOfTotal: 0,
          expired: 0,
          expiredTrendCount: 0,
          completed: 0,
          completedPercentOfTotal: 0,
        },
      ]);

      const result = await service.getOrderStats();

      expect(result.totalOrdersTrendPercent).toBeNull();
      expect(result.totalValueTrendPercent).toBeNull();
    });
  });

  describe('getOrderDetail', () => {
    it('returns the mapped order and requests expired + full nested relations', async () => {
      const result = await service.getOrderDetail('new-order-id');

      expect(result.code).toBe('SO0001');
      const callArgs = mockDb.query.orders.findFirst.mock.calls[0][0];
      expect(callArgs.extras).toHaveProperty('expired');
      expect(callArgs.extras).toHaveProperty('totalVnd');
      expect(callArgs.with).toMatchObject({
        client: true,
        staff: true,
        creator: true,
        attachments: { with: { file: true } },
        items: {
          with: { product: { with: { unit: true, imageFile: true } } },
        },
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
    it('auto-generates a code and inserts the order row even without items', async () => {
      const result = await service.createOrder(buildCreateReqDto(), 'user-1');

      expect(mockDb.query.clients.findFirst).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      const orderRow = insertedValues[0] as Record<string, unknown>;
      expect(orderRow.code).toBe('SO0001');
      expect(orderRow.status).toBe(OrderStatus.CONFIRMED);
      expect(orderRow.createdBy).toBe('user-1');
      // No amount field on the DTO ever reaches the row — server-computed via recalculateTotals.
      expect(orderRow).not.toHaveProperty('total');
      // The two-statement recalculation still runs even with zero lines.
      expect(mockDb.execute).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
    });

    // getOrderStats/totalVndSql convert every order to VND via `total * exchangeRate` — a
    // non-1 rate on a VND order would silently corrupt that conversion, so the service pins it
    // to 1 regardless of what the request sends, whether currency is left to its VND default or
    // set explicitly.
    it('pins exchangeRate to 1 for a VND order even if the request sends something else', async () => {
      await service.createOrder(
        buildCreateReqDto({ exchangeRate: 25000 }),
        'user-1',
      );

      const orderRow = insertedValues[0] as Record<string, unknown>;
      expect(orderRow.currency).toBeUndefined(); // defaults to VND on the DB column itself.
      expect(orderRow.exchangeRate).toBe(1);
    });

    it('pins exchangeRate to 1 when currency is explicitly VND', async () => {
      await service.createOrder(
        buildCreateReqDto({ currency: Currency.VND, exchangeRate: 25000 }),
        'user-1',
      );

      const orderRow = insertedValues[0] as Record<string, unknown>;
      expect(orderRow.exchangeRate).toBe(1);
    });

    it('keeps the request exchangeRate for a non-VND order', async () => {
      await service.createOrder(
        buildCreateReqDto({ currency: Currency.USD, exchangeRate: 26235.49 }),
        'user-1',
      );

      const orderRow = insertedValues[0] as Record<string, unknown>;
      expect(orderRow.exchangeRate).toBe(26235.49);
    });

    it('inserts items and validates every productId in one query when items are sent', async () => {
      await service.createOrder(
        buildCreateReqDto({
          items: [
            { productId: 'product-1', quantity: 2 },
            { productId: 'product-1', quantity: 1 },
          ],
        }),
        'user-1',
      );

      expect(mockDb.query.products.findMany).toHaveBeenCalledTimes(1);
      // order row + items.
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
      expect(insertedValues[1]).toHaveLength(2);
    });

    it('inserts attachments only when attachmentFileIds is provided', async () => {
      await service.createOrder(
        buildCreateReqDto({ attachmentFileIds: ['file-a', 'file-b'] }),
        'user-1',
      );

      // order row + attachments.
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
      expect(insertedValues[1]).toEqual([
        { orderId: 'new-order-id', fileId: 'file-a' },
        { orderId: 'new-order-id', fileId: 'file-b' },
      ]);
    });

    it('links attachment files before opening the transaction', async () => {
      await service.createOrder(
        buildCreateReqDto({ attachmentFileIds: ['doc-a'] }),
        'user-1',
      );

      expect(mockFilesService.linkFiles).toHaveBeenCalledWith(['doc-a']);
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
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('throws E059 when clientId does not reference an existing client', async () => {
      mockDb.query.clients.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createOrder(buildCreateReqDto(), 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E059 },
      });
    });

    it('creates the order without checking a client when clientId is omitted', async () => {
      const result = await service.createOrder(
        buildCreateReqDto({ clientId: undefined }),
        'user-1',
      );

      expect(mockDb.query.clients.findFirst).not.toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    it('throws E060 when staffId does not reference an existing user', async () => {
      mockDb.query.users.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createOrder(
          buildCreateReqDto({ staffId: 'missing-staff' }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E060 },
      });
    });

    it('throws E061 when a line productId does not reference an existing product', async () => {
      mockDb.query.products.findMany.mockResolvedValue([]);

      await expect(
        service.createOrder(
          buildCreateReqDto({
            items: [{ productId: 'missing-product', quantity: 1 } as any],
          }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E061 },
      });
    });

    // Required by .claude/rules/testing.md for any service that opens a transaction: the error
    // must propagate AND the post-commit re-fetch must not run.
    it('rolls back and never re-reads the detail when a write inside the transaction fails', async () => {
      const failure = new Error('item insert failed');
      mockDb.transaction.mockRejectedValue(failure);

      await expect(
        service.createOrder(buildCreateReqDto(), 'user-1'),
      ).rejects.toThrow(failure);
      // Only the code-uniqueness probe ran; the detail re-fetch (2nd call) never happened.
      expect(mockDb.query.orders.findFirst).toHaveBeenCalledTimes(0);
    });
  });

  describe('updateOrder', () => {
    const EDITABLE_ORDER = {
      id: 'order-1',
      status: OrderStatus.CONFIRMED,
      currency: Currency.VND,
    };
    const EDITABLE_USD_ORDER = {
      id: 'order-1',
      status: OrderStatus.CONFIRMED,
      currency: Currency.USD,
    };
    const IN_PROGRESS_ORDER = {
      id: 'order-1',
      status: OrderStatus.IN_PROGRESS,
    };
    const COMPLETED_ORDER = { id: 'order-1', status: OrderStatus.COMPLETED };
    const CANCELLED_ORDER = { id: 'order-1', status: OrderStatus.CANCELLED };

    it('throws E057 when the order does not exist', async () => {
      mockDb.query.orders.findFirst.mockResolvedValue(undefined);

      await expect(
        service.updateOrder('missing', new UpdateOrderReqDto()),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E057 },
      });
    });

    it('throws E065 when the order is COMPLETED', async () => {
      mockDb.query.orders.findFirst.mockResolvedValueOnce(COMPLETED_ORDER);

      await expect(
        service.updateOrder('order-1', new UpdateOrderReqDto()),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E065 },
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('throws E065 when the order is CANCELLED', async () => {
      mockDb.query.orders.findFirst.mockResolvedValueOnce(CANCELLED_ORDER);

      await expect(
        service.updateOrder('order-1', new UpdateOrderReqDto()),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E065 },
      });
    });

    it('allows updating an IN_PROGRESS order (only COMPLETED/CANCELLED are locked)', async () => {
      mockDb.query.orders.findFirst.mockResolvedValueOnce(IN_PROGRESS_ORDER);

      await expect(
        service.updateOrder('order-1', new UpdateOrderReqDto()),
      ).resolves.toBeDefined();
      expect(mockDb.update).toHaveBeenCalled();
    });

    // A PATCH touching only `items` leaves every order-level field `undefined`. `.update()` is
    // still called with that all-`undefined` payload — `chainableMock()` doesn't reproduce
    // drizzle's real "No values to set" throw on it (see `.claude/rules/testing.md`), so this only
    // proves the call shape: in production this PATCH shape now 500s before `recalculateTotals`
    // ever runs.
    it('still issues an UPDATE call and recalculates totals when only items are sent', async () => {
      mockDb.query.orders.findFirst.mockResolvedValueOnce(EDITABLE_ORDER);

      await expect(
        service.updateOrder(
          'order-1',
          Object.assign(new UpdateOrderReqDto(), {
            items: [{ productId: 'product-1', quantity: 1 } as any],
          }),
        ),
      ).resolves.toBeDefined();

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.delete).toHaveBeenCalledTimes(1); // replaceItems
      expect(mockDb.execute).toHaveBeenCalledTimes(2); // recalculateTotals
    });

    it('recalculates totals even when items is omitted (header-only change)', async () => {
      mockDb.query.orders.findFirst.mockResolvedValueOnce(EDITABLE_ORDER);

      await service.updateOrder(
        'order-1',
        Object.assign(new UpdateOrderReqDto(), { vatPercent: 10 }),
      );

      expect(mockDb.delete).not.toHaveBeenCalled();
      expect(mockDb.execute).toHaveBeenCalledTimes(2);
    });

    it('clears items when an empty array is sent', async () => {
      mockDb.query.orders.findFirst.mockResolvedValueOnce(EDITABLE_ORDER);

      await service.updateOrder(
        'order-1',
        Object.assign(new UpdateOrderReqDto(), { items: [] }),
      );

      expect(mockDb.delete).toHaveBeenCalledTimes(1);
      // delete ran, but nothing to re-insert.
      expect(insertedValues).toHaveLength(0);
    });

    it('replaces attachments only when attachmentFileIds is present in the request', async () => {
      mockDb.query.orders.findFirst.mockResolvedValueOnce(EDITABLE_ORDER);

      await service.updateOrder(
        'order-1',
        Object.assign(new UpdateOrderReqDto(), {
          attachmentFileIds: ['file-a'],
        }),
      );

      expect(mockDb.delete).toHaveBeenCalledTimes(1); // attachments only
    });

    // getOrderStats/totalVndSql convert every order to VND via `total * exchangeRate` — pin it
    // to 1 whenever the order's effective currency (request value, or the existing row's when
    // the request doesn't touch `currency`) is VND, exactly like createOrder.
    it('pins exchangeRate to 1 when the request switches a USD order to VND', async () => {
      mockDb.query.orders.findFirst.mockResolvedValueOnce(EDITABLE_USD_ORDER);

      await service.updateOrder(
        'order-1',
        Object.assign(new UpdateOrderReqDto(), {
          currency: Currency.VND,
          exchangeRate: 25000,
        }),
      );

      expect(updatedValues[0]).toMatchObject({ exchangeRate: 1 });
    });

    it('pins exchangeRate to 1 on a header-only change to an existing VND order', async () => {
      mockDb.query.orders.findFirst.mockResolvedValueOnce(EDITABLE_ORDER);

      await service.updateOrder(
        'order-1',
        Object.assign(new UpdateOrderReqDto(), { vatPercent: 10 }),
      );

      expect(updatedValues[0]).toMatchObject({
        exchangeRate: 1,
        vatPercent: 10,
      });
    });

    it('keeps the request exchangeRate for a USD order left unchanged', async () => {
      mockDb.query.orders.findFirst.mockResolvedValueOnce(EDITABLE_USD_ORDER);

      await service.updateOrder(
        'order-1',
        Object.assign(new UpdateOrderReqDto(), { exchangeRate: 26500 }),
      );

      expect(updatedValues[0]).toMatchObject({ exchangeRate: 26500 });
    });
  });

  describe('deleteOrder', () => {
    it('soft-deletes a CONFIRMED order', async () => {
      mockDb.query.orders.findFirst.mockResolvedValueOnce({
        id: 'order-1',
        status: OrderStatus.CONFIRMED,
      });

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

    it('throws E065 when the order is COMPLETED', async () => {
      mockDb.query.orders.findFirst.mockResolvedValueOnce({
        id: 'order-1',
        status: OrderStatus.COMPLETED,
      });

      await expect(service.deleteOrder('order-1')).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E065 },
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('throws E065 when the order is CANCELLED', async () => {
      mockDb.query.orders.findFirst.mockResolvedValueOnce({
        id: 'order-1',
        status: OrderStatus.CANCELLED,
      });

      await expect(service.deleteOrder('order-1')).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E065 },
      });
    });
  });
});
