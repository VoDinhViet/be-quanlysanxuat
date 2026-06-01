import { Test, TestingModule } from '@nestjs/testing';
import { DRIZZLE } from '../../database/database.module';
import { ProductStatus } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
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
    operations: { findMany: jest.Mock };
    productTypes: { findMany: jest.Mock };
    products: { findFirst: jest.Mock; findMany: jest.Mock };
    units: { findMany: jest.Mock };
  };
};

describe('ProductsService', () => {
  let service: ProductsService;
  let db: ProductsServiceDbMock;

  beforeEach(async () => {
    db = {
      query: {
        operations: {
          findMany: jest.fn(),
        },
        productTypes: {
          findMany: jest.fn(),
        },
        products: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
        units: {
          findMany: jest.fn(),
        },
      },
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
});
