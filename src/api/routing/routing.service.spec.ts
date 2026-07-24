import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import { BomItemType, OperationType } from '../../database/schemas';
import type { QueryMockArgs } from '../../test-utils/chainable-mock.util';
import { chainableMock } from '../../test-utils/chainable-mock.util';
import { CreateRoutingStepReqDto } from './dto/create-routing-step.req.dto';
import { UpdateRoutingStepReqDto } from './dto/update-routing-step.req.dto';
import { RoutingService } from './routing.service';

/** Minimal stand-in for drizzle's insert builder, capturing `.values()`/`.returning()` — same
 * shape as `BomsService`'s spec, simplified to a single insert (no header row here). */
interface InsertChain {
  values: jest.Mock;
  returning: jest.Mock;
  then: (resolve: (value: unknown) => unknown) => unknown;
}

/** Same idea for `.update().set()` — needed to assert the exact payload (`updatedAt` always
 * present, `sortOrder`/`note` only when provided). */
interface UpdateChain {
  set: jest.Mock;
  where: jest.Mock;
  then: (resolve: (value: unknown) => unknown) => unknown;
}

describe('RoutingService', () => {
  let service: RoutingService;
  let mockDb: {
    query: {
      products: { findFirst: jest.Mock };
      bomItems: { findFirst: jest.Mock };
      routingSteps: {
        findMany: jest.Mock<any, [QueryMockArgs]>;
        findFirst: jest.Mock<any, [QueryMockArgs]>;
      };
      operations: { findFirst: jest.Mock };
    };
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  /** Rows handed to the single `insert(routingSteps).values(...)` call, in order. */
  let insertedValues: unknown[];
  /** `.returning()` result for the insert call. */
  let insertReturning: { id: string }[];
  /** Payloads handed to each `update(...).set(...)` call, in order. */
  let updateSetValues: unknown[];

  const buildInsertMock = () =>
    jest.fn(() => {
      const chain: InsertChain = {
        values: jest.fn((rows: unknown) => {
          insertedValues.push(rows);
          return chain;
        }),
        returning: jest.fn(() => Promise.resolve(insertReturning)),
        then: (resolve) => resolve(undefined),
      };
      return chain;
    });

  const buildUpdateMock = () =>
    jest.fn(() => {
      const chain: UpdateChain = {
        set: jest.fn((values: unknown) => {
          updateSetValues.push(values);
          return chain;
        }),
        where: jest.fn(() => chain),
        then: (resolve) => resolve(undefined),
      };
      return chain;
    });

  const operation = (suffix: string) => ({
    id: `operation-${suffix}`,
    code: `CD${suffix}`,
    name: `Công đoạn ${suffix}`,
    type: OperationType.INHOUSE,
  });

  const row = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'step-1',
    sortOrder: 0,
    note: null,
    operation: operation('A'),
    createdAt: new Date('2026-07-22T00:00:00Z'),
    updatedAt: new Date('2026-07-22T00:00:00Z'),
    ...overrides,
  });

  /** A routable node: PRODUCT type, belonging to `p1`'s own BOM. */
  const routableBomItem = (
    overrides: Partial<Record<string, unknown>> = {},
  ) => ({
    id: 'item-1',
    itemType: BomItemType.PRODUCT,
    bom: { productId: 'p1' },
    ...overrides,
  });

  const rootTarget = { productId: 'p1' };
  const nodeTarget = { productId: 'p1', bomItemId: 'item-1' };

  beforeEach(async () => {
    insertedValues = [];
    insertReturning = [{ id: 'step-new' }];
    updateSetValues = [];

    mockDb = {
      query: {
        products: { findFirst: jest.fn() },
        bomItems: { findFirst: jest.fn() },
        routingSteps: {
          findMany: jest.fn<any, [QueryMockArgs]>(),
          findFirst: jest.fn<any, [QueryMockArgs]>(),
        },
        operations: { findFirst: jest.fn() },
      },
      insert: buildInsertMock(),
      update: buildUpdateMock(),
      delete: chainableMock(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RoutingService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<RoutingService>(RoutingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRouting', () => {
    it('throws E007 when the product does not exist (root target)', async () => {
      mockDb.query.products.findFirst.mockResolvedValue(undefined);

      await expect(service.getRouting(rootTarget)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E007 },
      });
      expect(mockDb.query.routingSteps.findMany).not.toHaveBeenCalled();
    });

    it('throws E062 when the bomItemId does not reference an existing node (node target)', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.bomItems.findFirst.mockResolvedValue(undefined);

      await expect(service.getRouting(nodeTarget)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E062 },
      });
      expect(mockDb.query.routingSteps.findMany).not.toHaveBeenCalled();
    });

    it("throws E062 when the bomItemId belongs to a different product's BOM", async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.bomItems.findFirst.mockResolvedValue(
        routableBomItem({ bom: { productId: 'other-product' } }),
      );

      await expect(service.getRouting(nodeTarget)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E062 },
      });
    });

    it('throws E063 when the bomItemId node is a MATERIAL leaf', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.bomItems.findFirst.mockResolvedValue(
        routableBomItem({ itemType: BomItemType.MATERIAL }),
      );

      await expect(service.getRouting(nodeTarget)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: { errorCode: ErrorCode.E063 },
      });
      expect(mockDb.query.routingSteps.findMany).not.toHaveBeenCalled();
    });

    it('returns an empty array when no routing is configured yet', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.routingSteps.findMany.mockResolvedValue([]);

      const result = await service.getRouting(rootTarget);

      expect(result).toEqual([]);
    });

    it('queries routingSteps with the operation relation, ordered by sortOrder then createdAt', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.routingSteps.findMany.mockResolvedValue([row()]);

      await service.getRouting(rootTarget);

      expect(mockDb.query.routingSteps.findMany).toHaveBeenCalledTimes(1);
      const callArgs = mockDb.query.routingSteps.findMany.mock.calls[0][0];
      expect(callArgs.with).toEqual({ operation: true });
      expect(callArgs.orderBy).toBeDefined();
    });

    it('maps each row to a RoutingStepResDto, exposing sortOrder/note/operation', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.routingSteps.findMany.mockResolvedValue([
        row({ sortOrder: 1, note: 'ghi chú', operation: operation('B') }),
      ]);

      const [dto] = await service.getRouting(rootTarget);

      expect(dto.sortOrder).toBe(1);
      expect(dto.note).toBe('ghi chú');
      expect(dto.operation).toEqual(operation('B'));
    });

    it('resolves a node target routing, scoped to bomItemId', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.bomItems.findFirst.mockResolvedValue(routableBomItem());
      mockDb.query.routingSteps.findMany.mockResolvedValue([row()]);

      const result = await service.getRouting(nodeTarget);

      expect(result).toHaveLength(1);
    });
  });

  describe('addStep', () => {
    beforeEach(() => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
    });

    it('throws E007 when the product does not exist', async () => {
      mockDb.query.products.findFirst.mockResolvedValue(undefined);
      const reqDto = Object.assign(new CreateRoutingStepReqDto(), {
        operationId: 'operation-A',
      });

      await expect(
        service.addStep({ productId: 'missing' }, reqDto, 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E007 },
      });
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('throws E046 when the operation does not exist', async () => {
      mockDb.query.operations.findFirst.mockResolvedValue(undefined);
      const reqDto = Object.assign(new CreateRoutingStepReqDto(), {
        operationId: 'missing-operation',
      });

      await expect(
        service.addStep(rootTarget, reqDto, 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E046 },
      });
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('throws E063 and never inserts when the node target is a MATERIAL leaf', async () => {
      mockDb.query.bomItems.findFirst.mockResolvedValue(
        routableBomItem({ itemType: BomItemType.MATERIAL }),
      );
      const reqDto = Object.assign(new CreateRoutingStepReqDto(), {
        operationId: 'operation-A',
      });

      await expect(
        service.addStep(nodeTarget, reqDto, 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: { errorCode: ErrorCode.E063 },
      });
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('inserts a root (Cấp 0) step with productId set and bomItemId null, defaulting sortOrder to 0', async () => {
      mockDb.query.operations.findFirst.mockResolvedValue({
        id: 'operation-A',
      });
      mockDb.query.routingSteps.findFirst.mockResolvedValue(
        row({ id: 'step-new' }),
      );
      const reqDto = Object.assign(new CreateRoutingStepReqDto(), {
        operationId: 'operation-A',
      });

      const result = await service.addStep(rootTarget, reqDto, 'user-1');

      expect(insertedValues).toEqual([
        {
          productId: 'p1',
          bomItemId: null,
          operationId: 'operation-A',
          sortOrder: 0,
          note: undefined,
          createdBy: 'user-1',
        },
      ]);
      expect(result.id).toBe('step-new');
    });

    it('inserts a node (as-used) step with bomItemId set and productId null', async () => {
      mockDb.query.bomItems.findFirst.mockResolvedValue(routableBomItem());
      mockDb.query.operations.findFirst.mockResolvedValue({
        id: 'operation-A',
      });
      mockDb.query.routingSteps.findFirst.mockResolvedValue(
        row({ id: 'step-new' }),
      );
      const reqDto = Object.assign(new CreateRoutingStepReqDto(), {
        operationId: 'operation-A',
        sortOrder: 3,
        note: 'ghi chú',
      });

      await service.addStep(nodeTarget, reqDto, 'user-1');

      expect(insertedValues[0]).toEqual({
        productId: null,
        bomItemId: 'item-1',
        operationId: 'operation-A',
        sortOrder: 3,
        note: 'ghi chú',
        createdBy: 'user-1',
      });
    });
  });

  describe('updateStep', () => {
    beforeEach(() => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
    });

    it('throws E007 when the product does not exist', async () => {
      mockDb.query.products.findFirst.mockResolvedValue(undefined);
      const reqDto = Object.assign(new UpdateRoutingStepReqDto(), {
        sortOrder: 1,
      });

      await expect(
        service.updateStep({ productId: 'missing' }, 'step-1', reqDto),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E007 },
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('throws E056 when the step does not exist under this target', async () => {
      mockDb.query.routingSteps.findFirst.mockResolvedValue(undefined);
      const reqDto = Object.assign(new UpdateRoutingStepReqDto(), {
        sortOrder: 1,
      });

      await expect(
        service.updateStep(rootTarget, 'missing', reqDto),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E056 },
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('spreads only updatedAt (sortOrder/note left undefined) when neither is provided', async () => {
      mockDb.query.routingSteps.findFirst
        .mockResolvedValueOnce({ id: 'step-1' }) // ensureStepExists
        .mockResolvedValueOnce(row({ id: 'step-1' })); // re-fetch after write
      const reqDto = new UpdateRoutingStepReqDto();

      await service.updateStep(rootTarget, 'step-1', reqDto);

      expect(updateSetValues).toHaveLength(1);
      const setValues = updateSetValues[0] as Record<string, unknown>;
      // `sortOrder`/`note` are still own keys on the spread object (class fields default to
      // `undefined`), but drizzle drops `undefined` values from the actual SQL `.set()` — asserting
      // the values, not the key list, is what matters here.
      expect(setValues.updatedAt).toBeInstanceOf(Date);
      expect(setValues.sortOrder).toBeUndefined();
      expect(setValues.note).toBeUndefined();
    });

    it('writes sortOrder and note when provided, on a node target', async () => {
      mockDb.query.bomItems.findFirst.mockResolvedValue(routableBomItem());
      mockDb.query.routingSteps.findFirst
        .mockResolvedValueOnce({ id: 'step-1' })
        .mockResolvedValueOnce(
          row({ id: 'step-1', sortOrder: 5, note: 'updated' }),
        );
      const reqDto = Object.assign(new UpdateRoutingStepReqDto(), {
        sortOrder: 5,
        note: 'updated',
      });

      const result = await service.updateStep(nodeTarget, 'step-1', reqDto);

      expect(updateSetValues[0]).toMatchObject({
        sortOrder: 5,
        note: 'updated',
      });
      expect(result.sortOrder).toBe(5);
      expect(result.note).toBe('updated');
    });
  });

  describe('deleteStep', () => {
    beforeEach(() => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
    });

    it('throws E007 when the product does not exist', async () => {
      mockDb.query.products.findFirst.mockResolvedValue(undefined);

      await expect(
        service.deleteStep({ productId: 'missing' }, 'step-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E007 },
      });
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('throws E056 when the step does not exist under this target', async () => {
      mockDb.query.routingSteps.findFirst.mockResolvedValue(undefined);

      await expect(
        service.deleteStep(rootTarget, 'missing'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E056 },
      });
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('deletes the step scoped to this target', async () => {
      mockDb.query.routingSteps.findFirst.mockResolvedValue({
        id: 'step-1',
      });

      const result = await service.deleteStep(rootTarget, 'step-1');

      expect(mockDb.delete).toHaveBeenCalledTimes(1);
      expect(result).toBeUndefined();
    });
  });
});
