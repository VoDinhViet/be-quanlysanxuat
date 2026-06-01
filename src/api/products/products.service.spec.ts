import { Test, TestingModule } from '@nestjs/testing';
import { OrderBy } from '../../constants/app.constant';
import { DRIZZLE } from '../../database/database.module';
import {
  bomLines,
  ProductFileType,
  productRevisions,
  products,
  ProductStatus,
  routingSteps,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import type { GetProductsReqDto } from './dto/get-products.req.dto';
import { ProductsService } from './products.service';

type RoutingStepValidationReq = {
  steps: Array<{
    stepNo: number;
    isOutsideProcess?: boolean;
    defaultSupplierId?: string | null;
  }>;
};

type ProductsServiceDbMock = {
  query: {
    bomLines: { findMany: jest.Mock };
    operations: { findMany: jest.Mock };
    productFiles: { findFirst: jest.Mock; findMany: jest.Mock };
    productRevisions: { findFirst: jest.Mock };
    productTypes: { findMany: jest.Mock };
    products: { findFirst: jest.Mock; findMany: jest.Mock };
    routingSteps: { findMany: jest.Mock };
    units: { findMany: jest.Mock };
  };
  select: jest.Mock;
  transaction: jest.Mock;
  update: jest.Mock;
};

type DrizzleOrderSql = {
  queryChunks: Array<unknown>;
};

describe('ProductsService', () => {
  let service: ProductsService;
  let db: ProductsServiceDbMock;

  beforeEach(async () => {
    db = {
      query: {
        bomLines: {
          findMany: jest.fn(),
        },
        operations: {
          findMany: jest.fn(),
        },
        productFiles: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
        productRevisions: {
          findFirst: jest.fn(),
        },
        productTypes: {
          findMany: jest.fn(),
        },
        products: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
        routingSteps: {
          findMany: jest.fn(),
        },
        units: {
          findMany: jest.fn(),
        },
      },
      select: jest.fn(),
      transaction: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: DRIZZLE,
          useValue: db,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should map product options', async () => {
    db.query.products.findMany.mockResolvedValue([
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        code: 'XYZ',
        name: 'Product XYZ',
      },
    ]);

    await expect(service.getProductOptions()).resolves.toEqual([
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        code: 'XYZ',
        name: 'Product XYZ',
      },
    ]);

    expect(db.query.products.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: {
          id: true,
          code: true,
          name: true,
        },
      }),
    );
  });

  it('should list technical files without using thumbnail records', async () => {
    const productId = '550e8400-e29b-41d4-a716-446655440001';
    const createdAt = new Date('2024-05-01T00:00:00.000Z');
    db.query.products.findFirst.mockResolvedValue({ id: productId });
    db.query.productFiles.findMany.mockResolvedValue([
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        productId,
        fileType: ProductFileType.TechnicalAttachment,
        originalName: 'drawing.pdf',
        fileName: 'drawing.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        filePath: 'uploads/products/files/drawing.pdf',
        uploadedBy: null,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
      },
    ]);

    await expect(service.getProductTechnicalFiles(productId)).resolves.toEqual([
      expect.objectContaining({
        id: '550e8400-e29b-41d4-a716-446655440002',
        fileType: ProductFileType.TechnicalAttachment,
        url: '/uploads/products/files/drawing.pdf',
      }),
    ]);

    expect(db.query.productFiles.findMany).toHaveBeenCalledTimes(1);
  });

  it('should list products ordered by createdAt desc only', async () => {
    const totalWhere = jest.fn().mockResolvedValue([{ total: 0 }]);
    const totalFrom = jest.fn().mockReturnValue({ where: totalWhere });
    const reqDto = {
      limit: 10,
      page: 1,
      offset: 0,
      order: OrderBy.ASC,
    } as GetProductsReqDto;

    db.query.products.findMany.mockResolvedValue([]);
    db.select.mockReturnValue({ from: totalFrom });

    await service.getProducts(reqDto);

    const [findManyArgs] = db.query.products.findMany.mock.calls[0] as [
      {
        orderBy: DrizzleOrderSql;
      },
    ];
    const lastOrderChunk = findManyArgs.orderBy.queryChunks[
      findManyArgs.orderBy.queryChunks.length - 1
    ] as { value?: string[] };

    expect(findManyArgs.orderBy.queryChunks).toContain(products.createdAt);
    expect(lastOrderChunk.value).toEqual([' desc']);
  });

  it('should reject BOM cycles', () => {
    const serviceUnderTest = service as unknown as {
      ensureBomCycleAllowed: (
        parentItemId: string,
        childItemId: string,
        lines: Array<{ parentItemId: string; childItemId: string }>,
      ) => void;
    };

    expect(() =>
      serviceUnderTest.ensureBomCycleAllowed('item-a', 'item-c', [
        { parentItemId: 'item-c', childItemId: 'item-b' },
        { parentItemId: 'item-b', childItemId: 'item-a' },
      ]),
    ).toThrow(AppException);
  });

  it('should compute BOM child level from parent line', () => {
    const serviceUnderTest = service as unknown as {
      getBomChildLevel: (
        rootProductId: string,
        parentItemId: string,
        lines: Array<{ childItemId: string; level: number }>,
      ) => number;
    };

    expect(serviceUnderTest.getBomChildLevel('root', 'root', [])).toBe(1);
    expect(
      serviceUnderTest.getBomChildLevel('root', 'item-a', [{ childItemId: 'item-a', level: 1 }]),
    ).toBe(2);
  });

  it('should compute next BOM sort order by sibling parent', () => {
    const serviceUnderTest = service as unknown as {
      getNextBomSortOrder: (
        parentItemId: string,
        lines: Array<{ parentItemId: string; sortOrder: number }>,
      ) => number;
    };

    expect(serviceUnderTest.getNextBomSortOrder('root', [])).toBe(1);
    expect(
      serviceUnderTest.getNextBomSortOrder('root', [
        { parentItemId: 'root', sortOrder: 1 },
        { parentItemId: 'root', sortOrder: 3 },
        { parentItemId: 'item-a', sortOrder: 10 },
      ]),
    ).toBe(4);
  });

  it('should generate unique copy product code', async () => {
    db.query.products.findFirst.mockResolvedValueOnce({ id: 'existing-product-id' });
    db.query.products.findFirst.mockResolvedValueOnce(undefined);
    const serviceUnderTest = service as unknown as {
      generateProductCopyCode: (sourceCode: string) => Promise<string>;
    };

    await expect(serviceUnderTest.generateProductCopyCode('PRD001')).resolves.toBe('PRD001-COPY-2');
  });

  it('should copy BOM and routing when creating a revision from source', async () => {
    const productId = '550e8400-e29b-41d4-a716-446655440001';
    const sourceRevisionId = '550e8400-e29b-41d4-a716-446655440002';
    const createdRevisionId = '550e8400-e29b-41d4-a716-446655440003';
    const createdAt = new Date('2024-05-01T00:00:00.000Z');
    const createdRevision = {
      id: createdRevisionId,
      productId,
      revisionNo: 'R2',
      note: 'Copied revision',
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    };
    const revisionValues = jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([createdRevision]),
    });
    const bomValues = jest.fn().mockResolvedValue(undefined);
    const routingValues = jest.fn().mockResolvedValue(undefined);
    const tx = {
      insert: jest.fn((table: unknown) => {
        if (table === productRevisions) {
          return { values: revisionValues };
        }

        if (table === bomLines) {
          return { values: bomValues };
        }

        if (table === routingSteps) {
          return { values: routingValues };
        }

        throw new Error('Unexpected insert table');
      }),
    };

    db.query.products.findFirst.mockResolvedValue({
      id: productId,
      status: ProductStatus.Active,
    });
    db.query.productRevisions.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: sourceRevisionId });
    db.query.bomLines.findMany.mockResolvedValue([
      {
        id: '550e8400-e29b-41d4-a716-446655440010',
        productRevisionId: sourceRevisionId,
        parentItemId: productId,
        childItemId: '550e8400-e29b-41d4-a716-446655440011',
        qty: '1',
        unitId: '550e8400-e29b-41d4-a716-446655440012',
        scrapRate: '0',
        level: 1,
        sortOrder: 1,
        note: null,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
      },
    ]);
    db.query.routingSteps.findMany.mockResolvedValue([
      {
        id: '550e8400-e29b-41d4-a716-446655440020',
        productRevisionId: sourceRevisionId,
        itemId: productId,
        operationId: '550e8400-e29b-41d4-a716-446655440021',
        stepNo: 1,
        isOutsideProcess: false,
        defaultSupplierId: null,
        note: null,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
      },
    ]);
    db.transaction.mockImplementation((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    );

    await expect(
      service.createProductRevision(productId, {
        revisionNo: 'R2',
        copyFromRevisionId: sourceRevisionId,
        note: 'Copied revision',
      }),
    ).resolves.toMatchObject({
      id: createdRevisionId,
      revisionNo: 'R2',
      note: 'Copied revision',
    });

    expect(bomValues).toHaveBeenCalledWith([
      expect.objectContaining({
        productRevisionId: createdRevisionId,
        parentItemId: productId,
        sortOrder: 1,
      }),
    ]);
    expect(routingValues).toHaveBeenCalledWith([
      expect.objectContaining({
        productRevisionId: createdRevisionId,
        itemId: productId,
        stepNo: 1,
      }),
    ]);
  });

  it('should collect descendant BOM line ids for subtree deletion', () => {
    const serviceUnderTest = service as unknown as {
      getBomSubtreeLineIds: (
        rootBomLineId: string,
        rootChildItemId: string,
        lines: Array<{ id: string; parentItemId: string; childItemId: string }>,
      ) => string[];
    };

    expect(
      serviceUnderTest
        .getBomSubtreeLineIds('line-a', 'item-a', [
          { id: 'line-a', parentItemId: 'root', childItemId: 'item-a' },
          { id: 'line-a1', parentItemId: 'item-a', childItemId: 'item-a1' },
          { id: 'line-a11', parentItemId: 'item-a1', childItemId: 'item-a11' },
          { id: 'line-b', parentItemId: 'root', childItemId: 'item-b' },
        ])
        .sort(),
    ).toEqual(['line-a', 'line-a1', 'line-a11']);
  });

  it('should reject supplier on inhouse routing step', () => {
    const serviceUnderTest = service as unknown as {
      ensureRoutingStepsAllowed: (reqDto: RoutingStepValidationReq) => void;
    };

    expect(() =>
      serviceUnderTest.ensureRoutingStepsAllowed({
        steps: [{ stepNo: 1, isOutsideProcess: false, defaultSupplierId: 'supplier-id' }],
      }),
    ).toThrow(AppException);
  });

  it('should normalize uploaded product image extension from MIME type', () => {
    const serviceUnderTest = service as unknown as {
      getProductImageExtension: (mimeType: string) => string;
    };

    expect(serviceUnderTest.getProductImageExtension('image/jpeg')).toBe('.jpg');
    expect(serviceUnderTest.getProductImageExtension('image/png')).toBe('.png');
    expect(serviceUnderTest.getProductImageExtension('image/webp')).toBe('.webp');
  });

  it('should reject missing uploaded product image file', async () => {
    const serviceUnderTest = service as unknown as {
      ensureUploadedProductImageAllowed: (file: undefined) => Promise<never>;
    };

    await expect(serviceUnderTest.ensureUploadedProductImageAllowed(undefined)).rejects.toThrow(
      AppException,
    );
  });

  it('should allow supplier on outside routing step', () => {
    const serviceUnderTest = service as unknown as {
      ensureRoutingStepsAllowed: (reqDto: RoutingStepValidationReq) => void;
    };

    expect(() =>
      serviceUnderTest.ensureRoutingStepsAllowed({
        steps: [{ stepNo: 1, isOutsideProcess: true, defaultSupplierId: 'supplier-id' }],
      }),
    ).not.toThrow();
  });

  it('should reject duplicate routing step numbers', () => {
    const serviceUnderTest = service as unknown as {
      ensureRoutingStepsAllowed: (reqDto: RoutingStepValidationReq) => void;
    };

    expect(() =>
      serviceUnderTest.ensureRoutingStepsAllowed({
        steps: [
          { stepNo: 1, isOutsideProcess: false },
          { stepNo: 1, isOutsideProcess: false },
        ],
      }),
    ).toThrow(AppException);
  });

  it('should reject product mutations when product is locked', async () => {
    db.query.products.findFirst.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440001',
      status: ProductStatus.Locked,
    });
    const serviceUnderTest = service as unknown as {
      ensureProductUnlocked: (productId: string) => Promise<void>;
    };

    await expect(
      serviceUnderTest.ensureProductUnlocked('550e8400-e29b-41d4-a716-446655440001'),
    ).rejects.toThrow(AppException);
  });

  it('should reject locked status through generic product update', () => {
    const serviceUnderTest = service as unknown as {
      ensureProductStatusUpdateAllowed: (status?: ProductStatus) => void;
    };

    expect(() => serviceUnderTest.ensureProductStatusUpdateAllowed(ProductStatus.Locked)).toThrow(
      AppException,
    );
  });

  it('should unlock product by restoring active status', async () => {
    const productId = '550e8400-e29b-41d4-a716-446655440001';
    const response = { id: productId, status: ProductStatus.Active } as never;
    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn().mockReturnValue({ where: updateWhere });

    db.query.products.findFirst.mockResolvedValue({ id: productId });
    db.update.mockReturnValue({ set: updateSet });
    const getProductDetailSpy = jest.spyOn(service, 'getProductDetail').mockResolvedValue(response);

    await expect(service.unlockProduct(productId)).resolves.toBe(response);

    expect(db.update).toHaveBeenCalledWith(products);
    const [updateSetArg] = updateSet.mock.calls[0] as [
      {
        status: ProductStatus;
        updatedAt: Date;
      },
    ];

    expect(updateSetArg).toEqual({
      status: ProductStatus.Active,
      updatedAt: updateSetArg.updatedAt,
    });
    expect(updateSetArg.updatedAt).toBeInstanceOf(Date);
    expect(updateWhere).toHaveBeenCalled();
    expect(getProductDetailSpy).toHaveBeenCalledWith(productId);
  });
});
