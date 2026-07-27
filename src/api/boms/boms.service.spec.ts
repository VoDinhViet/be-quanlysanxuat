import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import {
  BomItemType,
  FileKind,
  OperationType,
  ProductType,
  UploadType,
} from '../../database/schemas';
import { setFileUrlResolver } from '../files/file-url-resolver';
import { FilesService } from '../files/files.service';
import type { QueryMockArgs } from '../../test-utils/chainable-mock.util';
import { chainable, chainableMock } from '../../test-utils/chainable-mock.util';
import { CreateBomItemReqDto } from './dto/create-bom-item.req.dto';
import { GetBomMaterialsReqDto } from './dto/get-bom-materials.req.dto';
import { UpdateBomItemReqDto } from './dto/update-bom-item.req.dto';
import { BomsService } from './boms.service';

/** Minimal stand-in for drizzle's insert builder, capturing `.values()`/`.returning()` calls
 * in order — `chainable()` can't report what `.values()` received (every property access hands
 * back a fresh jest.fn), and `addBomItem` may issue up to 2 inserts (boms header + bom_items) in
 * one transaction, each needing its own `.returning()` result. */
interface InsertChain {
  values: jest.Mock;
  onConflictDoNothing: jest.Mock;
  returning: jest.Mock;
  then: (resolve: (value: unknown) => unknown) => unknown;
}

/** Same idea for `.update().set()` — needed to assert the exact payload (quantity spread as-is;
 * `updated_at` is never in the payload, `$onUpdate` bumps it in Postgres). */
interface UpdateChain {
  set: jest.Mock;
  where: jest.Mock;
  then: (resolve: (value: unknown) => unknown) => unknown;
}

