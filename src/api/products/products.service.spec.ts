import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import {
  BomItemType,
  ProductStatus,
  ProductType,
  UnitScope,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import {
  chainableMock,
  QueryMockArgs,
} from '../../test-utils/chainable-mock.util';
import { FilesService } from '../files/files.service';
import { CreateProductReqDto } from './dto/create-product.req.dto';
import { GetProductsReqDto } from './dto/get-products.req.dto';
import { UpdateProductReqDto } from './dto/update-product.req.dto';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let mockDb: {
    query: {
      products: {
        findMany: jest.Mock<any, [QueryMockArgs]>;
        findFirst: jest.Mock;
      };
      units: { findFirst: jest.Mock };
      clients: { findFirst: jest.Mock };
      productGroups: { findFirst: jest.Mock };
      boms: { findFirst: jest.Mock };
      bomItems: { findMany: jest.Mock };
      routingSteps: { findMany: jest.Mock };
    };
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    transaction: jest.Mock;
  };
  let mockFilesService: { linkFiles: jest.Mock };

  const buildReqDto = (
    overrides: Partial<GetProductsReqDto> = {},
  ): GetProductsReqDto => Object.assign(new GetProductsReqDto(), overrides);

  /**
   * `chainable()` hands back a fresh jest.fn on every property access, so `.values()` arguments
   * can't be read back from it. This capturing variant records them for the tests that need to
   * assert on what was actually written (e.g. the `type` default, the cloned BOM/routing rows),
   * swapped into `mockDb.insert` only for those tests, same as `mockDb.select` is swapped
   * per-test elsewhere in this file. Every `insert(...).returning(...)` resolves to the same
   * `resultId` regardless of table — fine for these tests since they only assert on the rows
   * handed to `.values()`, not on realistic ids flowing back out.
   */
  const captureInsert = (resultId = 'new-product-id') => {
    const insertedValues: unknown[] = [];
    const insert = jest.fn(() => ({
      values: jest.fn((rows: unknown) => {
        insertedValues.push(rows);
        return { returning: jest.fn().mockResolvedValue([{ id: resultId }]) };
      }),
    }));
    return { insert, insertedValues };
  };

  beforeEach(async () => {
    mockDb = {
      query: {
        products: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
          findFirst: jest.fn(),
        },
        units: { findFirst: jest.fn() },
        clients: { findFirst: jest.fn() },
        productGroups: { findFirst: jest.fn() },
        // Defaults model "no BOM / no routing yet" — the common case for createProduct and for
        // most copyProduct tests. Individual tests override to exercise the clone paths.
        boms: { findFirst: jest.fn().mockResolvedValue(undefined) },
        bomItems: { findMany: jest.fn().mockResolvedValue([]) },
        routingSteps: { findMany: jest.fn().mockResolvedValue([]) },
      },
      select: chainableMock([{ total: 0 }]),
      insert: chainableMock([{ id: 'new-product-id' }]),
      update: chainableMock([{ id: 'product-1' }]),
      delete: chainableMock(undefined),
      // The callback receives `mockDb` itself, so call-count assertions work whether a write
      // sits inside the transaction or not.
      transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(mockDb),
      ),
    };
    mockFilesService = { linkFiles: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: FilesService, useValue: mockFilesService },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProducts', () => {
    it('excludes soft-deleted rows and applies no filter without q/filters', async () => {
      await service.getProducts(buildReqDto());

      const callArgs = mockDb.query.products.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
      expect(callArgs.limit).toBe(10);
      expect(callArgs.offset).toBe(0);
      expect(callArgs.with).toEqual({
        client: true,
        group: true,
        unit: true,
        creator: true,
        imageFile: true,
        source: { columns: { id: true, code: true, name: true } },
      });
    });

    it('applies clientId/productGroupId/type/status filters when provided', async () => {
      await service.getProducts(
        buildReqDto({
          clientId: 'client-1',
          productGroupId: 'group-1',
          type: ProductType.WORK_IN_PROGRESS,
          status: ProductStatus.ACTIVE,
        }),
      );

      expect(mockDb.query.products.findMany).toHaveBeenCalled();
    });

    it('returns the mapped paginated result', async () => {
      const rows = [{ id: 'p1', code: 'SP0001', name: 'Sản phẩm A' }];
      mockDb.query.products.findMany.mockResolvedValue(rows);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getProducts(buildReqDto());

      expect(result.data).toHaveLength(1);
      expect(result.pagination.totalRecords).toBe(1);
    });
  });

  describe('getProductDetail', () => {
    it('returns the mapped product when found', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({
        id: 'p1',
        code: 'SP0001',
      });

      const result = await service.getProductDetail('p1');

      expect(result).toBeDefined();
      expect(mockDb.query.products.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          with: {
            client: true,
            group: true,
            unit: true,
            creator: true,
            imageFile: true,
            source: { columns: { id: true, code: true, name: true } },
          },
        }),
      );
    });

    it('throws E007 not found when the product does not exist', async () => {
      mockDb.query.products.findFirst.mockResolvedValue(undefined);

      await expect(service.getProductDetail('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E007 },
      });
    });
  });

  describe('createProduct', () => {
    const reqDto: CreateProductReqDto = Object.assign(
      new CreateProductReqDto(),
      {
        name: 'Sản phẩm A',
        unitId: 'unit-1',
      },
    );

    it('auto-generates a code, validates FKs, and inserts', async () => {
      mockDb.select = chainableMock([{ total: 3 }]);
      mockDb.query.units.findFirst.mockResolvedValue({
        id: 'unit-1',
        scopes: [{ scope: UnitScope.PRODUCT }],
      });

      await service.createProduct(reqDto, 'user-1');

      expect(mockDb.query.units.findFirst).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('throws E008 when the explicit code is already taken', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({
        id: 'other-product',
      });

      await expect(
        service.createProduct(
          Object.assign(new CreateProductReqDto(), reqDto, { code: 'SP0001' }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E008 },
      });
    });

    it('throws E011 when unitId does not reference an existing unit', async () => {
      mockDb.query.units.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createProduct(reqDto, 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E011 },
      });
    });

    it('throws E043 when the unit exists but is not usable on products', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({
        id: 'unit-1',
        scopes: [{ scope: UnitScope.MATERIAL }],
      });

      await expect(
        service.createProduct(reqDto, 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: { errorCode: ErrorCode.E043 },
      });
    });

    it('throws E009 when clientId does not reference an existing client', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({
        id: 'unit-1',
        scopes: [{ scope: UnitScope.PRODUCT }],
      });
      mockDb.query.clients.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createProduct(
          Object.assign(new CreateProductReqDto(), reqDto, {
            clientId: 'client-1',
          }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E009 },
      });
    });

    it('validates imageFileId through the files registry', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({
        id: 'unit-1',
        scopes: [{ scope: UnitScope.PRODUCT }],
      });

      await service.createProduct(
        Object.assign(new CreateProductReqDto(), reqDto, {
          imageFileId: 'file-1',
        }),
        'user-1',
      );

      expect(mockFilesService.linkFiles).toHaveBeenCalledWith(['file-1']);
    });

    it('propagates E042 and never inserts when imageFileId is unknown', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({
        id: 'unit-1',
        scopes: [{ scope: UnitScope.PRODUCT }],
      });
      mockFilesService.linkFiles.mockRejectedValue(
        new AppException(ErrorCode.E042, HttpStatus.NOT_FOUND),
      );

      await expect(
        service.createProduct(
          Object.assign(new CreateProductReqDto(), reqDto, {
            imageFileId: 'ghost',
          }),
          'user-1',
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E042 } });
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('throws E010 when productGroupId does not reference an existing group', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({
        id: 'unit-1',
        scopes: [{ scope: UnitScope.PRODUCT }],
      });
      mockDb.query.productGroups.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createProduct(
          Object.assign(new CreateProductReqDto(), reqDto, {
            productGroupId: 'group-1',
          }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E010 },
      });
    });
  });

  describe('updateProduct', () => {
    it('throws E007 when the product does not exist', async () => {
      mockDb.query.products.findFirst.mockResolvedValue(undefined);

      await expect(
        service.updateProduct('missing', new UpdateProductReqDto()),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E007 },
      });
    });

    it('updates the product when it exists', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' }) // ensureProductExists
        .mockResolvedValueOnce({ id: 'p1', code: 'SP0002' }); // getProductDetail

      const result = await service.updateProduct(
        'p1',
        Object.assign(new UpdateProductReqDto(), { name: 'Tên mới' }),
      );

      expect(mockDb.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    // `chainableMock()` doesn't reproduce drizzle's real "No values to set" throw on an
    // all-`undefined` `.set()` payload (see `.claude/rules/testing.md`), so this only proves the
    // call shape, not that the real DB accepts it — an empty PATCH body now 500s in production.
    it('handles an empty PATCH body without throwing', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' }) // ensureProductExists
        .mockResolvedValueOnce({ id: 'p1' }); // getProductDetail

      await expect(
        service.updateProduct('p1', new UpdateProductReqDto()),
      ).resolves.toBeDefined();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws E008 when the new code is already taken by another product', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' }) // ensureProductExists
        .mockResolvedValueOnce({ id: 'other' }); // validateCodeUniqueness conflict

      await expect(
        service.updateProduct(
          'p1',
          Object.assign(new UpdateProductReqDto(), { code: 'SP0003' }),
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E008 },
      });
    });
  });

  describe('copyProduct', () => {
    it('inserts a new product copied from the original with a fresh code', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1', name: 'Sản phẩm A' }) // ensureProductExists
        .mockResolvedValueOnce({ id: 'new-product-id' }); // getProductDetail
      mockDb.select = chainableMock([{ total: 5 }]);

      const result = await service.copyProduct('p1', 'user-1');

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('throws E007 when the source product does not exist', async () => {
      mockDb.query.products.findFirst.mockResolvedValue(undefined);

      await expect(
        service.copyProduct('missing', 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E007 },
      });
    });

    it('carries the original type over onto the copy', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({
          id: 'p1',
          name: 'Sản phẩm A',
          type: ProductType.WORK_IN_PROGRESS,
        })
        .mockResolvedValueOnce({ id: 'copy-id' });
      mockDb.select = chainableMock([{ total: 5 }]);
      const { insert, insertedValues } = captureInsert('copy-id');
      mockDb.insert = insert;

      await service.copyProduct('p1', 'user-1');

      expect((insertedValues[0] as Record<string, unknown>).type).toBe(
        ProductType.WORK_IN_PROGRESS,
      );
    });

    it('records sourceProductId lineage on the copy', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1', name: 'Sản phẩm A' })
        .mockResolvedValueOnce({ id: 'copy-id' });
      mockDb.select = chainableMock([{ total: 5 }]);
      const { insert, insertedValues } = captureInsert('copy-id');
      mockDb.insert = insert;

      await service.copyProduct('p1', 'user-1');

      expect(
        (insertedValues[0] as Record<string, unknown>).sourceProductId,
      ).toBe('p1');
    });

    it('deep-clones the source BOM tree onto the copy, remapping ids/parentId', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1', name: 'Sản phẩm A' })
        .mockResolvedValueOnce({ id: 'copy-id' });
      mockDb.select = chainableMock([{ total: 5 }]);
      mockDb.query.boms.findFirst.mockResolvedValueOnce({ id: 'bom-src' });
      mockDb.query.bomItems.findMany.mockResolvedValueOnce([
        {
          id: 'item-root',
          parentId: null,
          itemType: BomItemType.PRODUCT,
          productId: 'wip-1',
          materialId: null,
          quantity: 2,
          path: 'n_old_root',
          level: 1,
          sortOrder: 0,
          note: null,
        },
        {
          id: 'item-child',
          parentId: 'item-root',
          itemType: BomItemType.MATERIAL,
          productId: null,
          materialId: 'mat-1',
          quantity: 3,
          path: 'n_old_root.n_old_child',
          level: 2,
          sortOrder: 0,
          note: null,
        },
      ]);
      const { insert, insertedValues } = captureInsert('copy-id');
      mockDb.insert = insert;

      await service.copyProduct('p1', 'user-1');

      const bomItemsBatch = insertedValues.find((rows) =>
        Array.isArray(rows),
      ) as Record<string, unknown>[];
      expect(bomItemsBatch).toHaveLength(2);
      const [root, child] = bomItemsBatch;
      expect(root.id).not.toBe('item-root');
      expect(root.parentId).toBeNull();
      expect(root.productId).toBe('wip-1');
      expect(root.level).toBe(1);
      expect(child.id).not.toBe('item-child');
      expect(child.parentId).toBe(root.id);
      expect(child.materialId).toBe('mat-1');
      expect(child.level).toBe(2);
    });

    it('clones the source Cấp 0 (root) routing steps onto the copy', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1', name: 'Sản phẩm A' })
        .mockResolvedValueOnce({ id: 'copy-id' });
      mockDb.select = chainableMock([{ total: 5 }]);
      mockDb.query.routingSteps.findMany.mockResolvedValueOnce([
        { operationId: 'operation-1', sortOrder: 0, note: null },
        { operationId: 'operation-2', sortOrder: 1, note: 'ghi chú' },
      ]);
      const { insert, insertedValues } = captureInsert('copy-id');
      mockDb.insert = insert;

      await service.copyProduct('p1', 'user-1');

      const routingBatch = insertedValues.find(
        (rows) =>
          Array.isArray(rows) &&
          (rows[0] as Record<string, unknown> | undefined)?.operationId,
      ) as Record<string, unknown>[];
      expect(routingBatch).toHaveLength(2);
      expect(routingBatch[0]).toMatchObject({
        productId: 'copy-id',
        bomItemId: null,
        operationId: 'operation-1',
        sortOrder: 0,
        createdBy: 'user-1',
      });
      expect(routingBatch[1]).toMatchObject({
        operationId: 'operation-2',
        note: 'ghi chú',
      });
    });

    it("clones each source node's own as-used routing onto the copy, remapped to the new bom_item id", async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1', name: 'Sản phẩm A' })
        .mockResolvedValueOnce({ id: 'copy-id' });
      mockDb.select = chainableMock([{ total: 5 }]);
      mockDb.query.boms.findFirst.mockResolvedValueOnce({ id: 'bom-src' });
      mockDb.query.bomItems.findMany.mockResolvedValueOnce([
        {
          id: 'item-root',
          parentId: null,
          itemType: BomItemType.PRODUCT,
          productId: 'wip-1',
          materialId: null,
          quantity: 2,
          path: 'n_old_root',
          level: 1,
          sortOrder: 0,
          note: null,
        },
      ]);
      // `routingSteps.findMany` is called twice by `copyProduct`: first for the Cấp 0 root
      // routing (none in this fixture), then for as-used node routing. Two source rows there: one
      // targets the cloned node (remapped), one targets a bomItemId that isn't in the cloned set
      // (defensively dropped, not inserted with a dangling reference).
      mockDb.query.routingSteps.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            bomItemId: 'item-root',
            operationId: 'operation-1',
            sortOrder: 0,
            note: null,
          },
          {
            bomItemId: 'orphan-item',
            operationId: 'operation-2',
            sortOrder: 0,
            note: null,
          },
        ]);
      const { insert, insertedValues } = captureInsert('copy-id');
      mockDb.insert = insert;

      await service.copyProduct('p1', 'user-1');

      const bomItemsBatch = insertedValues.find(
        (rows) =>
          Array.isArray(rows) &&
          (rows[0] as Record<string, unknown> | undefined)?.itemType,
      ) as Record<string, unknown>[];
      const newRootId = bomItemsBatch[0].id;

      const nodeRoutingBatch = insertedValues.find(
        (rows) =>
          Array.isArray(rows) &&
          (rows[0] as Record<string, unknown> | undefined)?.bomItemId,
      ) as Record<string, unknown>[];
      expect(nodeRoutingBatch).toHaveLength(1);
      expect(nodeRoutingBatch[0]).toMatchObject({
        productId: null,
        bomItemId: newRootId,
        operationId: 'operation-1',
        createdBy: 'user-1',
      });
    });

    // Required by .claude/rules/testing.md for any service that opens a transaction: the error
    // must propagate AND the post-commit re-fetch must not run.
    it('rolls back and never re-reads the detail when a write inside the transaction fails', async () => {
      mockDb.query.products.findFirst.mockResolvedValueOnce({
        id: 'p1',
        name: 'Sản phẩm A',
      });
      mockDb.select = chainableMock([{ total: 5 }]);
      const failure = new Error('insert failed');
      mockDb.transaction.mockRejectedValue(failure);

      await expect(service.copyProduct('p1', 'user-1')).rejects.toThrow(
        failure,
      );

      expect(mockDb.query.products.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe('type (FINISHED_GOOD/WORK_IN_PROGRESS)', () => {
    const reqDto: CreateProductReqDto = Object.assign(
      new CreateProductReqDto(),
      {
        name: 'Sản phẩm A',
        unitId: 'unit-1',
      },
    );

    beforeEach(() => {
      mockDb.query.units.findFirst.mockResolvedValue({
        id: 'unit-1',
        scopes: [{ scope: UnitScope.PRODUCT }],
      });
    });

    // No "defaults to FINISHED_GOOD when omitted" case here: `type` now has no app-level default
    // (the schema column does), so an omitted `type` simply carries no key into `.values()` — the
    // real default only applies once Postgres executes the insert, which this mock never does.

    it('respects an explicit type on create', async () => {
      const { insert, insertedValues } = captureInsert();
      mockDb.insert = insert;

      await service.createProduct(
        Object.assign(new CreateProductReqDto(), reqDto, {
          type: ProductType.WORK_IN_PROGRESS,
        }),
        'user-1',
      );

      expect((insertedValues[0] as Record<string, unknown>).type).toBe(
        ProductType.WORK_IN_PROGRESS,
      );
    });
  });
});
