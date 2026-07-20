import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import { ProductStatus, UnitScope } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { chainableMock, QueryMockArgs } from '../../test-utils/chainable-mock.util';
import { FilesService } from '../files/files.service';
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
      productAttachments: { findMany: jest.Mock };
    };
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    transaction: jest.Mock;
  };
  let mockFilesService: { linkFiles: jest.Mock };

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
        productAttachments: { findMany: jest.fn().mockResolvedValue([]) },
      },
      select: chainableMock([{ total: 0 }]),
      insert: chainableMock([{ id: 'new-product-id' }]),
      update: chainableMock([{ id: 'product-1' }]),
      delete: chainableMock(undefined),
      // The callback receives `mockDb` itself, so call-count assertions work whether a write
      // sits inside the transaction or not.
      transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockDb)),
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
      });
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
          with: {
            client: true,
            group: true,
            unit: true,
            creator: true,
            imageFile: true,
            attachments: { with: { file: true } },
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
    const reqDto: CreateProductReqDto = Object.assign(new CreateProductReqDto(), {
      name: 'Sản phẩm A',
      unitId: 'unit-1',
    });

    it('auto-generates a code, validates FKs, and inserts', async () => {
      mockDb.select = chainableMock([{ total: 3 }]);
      mockDb.query.units.findFirst.mockResolvedValue({
        id: 'unit-1',
        scopes: [{ scope: UnitScope.PRODUCT }],
      });
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

    it('throws E043 when the unit exists but is not usable on products', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({
        id: 'unit-1',
        scopes: [{ scope: UnitScope.MATERIAL }],
      });

      await expect(service.createProduct(reqDto, 'user-1')).rejects.toMatchObject({
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
          Object.assign(new CreateProductReqDto(), reqDto, { clientId: 'client-1' }),
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
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'new-product-id' });

      await service.createProduct(
        Object.assign(new CreateProductReqDto(), reqDto, { imageFileId: 'file-1' }),
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
          Object.assign(new CreateProductReqDto(), reqDto, { imageFileId: 'ghost' }),
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
          Object.assign(new CreateProductReqDto(), reqDto, { productGroupId: 'group-1' }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E010 },
      });
    });
    it('links image and attachment files together before opening the transaction', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({
        id: 'unit-1',
        scopes: [{ scope: UnitScope.PRODUCT }],
      });
      mockDb.query.products.findFirst.mockResolvedValue({ id: 'new-product-id' });

      await service.createProduct(
        Object.assign(new CreateProductReqDto(), {
          name: 'Sản phẩm A',
          unitId: 'unit-1',
          imageFileId: 'img-1',
          attachmentFileIds: ['doc-a', 'doc-b'],
        }),
        'user-1',
      );

      expect(mockFilesService.linkFiles).toHaveBeenCalledWith(['img-1', 'doc-a', 'doc-b']);
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    });

    it('propagates E042 and never opens a transaction when a file id is unknown', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({
        id: 'unit-1',
        scopes: [{ scope: UnitScope.PRODUCT }],
      });
      mockDb.query.products.findFirst.mockResolvedValue(undefined);
      mockFilesService.linkFiles.mockRejectedValue(
        new AppException(ErrorCode.E042, HttpStatus.NOT_FOUND),
      );

      await expect(
        service.createProduct(
          Object.assign(new CreateProductReqDto(), {
            name: 'Sản phẩm A',
            unitId: 'unit-1',
            attachmentFileIds: ['ghost'],
          }),
          'user-1',
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E042 } });

      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    // Required by .claude/rules/testing.md for any service that opens a transaction: the error
    // must propagate AND the post-commit re-fetch must not run.
    it('rolls back and never re-reads the detail when a write inside the transaction fails', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({
        id: 'unit-1',
        scopes: [{ scope: UnitScope.PRODUCT }],
      });
      const failure = new Error('attachment insert failed');
      mockDb.transaction.mockRejectedValue(failure);

      await expect(
        service.createProduct(
          Object.assign(new CreateProductReqDto(), {
            name: 'Sản phẩm A',
            unitId: 'unit-1',
            attachmentFileIds: ['doc-a'],
          }),
          'user-1',
        ),
      ).rejects.toThrow(failure);

      // The code is auto-generated here, so no uniqueness probe runs — every products.findFirst
      // would be the post-commit detail re-fetch, which must not have happened.
      expect(mockDb.query.products.findFirst).not.toHaveBeenCalled();
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

    // Was a 500: `.set()` with every value `undefined` throws a bare "No values to set". The
    // always-written `updated_at` is what makes an empty PATCH a harmless no-op instead.
    it('handles an empty PATCH body without throwing', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1' }) // ensureProductExists
        .mockResolvedValueOnce({ id: 'p1' }); // getProductDetail

      await expect(service.updateProduct('p1', new UpdateProductReqDto())).resolves.toBeDefined();
      expect(mockDb.update).toHaveBeenCalled();
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
    it('replaces attachments when the PATCH carries attachmentFileIds', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'product-1' })
        .mockResolvedValueOnce({ id: 'product-1' });

      await service.updateProduct(
        'product-1',
        Object.assign(new UpdateProductReqDto(), { attachmentFileIds: [] }),
      );

      // `[]` means "remove every document", so the delete must still run.
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('leaves attachments untouched when the PATCH omits attachmentFileIds', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'product-1' })
        .mockResolvedValueOnce({ id: 'product-1' });

      await service.updateProduct(
        'product-1',
        Object.assign(new UpdateProductReqDto(), { name: 'Tên mới' }),
      );

      expect(mockDb.delete).not.toHaveBeenCalled();
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

    it('clones the original attachments onto the copy', async () => {
      mockDb.query.products.findFirst
        .mockResolvedValueOnce({ id: 'p1', name: 'Sản phẩm A', revision: 'R01' })
        .mockResolvedValueOnce({ id: 'new-product-id' });
      mockDb.query.productAttachments.findMany.mockResolvedValue([
        { fileId: 'doc-a' },
        { fileId: 'doc-b' },
      ]);

      await service.copyProduct('p1', 'user-1');

      // Two inserts: the product row, then its attachment rows.
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
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