describe('BomsService', () => {
  let service: BomsService;
  let mockDb: {
    query: {
      products: { findFirst: jest.Mock };
      boms: { findFirst: jest.Mock };
      bomItems: { findFirst: jest.Mock };
      materials: { findFirst: jest.Mock };
      routingSteps: { findMany: jest.Mock<any, [QueryMockArgs]> };
    };
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    transaction: jest.Mock;
  };
  let mockFilesService: { linkFiles: jest.Mock; deleteFileById: jest.Mock };

  /** Rows handed to each `insert(...).values(...)` call, in order. */
  let insertedValues: unknown[];
  /** `.returning()` result for the Nth `insert(...)` call, in order — index 0 is the `boms`
   * header insert when one is needed, otherwise the single `bom_items` insert. */
  let insertReturningQueue: unknown[][];
  /** Payloads handed to each `update(...).set(...)` call, in order. */
  let updateSetValues: unknown[];

  const buildInsertMock = () => {
    let call = 0;
    return jest.fn(() => {
      const index = call++;
      const chain: InsertChain = {
        values: jest.fn((rows: unknown) => {
          insertedValues.push(rows);
          return chain;
        }),
        onConflictDoNothing: jest.fn(() => chain),
        returning: jest.fn(() =>
          Promise.resolve(insertReturningQueue[index] ?? []),
        ),
        then: (resolve) => resolve(undefined),
      };
      return chain;
    });
  };

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

  const unit = (suffix: string) => ({
    id: `unit-${suffix}`,
    code: `U${suffix}`,
    name: `Unit ${suffix}`,
  });

  const NO_IMAGE = {
    id: null,
    originalName: null,
    mimetype: null,
    size: null,
    type: null,
    kind: null,
    createdAt: null,
  };

  const image = (suffix: string) => ({
    id: `file-${suffix}`,
    originalName: `${suffix}.png`,
    mimetype: 'image/png',
    size: 1234,
    type: UploadType.PRODUCT_IMAGE,
    kind: FileKind.IMAGE,
    createdAt: new Date('2026-07-22T00:00:00Z'),
  });

  // Shape of a row as the SQL query (select + joins + coalesce) already returns it, BEFORE
  // `normalizeImage` collapses an all-null `image` to `null` — item normalization (product vs.
  // material) happens in SQL, so fixtures represent that post-join, pre-normalize shape directly.
  const row = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'a',
    parentId: null,
    itemType: BomItemType.PRODUCT,
    itemId: 'product-A',
    code: 'CUM-A',
    name: 'Cụm A',
    image: NO_IMAGE,
    unit: unit('A'),
    quantity: 1,
    sortOrder: 0,
    note: null,
    drawing: null,
    ...overrides,
  });

  const operation = (suffix: string) => ({
    id: `operation-${suffix}`,
    code: `CD${suffix}`,
    name: `Công đoạn ${suffix}`,
    type: OperationType.INHOUSE,
  });

  // Shape of a `routing_steps` row as `db.query.routingSteps.findMany({ with: { operation: true } })`
  // returns it — the raw join `loadOperationsByBomItem` groups by `bomItemId`.
  const routingStep = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'step-1',
    productId: null,
    bomItemId: 'a',
    operationId: 'operation-A',
    sortOrder: 0,
    note: null,
    createdBy: 'user-1',
    createdAt: new Date('2026-07-24T00:00:00Z'),
    updatedAt: new Date('2026-07-24T00:00:00Z'),
    operation: operation('A'),
    ...overrides,
  });

  const buildCreateReqDto = (
    overrides: Partial<CreateBomItemReqDto> = {},
  ): CreateBomItemReqDto =>
    Object.assign(new CreateBomItemReqDto(), {
      itemType: BomItemType.PRODUCT,
      itemId: 'wip-1',
      quantity: 2,
      ...overrides,
    });

  const buildUpdateReqDto = (
    overrides: Partial<UpdateBomItemReqDto> = {},
  ): UpdateBomItemReqDto => Object.assign(new UpdateBomItemReqDto(), overrides);

  beforeEach(async () => {
    // FileResDto.url is minted by a module-level resolver that FilesModule installs at bootstrap;
    // stub it so mapping a populated image doesn't throw "resolver not initialised" in unit tests.
    setFileUrlResolver((fileId) => `/api/files/${fileId}/download?sig=test`);

    insertedValues = [];
    insertReturningQueue = [];
    updateSetValues = [];

    mockFilesService = {
      linkFiles: jest.fn(),
      deleteFileById: jest.fn(),
    };

    mockDb = {
      query: {
        products: { findFirst: jest.fn() },
        boms: { findFirst: jest.fn() },
        bomItems: { findFirst: jest.fn() },
        materials: { findFirst: jest.fn() },
        // Default: no as-used routing on any node — most `getBomTree` tests don't exercise it.
        routingSteps: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
        },
      },
      select: chainableMock([]),
      insert: buildInsertMock(),
      update: buildUpdateMock(),
      delete: chainableMock(undefined),
      // Passing mockDb itself as the transaction handle keeps `tx.insert(...)`/`tx.query.*`
      // pointing at the same jest mocks, so call-count assertions work whether a write is inside
      // the tx or not.
      transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(mockDb),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomsService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: FilesService, useValue: mockFilesService },
      ],
    }).compile();

    service = module.get<BomsService>(BomsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBomTree', () => {
    it('throws E007 when the product does not exist', async () => {
      mockDb.query.products.findFirst.mockResolvedValue(undefined);

      await expect(service.getBomTree('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E007 },
      });
    });

    it('returns an empty array without querying items when the product has no BOM configured yet', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue(undefined);

      const result = await service.getBomTree('p1');

      expect(result).toEqual([]);
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('nests items by parentId and computes level by depth', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.select = chainableMock([
        row({ id: 'a', parentId: null }),
        row({ id: 'a1', parentId: 'a', itemId: 'product-A1', code: 'CT-A1' }),
      ]);

      const result = await service.getBomTree('p1');

      expect(result).toHaveLength(1);
      expect(result[0].level).toBe(1);
      expect(result[0].children[0].id).toBe('a1');
      expect(result[0].children[0].level).toBe(2);
    });

    it('normalizes an all-null coalesced image to null', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.select = chainableMock([row({ image: NO_IMAGE })]);

      const [node] = await service.getBomTree('p1');

      expect(node.image).toBeNull();
    });

    it('keeps a populated coalesced image', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.select = chainableMock([row({ image: image('a') })]);

      const [node] = await service.getBomTree('p1');

      expect(node.image?.id).toBe('file-a');
    });

    it("embeds a PRODUCT node's own as-used routing and leaves a MATERIAL node's empty", async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.select = chainableMock([
        row({ id: 'a', itemType: BomItemType.PRODUCT, itemId: 'product-A' }),
        row({
          id: 'm1',
          itemType: BomItemType.MATERIAL,
          itemId: 'material-A',
          code: 'VT-A',
          name: 'Vật tư A',
        }),
      ]);
      mockDb.query.routingSteps.findMany.mockResolvedValueOnce([
        routingStep({ id: 'step-1', bomItemId: 'a', sortOrder: 0 }),
        routingStep({
          id: 'step-2',
          bomItemId: 'a',
          sortOrder: 1,
          operation: operation('B'),
        }),
      ]);

      const [productNode, materialNode] = await service.getBomTree('p1');

      expect(productNode.operations.map((step) => step.id)).toEqual([
        'step-1',
        'step-2',
      ]);
      expect(materialNode.operations).toEqual([]);
      // Only the PRODUCT-typed node's own id is ever looked up.
      const callArgs = mockDb.query.routingSteps.findMany.mock.calls[0][0];
      expect(callArgs.with).toEqual({ operation: true });
    });

    it('skips the routing query entirely when the tree has no PRODUCT node', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.select = chainableMock([
        row({ id: 'm1', itemType: BomItemType.MATERIAL, itemId: 'material-A' }),
      ]);

      const [node] = await service.getBomTree('p1');

      expect(node.operations).toEqual([]);
      expect(mockDb.query.routingSteps.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getBomMaterials', () => {
    const materialRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
      materialId: 'material-1',
      code: 'VT-001',
      name: 'Vật tư 1',
      unit: unit('A'),
      image: null,
      totalQuantity: 5,
      ...overrides,
    });

    const buildReqDto = (overrides: Partial<GetBomMaterialsReqDto> = {}) =>
      Object.assign(new GetBomMaterialsReqDto(), {
        limit: 10,
        page: 1,
        ...overrides,
      });

    it('throws E007 when the product does not exist', async () => {
      mockDb.query.products.findFirst.mockResolvedValue(undefined);

      await expect(
        service.getBomMaterials('missing', buildReqDto()),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E007 },
      });
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('returns an empty page without querying rows when the product has no BOM configured yet', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue(undefined);

      const result = await service.getBomMaterials('p1', buildReqDto());

      expect(result.data).toEqual([]);
      expect(result.pagination.totalRecords).toBe(0);
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('aggregates one row per material with a numeric totalQuantity', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.select = jest
        .fn()
        .mockReturnValueOnce(chainable([materialRow({ totalQuantity: 7.5 })]))
        .mockReturnValueOnce(chainable([{ total: 1 }]));

      const result = await service.getBomMaterials('p1', buildReqDto());

      expect(result.data).toHaveLength(1);
      expect(result.data[0].totalQuantity).toBe(7.5);
      expect(result.data[0].image).toBeNull();
      expect(result.pagination.totalRecords).toBe(1);
    });

    it('maps a populated image', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.select = jest
        .fn()
        .mockReturnValueOnce(chainable([materialRow({ image: image('a') })]))
        .mockReturnValueOnce(chainable([{ total: 1 }]));

      const result = await service.getBomMaterials('p1', buildReqDto());

      expect(result.data[0].image?.id).toBe('file-a');
    });

    it('queries once for the page and once for the total count, including when filtered by q', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.select = jest
        .fn()
        .mockReturnValueOnce(chainable([]))
        .mockReturnValueOnce(chainable([{ total: 0 }]));

      await service.getBomMaterials('p1', buildReqDto({ q: 'thep' }));

      expect(mockDb.select).toHaveBeenCalledTimes(2);
    });
  });

  describe('addBomItem', () => {
    it('creates the boms header and inserts a top-level PRODUCT item when no header exists yet', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' }) // ensureProductExists (root)
        .mockResolvedValueOnce({
          id: 'wip-1',
          type: ProductType.WORK_IN_PROGRESS,
        }); // ensureProductIsWip
      mockDb.query.boms.findFirst.mockResolvedValueOnce(undefined); // no header yet
      insertReturningQueue = [[{ id: 'bom-1' }], [{ id: 'item-1' }]];
      mockDb.select = chainableMock([row({ id: 'item-1', itemId: 'wip-1' })]);

      const result = await service.addBomItem(
        'p1',
        buildCreateReqDto({ quantity: 2 }),
        'user-1',
      );

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
      const headerRow = insertedValues[0] as Record<string, unknown>;
      expect(headerRow).toMatchObject({
        productId: 'p1',
        createdBy: 'user-1',
      });
      const itemRow = insertedValues[1] as Record<string, unknown>;
      expect(itemRow).toMatchObject({
        bomId: 'bom-1',
        parentId: null,
        itemType: BomItemType.PRODUCT,
        productId: 'wip-1',
        materialId: null,
        quantity: 2,
        createdBy: 'user-1',
      });
      expect(result.id).toBe('item-1');
    });

    it('links and writes drawingFileId when provided', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce({
          id: 'wip-1',
          type: ProductType.WORK_IN_PROGRESS,
        });
      mockDb.query.boms.findFirst.mockResolvedValueOnce({ id: 'bom-1' });
      insertReturningQueue = [[{ id: 'item-1' }]];
      mockDb.select = chainableMock([row({ id: 'item-1' })]);

      await service.addBomItem(
        'p1',
        buildCreateReqDto({ drawingFileId: 'drawing-1' }),
        'user-1',
      );

      expect(mockFilesService.linkFiles).toHaveBeenCalledWith(['drawing-1']);
      const itemRow = insertedValues[0] as Record<string, unknown>;
      expect(itemRow).toMatchObject({ drawingFileId: 'drawing-1' });
    });

    it('does not link any file when drawingFileId is omitted', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce({
          id: 'wip-1',
          type: ProductType.WORK_IN_PROGRESS,
        });
      mockDb.query.boms.findFirst.mockResolvedValueOnce({ id: 'bom-1' });
      insertReturningQueue = [[{ id: 'item-1' }]];
      mockDb.select = chainableMock([row({ id: 'item-1' })]);

      await service.addBomItem('p1', buildCreateReqDto(), 'user-1');

      expect(mockFilesService.linkFiles).not.toHaveBeenCalled();
      const itemRow = insertedValues[0] as Record<string, unknown>;
      expect(itemRow).toMatchObject({ drawingFileId: null });
    });

    it('does not create a header when one already exists, and inserts under parentId', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce({
          id: 'wip-1',
          type: ProductType.WORK_IN_PROGRESS,
        });
      mockDb.query.boms.findFirst.mockResolvedValueOnce({ id: 'bom-1' }); // header exists
      mockDb.query.bomItems.findFirst
        .mockResolvedValueOnce({
          id: 'parent-1',
          itemType: BomItemType.PRODUCT,
        }) // ensureParentValid
        .mockResolvedValueOnce({ productId: 'unrelated', parentId: null }); // cycle walk, 1 ancestor
      insertReturningQueue = [[{ id: 'item-1' }]];
      mockDb.select = chainableMock([
        row({ id: 'item-1', parentId: 'parent-1' }),
      ]);

      await service.addBomItem(
        'p1',
        buildCreateReqDto({ parentId: 'parent-1' }),
        'user-1',
      );

      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      const itemRow = insertedValues[0] as Record<string, unknown>;
      expect(itemRow).toMatchObject({ bomId: 'bom-1', parentId: 'parent-1' });
    });

    it('inserts a MATERIAL item with materialId set and productId null', async () => {
      mockDb.query.products.findFirst.mockResolvedValueOnce({ id: 'p1' });
      mockDb.query.materials.findFirst.mockResolvedValueOnce({
        id: 'material-1',
      });
      mockDb.query.boms.findFirst.mockResolvedValueOnce({ id: 'bom-1' });
      insertReturningQueue = [[{ id: 'item-1' }]];
      mockDb.select = chainableMock([
        row({
          id: 'item-1',
          itemType: BomItemType.MATERIAL,
          itemId: 'material-1',
        }),
      ]);

      await service.addBomItem(
        'p1',
        buildCreateReqDto({
          itemType: BomItemType.MATERIAL,
          itemId: 'material-1',
          quantity: 0.5,
        }),
        'user-1',
      );

      const itemRow = insertedValues[0] as Record<string, unknown>;
      expect(itemRow).toMatchObject({
        itemType: BomItemType.MATERIAL,
        productId: null,
        materialId: 'material-1',
        quantity: 0.5,
      });
    });

    it('throws E007 when the root product does not exist', async () => {
      mockDb.query.products.findFirst.mockResolvedValueOnce(undefined);

      await expect(
        service.addBomItem('missing', buildCreateReqDto(), 'user-1'),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E007 } });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E007 when the child product does not exist', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce(undefined);

      await expect(
        service.addBomItem(
          'p1',
          buildCreateReqDto({ itemId: 'missing' }),
          'user-1',
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E007 } });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E053 when the child product is FINISHED_GOOD, not WORK_IN_PROGRESS', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce({ id: 'fg-1', type: ProductType.FINISHED_GOOD });

      await expect(
        service.addBomItem(
          'p1',
          buildCreateReqDto({ itemId: 'fg-1' }),
          'user-1',
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E053 } });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E035 when the material does not exist', async () => {
      mockDb.query.products.findFirst.mockResolvedValueOnce({ id: 'p1' });
      mockDb.query.materials.findFirst.mockResolvedValueOnce(undefined);

      await expect(
        service.addBomItem(
          'p1',
          buildCreateReqDto({
            itemType: BomItemType.MATERIAL,
            itemId: 'missing',
          }),
          'user-1',
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E035 } });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E051 when parentId is given but no BOM exists yet', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce({
          id: 'wip-1',
          type: ProductType.WORK_IN_PROGRESS,
        });
      mockDb.query.boms.findFirst.mockResolvedValueOnce(undefined);

      await expect(
        service.addBomItem(
          'p1',
          buildCreateReqDto({ parentId: 'ghost' }),
          'user-1',
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E051 } });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E051 when parentId does not belong to this bom', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce({
          id: 'wip-1',
          type: ProductType.WORK_IN_PROGRESS,
        });
      mockDb.query.boms.findFirst.mockResolvedValueOnce({ id: 'bom-1' });
      mockDb.query.bomItems.findFirst.mockResolvedValueOnce(undefined); // ensureParentValid

      await expect(
        service.addBomItem(
          'p1',
          buildCreateReqDto({ parentId: 'ghost' }),
          'user-1',
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E051 } });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E052 when the parent is a MATERIAL leaf', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce({
          id: 'wip-1',
          type: ProductType.WORK_IN_PROGRESS,
        });
      mockDb.query.boms.findFirst.mockResolvedValueOnce({ id: 'bom-1' });
      mockDb.query.bomItems.findFirst.mockResolvedValueOnce({
        id: 'material-item-1',
        itemType: BomItemType.MATERIAL,
      });

      await expect(
        service.addBomItem(
          'p1',
          buildCreateReqDto({ parentId: 'material-item-1' }),
          'user-1',
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E052 } });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E054 when nesting the root product into itself (top-level)', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' }) // ensureProductExists (root)
        .mockResolvedValueOnce({
          id: 'p1',
          type: ProductType.WORK_IN_PROGRESS,
        }); // ensureProductIsWip — root
      // happens to be WIP-typed here (viewing a WIP product's own BOM tree is valid)
      mockDb.query.boms.findFirst.mockResolvedValueOnce({ id: 'bom-1' });

      await expect(
        service.addBomItem('p1', buildCreateReqDto({ itemId: 'p1' }), 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E054 },
      });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E054 when the new item already appears as an ancestor of parentId', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce({
          id: 'wip-1',
          type: ProductType.WORK_IN_PROGRESS,
        });
      mockDb.query.boms.findFirst.mockResolvedValueOnce({ id: 'bom-1' });
      mockDb.query.bomItems.findFirst
        .mockResolvedValueOnce({
          id: 'parent-1',
          itemType: BomItemType.PRODUCT,
        }) // ensureParentValid
        .mockResolvedValueOnce({ productId: 'wip-1', parentId: null }); // ancestor IS the new item

      await expect(
        service.addBomItem(
          'p1',
          buildCreateReqDto({ itemId: 'wip-1', parentId: 'parent-1' }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E054 },
      });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E054 once the ancestor walk exceeds the max depth (corrupt-data guard)', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce({
          id: 'wip-1',
          type: ProductType.WORK_IN_PROGRESS,
        });
      mockDb.query.boms.findFirst.mockResolvedValueOnce({ id: 'bom-1' });
      mockDb.query.bomItems.findFirst
        .mockResolvedValueOnce({
          id: 'parent-1',
          itemType: BomItemType.PRODUCT,
        }) // ensureParentValid
        // Every subsequent call returns a node whose parentId keeps the walk going forever, never
        // matching the new item's productId — only the depth cap can end this.
        .mockResolvedValue({
          productId: 'never-matches',
          parentId: 'ancestor-loop',
        });

      await expect(
        service.addBomItem(
          'p1',
          buildCreateReqDto({ itemId: 'wip-1', parentId: 'parent-1' }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E054 },
      });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E055 when a WIP item quantity is not a whole number', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce({
          id: 'wip-1',
          type: ProductType.WORK_IN_PROGRESS,
        });

      await expect(
        service.addBomItem(
          'p1',
          buildCreateReqDto({ quantity: 1.5 }),
          'user-1',
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E055 } });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('accepts a decimal quantity for a MATERIAL item', async () => {
      mockDb.query.products.findFirst.mockResolvedValueOnce({ id: 'p1' });
      mockDb.query.materials.findFirst.mockResolvedValueOnce({
        id: 'material-1',
      });
      mockDb.query.boms.findFirst.mockResolvedValueOnce({ id: 'bom-1' });
      insertReturningQueue = [[{ id: 'item-1' }]];
      mockDb.select = chainableMock([
        row({ id: 'item-1', itemType: BomItemType.MATERIAL }),
      ]);

      await expect(
        service.addBomItem(
          'p1',
          buildCreateReqDto({
            itemType: BomItemType.MATERIAL,
            itemId: 'material-1',
            quantity: 0.25,
          }),
          'user-1',
        ),
      ).resolves.toBeDefined();
    });

    it('falls back to reading the header when onConflictDoNothing absorbs a concurrent first-add', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce({
          id: 'wip-1',
          type: ProductType.WORK_IN_PROGRESS,
        });
      mockDb.query.boms.findFirst
        .mockResolvedValueOnce(undefined) // existingBom check, before the tx
        .mockResolvedValueOnce({ id: 'bom-1' }); // fallback read inside the tx after the conflict
      insertReturningQueue = [[], [{ id: 'item-1' }]]; // header insert returns [] (conflict)
      mockDb.select = chainableMock([row({ id: 'item-1' })]);

      const result = await service.addBomItem(
        'p1',
        buildCreateReqDto(),
        'user-1',
      );

      const itemRow = insertedValues[1] as Record<string, unknown>;
      expect(itemRow).toMatchObject({ bomId: 'bom-1' });
      expect(result.id).toBe('item-1');
    });

    it('rolls back and never re-reads the detail when a write inside the transaction fails', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' })
        .mockResolvedValueOnce({
          id: 'wip-1',
          type: ProductType.WORK_IN_PROGRESS,
        });
      mockDb.query.boms.findFirst.mockResolvedValueOnce({ id: 'bom-1' });
      const failure = new Error('insert failed');
      mockDb.transaction.mockRejectedValue(failure);

      await expect(
        service.addBomItem('p1', buildCreateReqDto(), 'user-1'),
      ).rejects.toThrow(failure);
      expect(mockDb.select).not.toHaveBeenCalled();
    });
  });

  describe('updateBomItem', () => {
    it('writes only the sent fields', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.query.bomItems.findFirst.mockResolvedValue({
        id: 'item-1',
        itemType: BomItemType.MATERIAL,
      });
      mockDb.select = chainableMock([row({ id: 'item-1' })]);

      await service.updateBomItem(
        'p1',
        'item-1',
        buildUpdateReqDto({ quantity: 3.5 }),
      );

      expect(mockDb.update).toHaveBeenCalledTimes(1);
      const setValues = updateSetValues[0] as Record<string, unknown>;
      expect(setValues.quantity).toBe(3.5);
      // `updated_at` isn't in the payload at all — the column's own `$onUpdate` bumps it once the
      // real statement runs.
      expect(setValues.updatedAt).toBeUndefined();
      expect(setValues.sortOrder).toBeUndefined();
      expect(setValues.note).toBeUndefined();
    });

    it('still issues an UPDATE call for an effectively empty PATCH', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.query.bomItems.findFirst.mockResolvedValue({
        id: 'item-1',
        itemType: BomItemType.MATERIAL,
      });
      mockDb.select = chainableMock([row({ id: 'item-1' })]);

      await service.updateBomItem('p1', 'item-1', buildUpdateReqDto());

      // `chainableMock()` doesn't reproduce drizzle's real "No values to set" throw on an
      // all-`undefined` `.set()` payload (see `.claude/rules/testing.md`), so this only proves the
      // call shape, not that the real DB accepts it — an effectively empty PATCH now 500s in
      // production.
      expect(mockDb.update).toHaveBeenCalledTimes(1);
      const setValues = updateSetValues[0] as Record<string, unknown>;
      expect(setValues.updatedAt).toBeUndefined();
      expect(setValues.sortOrder).toBeUndefined();
      expect(setValues.note).toBeUndefined();
      expect(setValues.quantity).toBeUndefined();
    });

    it('clears note when explicitly sent as null, distinct from omitting it', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.query.bomItems.findFirst.mockResolvedValue({
        id: 'item-1',
        itemType: BomItemType.MATERIAL,
      });
      mockDb.select = chainableMock([row({ id: 'item-1' })]);

      await service.updateBomItem(
        'p1',
        'item-1',
        buildUpdateReqDto({ note: null }),
      );

      expect((updateSetValues[0] as Record<string, unknown>).note).toBeNull();
    });

    it('throws E050 when there is no BOM for this product', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue(undefined);

      await expect(
        service.updateBomItem(
          'p1',
          'item-1',
          buildUpdateReqDto({ quantity: 1 }),
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E050 } });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('throws E050 when the item does not belong to this bom', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.query.bomItems.findFirst.mockResolvedValue(undefined);

      await expect(
        service.updateBomItem(
          'p1',
          'missing',
          buildUpdateReqDto({ quantity: 1 }),
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E050 } });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('throws E055 when setting a non-integer quantity on a PRODUCT node', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.query.bomItems.findFirst.mockResolvedValue({
        id: 'item-1',
        itemType: BomItemType.PRODUCT,
      });

      await expect(
        service.updateBomItem(
          'p1',
          'item-1',
          buildUpdateReqDto({ quantity: 2.5 }),
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E055 } });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('accepts a decimal quantity on a MATERIAL node', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.query.bomItems.findFirst.mockResolvedValue({
        id: 'item-1',
        itemType: BomItemType.MATERIAL,
      });
      mockDb.select = chainableMock([row({ id: 'item-1' })]);

      await expect(
        service.updateBomItem(
          'p1',
          'item-1',
          buildUpdateReqDto({ quantity: 2.5 }),
        ),
      ).resolves.toBeDefined();
    });

    it('links the new drawing and deletes the old one when replaced', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.query.bomItems.findFirst.mockResolvedValue({
        id: 'item-1',
        itemType: BomItemType.MATERIAL,
        drawingFileId: 'old-drawing',
      });
      mockDb.select = chainableMock([row({ id: 'item-1' })]);

      await service.updateBomItem(
        'p1',
        'item-1',
        buildUpdateReqDto({ drawingFileId: 'new-drawing' }),
      );

      expect(mockFilesService.linkFiles).toHaveBeenCalledWith(['new-drawing']);
      expect(
        (updateSetValues[0] as Record<string, unknown>).drawingFileId,
      ).toBe('new-drawing');
      expect(mockFilesService.deleteFileById).toHaveBeenCalledWith(
        'old-drawing',
      );
    });

    it('links but does not delete when the same drawingFileId is resent', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.query.bomItems.findFirst.mockResolvedValue({
        id: 'item-1',
        itemType: BomItemType.MATERIAL,
        drawingFileId: 'same-drawing',
      });
      mockDb.select = chainableMock([row({ id: 'item-1' })]);

      await service.updateBomItem(
        'p1',
        'item-1',
        buildUpdateReqDto({ drawingFileId: 'same-drawing' }),
      );

      expect(mockFilesService.linkFiles).toHaveBeenCalledWith(['same-drawing']);
      expect(mockFilesService.deleteFileById).not.toHaveBeenCalled();
    });

    it('clears drawingFileId and deletes the old file when sent as null', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.query.bomItems.findFirst.mockResolvedValue({
        id: 'item-1',
        itemType: BomItemType.MATERIAL,
        drawingFileId: 'old-drawing',
      });
      mockDb.select = chainableMock([row({ id: 'item-1' })]);

      await service.updateBomItem(
        'p1',
        'item-1',
        buildUpdateReqDto({ drawingFileId: null }),
      );

      expect(mockFilesService.linkFiles).not.toHaveBeenCalled();
      expect(
        (updateSetValues[0] as Record<string, unknown>).drawingFileId,
      ).toBeNull();
      expect(mockFilesService.deleteFileById).toHaveBeenCalledWith(
        'old-drawing',
      );
    });

    it('leaves the drawing untouched when drawingFileId is omitted', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.query.bomItems.findFirst.mockResolvedValue({
        id: 'item-1',
        itemType: BomItemType.MATERIAL,
        drawingFileId: 'old-drawing',
      });
      mockDb.select = chainableMock([row({ id: 'item-1' })]);

      await service.updateBomItem(
        'p1',
        'item-1',
        buildUpdateReqDto({ note: 'unrelated change' }),
      );

      expect(mockFilesService.linkFiles).not.toHaveBeenCalled();
      expect(mockFilesService.deleteFileById).not.toHaveBeenCalled();
      expect(
        (updateSetValues[0] as Record<string, unknown>).drawingFileId,
      ).toBeUndefined();
    });
  });

  describe('deleteBomItem', () => {
    it('deletes the item scoped to this bom', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.query.bomItems.findFirst.mockResolvedValue({
        id: 'item-1',
        itemType: BomItemType.MATERIAL,
      });

      await service.deleteBomItem('p1', 'item-1');

      expect(mockDb.delete).toHaveBeenCalledTimes(1);
    });

    it('throws E050 when there is no BOM for this product', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue(undefined);

      await expect(service.deleteBomItem('p1', 'item-1')).rejects.toMatchObject(
        {
          response: { errorCode: ErrorCode.E050 },
        },
      );
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('throws E050 when the item does not belong to this bom', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.query.bomItems.findFirst.mockResolvedValue(undefined);

      await expect(
        service.deleteBomItem('p1', 'missing'),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.E050 },
      });
      expect(mockDb.delete).not.toHaveBeenCalled();
    });
  });
});
