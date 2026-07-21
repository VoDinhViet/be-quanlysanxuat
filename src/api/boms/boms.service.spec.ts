import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import { BomItemType } from '../../database/schemas';
import { chainableMock } from '../../test-utils/chainable-mock.util';
import { BomsService } from './boms.service';

describe('BomsService', () => {
  let service: BomsService;
  let mockDb: {
    query: {
      products: { findFirst: jest.Mock };
      productRevisions: { findFirst: jest.Mock };
      boms: { findFirst: jest.Mock };
    };
    select: jest.Mock;
  };

  const unit = (suffix: string) => ({
    id: `unit-${suffix}`,
    code: `U${suffix}`,
    name: `Unit ${suffix}`,
  });

  // Shape of a row as the SQL query (select + joins + coalesce) already returns it — item
  // normalization (product vs. material) happens in SQL, so fixtures represent that post-join shape
  // directly rather than raw bom_items + relations.
  const row = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'a',
    parentId: null,
    itemType: BomItemType.PRODUCT,
    itemId: 'product-A',
    code: 'CUM-A',
    name: 'Cụm A',
    unit: unit('A'),
    quantity: '1.000',
    sortOrder: 0,
    note: null,
    ...overrides,
  });

  beforeEach(async () => {
    mockDb = {
      query: {
        products: { findFirst: jest.fn() },
        productRevisions: { findFirst: jest.fn() },
        boms: { findFirst: jest.fn() },
      },
      select: chainableMock([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [BomsService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<BomsService>(BomsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws E007 when the product does not exist', async () => {
    mockDb.query.products.findFirst.mockResolvedValue(undefined);

    await expect(service.getBomTree('missing', 'rev-1')).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: { errorCode: ErrorCode.E007 },
    });
  });

  it('throws E048 when the revision does not exist under this product', async () => {
    mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
    mockDb.query.productRevisions.findFirst.mockResolvedValue(undefined);

    await expect(service.getBomTree('p1', 'missing')).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: { errorCode: ErrorCode.E048 },
    });
  });

  it('returns an empty array without querying items when the revision has no BOM configured yet', async () => {
    mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
    mockDb.query.productRevisions.findFirst.mockResolvedValue({ id: 'rev-1' });
    mockDb.query.boms.findFirst.mockResolvedValue(undefined);

    const result = await service.getBomTree('p1', 'rev-1');

    expect(result).toEqual([]);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns an empty array when the BOM has no items yet', async () => {
    mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
    mockDb.query.productRevisions.findFirst.mockResolvedValue({ id: 'rev-1' });
    mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
    mockDb.select = chainableMock([]);

    const result = await service.getBomTree('p1', 'rev-1');

    expect(result).toEqual([]);
  });

  it('queries bom_items once the BOM is found', async () => {
    mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
    mockDb.query.productRevisions.findFirst.mockResolvedValue({ id: 'rev-1' });
    mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
    mockDb.select = chainableMock([row()]);

    await service.getBomTree('p1', 'rev-1');

    expect(mockDb.select).toHaveBeenCalled();
  });

  describe('tree assembly', () => {
    it('nests items by parentId and computes level by depth', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.productRevisions.findFirst.mockResolvedValue({ id: 'rev-1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      // Fixture is already in the order the SQL `ORDER BY sort_order, created_at` would return —
      // buildTree only groups, it never re-sorts, so "a" must come before "b" here already.
      mockDb.select = chainableMock([
        row({ id: 'a', parentId: null }),
        row({ id: 'b', parentId: null, itemId: 'product-B', code: 'CUM-B' }),
        row({ id: 'a1', parentId: 'a', itemId: 'product-A1', code: 'CT-A1' }),
        row({
          id: 'a1x',
          parentId: 'a1',
          itemType: BomItemType.MATERIAL,
          itemId: 'material-A1X',
          code: 'VT-A1X',
        }),
        row({ id: 'b1', parentId: 'b', itemId: 'product-B1', code: 'CT-B1' }),
      ]);

      const result = await service.getBomTree('p1', 'rev-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('a');
      expect(result[0].level).toBe(1);
      expect(result[1].id).toBe('b');
      expect(result[1].level).toBe(1);

      const branchA = result[0];
      expect(branchA.children).toHaveLength(1);
      expect(branchA.children[0].id).toBe('a1');
      expect(branchA.children[0].level).toBe(2);
      expect(branchA.children[0].children[0].id).toBe('a1x');
      expect(branchA.children[0].children[0].level).toBe(3);
      expect(branchA.children[0].children[0].itemType).toBe(BomItemType.MATERIAL);

      const branchB = result[1];
      expect(branchB.children).toHaveLength(1);
      expect(branchB.children[0].id).toBe('b1');
      expect(branchB.children[0].level).toBe(2);
    });

    it('passes each row’s already-normalized fields straight through to the response', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });
      mockDb.query.productRevisions.findFirst.mockResolvedValue({ id: 'rev-1' });
      mockDb.query.boms.findFirst.mockResolvedValue({ id: 'bom-1' });
      mockDb.select = chainableMock([row({ quantity: '4.500', note: 'ghi chú', unit: unit('X') })]);

      const [node] = await service.getBomTree('p1', 'rev-1');

      expect(node.itemId).toBe('product-A');
      expect(node.code).toBe('CUM-A');
      expect(node.name).toBe('Cụm A');
      expect(node.unit).toEqual(unit('X'));
      expect(node.quantity).toBe('4.500');
      expect(node.note).toBe('ghi chú');
    });
  });
});
