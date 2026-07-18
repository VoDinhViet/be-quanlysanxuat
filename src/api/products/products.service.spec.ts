import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import { ProductStatus } from '../../database/schemas';
import { chainableMock, QueryMockArgs } from '../../test-utils/chainable-mock.util';
import { CreateProductReqDto } from './dto/create-product.req.dto';
import { GetProductsReqDto } from './dto/get-products.req.dto';
import { UpdateProductReqDto } from './dto/update-product.req.dto';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let mockDb: {
    query: {
      products: { findMany: jest.Mock<any, [QueryMockArgs]>; findFirst: jest.Mock };
      units: { findFirst: jest.Mock };
      clients: { findFirst: jest.Mock };
      productGroups: { findFirst: jest.Mock };
    };
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
  };

  const buildReqDto = (overrides: Partial<GetProductsReqDto> = {}): GetProductsReqDto =>
    Object.assign(new GetProductsReqDto(), overrides);

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
      },
      select: chainableMock([{ total: 0 }]),
      insert: chainableMock([{ id: 'new-product-id' }]),
      update: chainableMock([{ id: 'product-1' }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductsService, { provide: DRIZZLE, useValue: mockDb }],
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
      expect(callArgs.with).toEqual({ client: true, group: true, unit: true, creator: true });
    });

    it('applies clientId/productGroupId/status filters when provided', async () => {
      await service.getProducts(
        buildReqDto({
          clientId: 'client-1',
          productGroupId: 'group-1',
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
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1', code: 'SP0001' });

      const result = await service.getProductDetail('p1');

      expect(result).toBeDefined();
      expect(mockDb.query.products.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          with: { client: true, group: true, unit: true, creator: true },
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
    const reqDto: CreateProductReqDto = Object.assign(new CreateProductReqDto(), {
      name: 'Sản phẩm A',
      unitId: 'unit-1',
    });

    it('auto-generates a code, validates FKs, and inserts', async () => {
      mockDb.select = chainableMock([{ total: 3 }]);
      mockDb.query.units.findFirst.mockResolvedValue({ id: 'unit-1' });
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'new-product-id' });

      const result = await service.createProduct(reqDto, 'user-1');

      expect(mockDb.query.units.findFirst).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('throws E008 when the explicit code is already taken', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'other-product' });

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

      await expect(service.createProduct(reqDto, 'user-1')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E011 },
      });
    });

    it('throws E009 when clientId does not reference an existing client', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({ id: 'unit-1' });
      mockDb.query.clients.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createProduct(
          Object.assign(new CreateProductReqDto(), reqDto, { clientId: 'client-1' }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E009 },
      });
    });

    it('throws E010 when productGroupId does not reference an existing group', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({ id: 'unit-1' });
      mockDb.query.productGroups.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createProduct(
          Object.assign(new CreateProductReqDto(), reqDto, { productGroupId: 'group-1' }),
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

    it('throws E008 when the new code is already taken by another product', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' }) // ensureProductExists
        .mockResolvedValueOnce({ id: 'other' }); // validateCodeUniqueness conflict

      await expect(
        service.updateProduct('p1', Object.assign(new UpdateProductReqDto(), { code: 'SP0003' })),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E008 },
      });
    });
  });

  describe('deleteProduct', () => {
    it('soft-deletes the product', async () => {
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'p1' });

      await service.deleteProduct('p1');

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws E007 when the product does not exist', async () => {
      mockDb.query.products.findFirst.mockResolvedValue(undefined);

      await expect(service.deleteProduct('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E007 },
      });
    });
  });

  describe('copyProduct', () => {
    it('inserts a new product copied from the original with a fresh code', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1', name: 'Sản phẩm A', revision: 'R01' }) // ensureProductExists
        .mockResolvedValueOnce({ id: 'new-product-id' }); // getProductDetail
      mockDb.select = chainableMock([{ total: 5 }]);

      const result = await service.copyProduct('p1', 'user-1');

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('throws E007 when the source product does not exist', async () => {
      mockDb.query.products.findFirst.mockResolvedValue(undefined);

      await expect(service.copyProduct('missing', 'user-1')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E007 },
      });
    });
  });
});
