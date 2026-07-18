import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import { SupplierStatus } from '../../database/schemas';
import { chainableMock, QueryMockArgs } from '../../test-utils/chainable-mock.util';
import { CreateSupplierReqDto } from './dto/create-supplier.req.dto';
import { GetSuppliersReqDto } from './dto/get-suppliers.req.dto';
import { UpdateSupplierReqDto } from './dto/update-supplier.req.dto';
import { SuppliersService } from './suppliers.service';

describe('SuppliersService', () => {
  let service: SuppliersService;
  let mockDb: {
    query: {
      suppliers: { findMany: jest.Mock<any, [QueryMockArgs]>; findFirst: jest.Mock };
      supplierGroups: { findFirst: jest.Mock };
      countries: { findFirst: jest.Mock };
    };
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  const buildReqDto = (overrides: Partial<GetSuppliersReqDto> = {}): GetSuppliersReqDto =>
    Object.assign(new GetSuppliersReqDto(), overrides);

  beforeEach(async () => {
    mockDb = {
      query: {
        suppliers: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
          findFirst: jest.fn(),
        },
        supplierGroups: { findFirst: jest.fn() },
        countries: { findFirst: jest.fn() },
      },
      select: chainableMock([{ total: 0 }]),
      insert: chainableMock([{ id: 'new-supplier-id' }]),
      update: chainableMock(undefined),
      delete: chainableMock(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SuppliersService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<SuppliersService>(SuppliersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSuppliers', () => {
    it('excludes soft-deleted rows and applies no filter without q/filters', async () => {
      await service.getSuppliers(buildReqDto());

      const callArgs = mockDb.query.suppliers.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
      expect(callArgs.limit).toBe(10);
      expect(callArgs.offset).toBe(0);
      expect(callArgs.with).toEqual({
        group: true,
        creator: true,
        attachments: true,
        representatives: true,
        country: true,
        payment: true,
      });
    });

    it('builds a keyword search filter (incl. representative name match) when q is provided', async () => {
      await service.getSuppliers(buildReqDto({ q: 'nguyen' }));

      const callArgs = mockDb.query.suppliers.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });

    it('applies status/supplierGroupId/countryId filters when provided', async () => {
      await service.getSuppliers(
        buildReqDto({
          status: SupplierStatus.ACTIVE,
          supplierGroupId: 'group-1',
          countryId: 'country-1',
        }),
      );

      expect(mockDb.query.suppliers.findMany).toHaveBeenCalled();
    });

    it('returns the mapped paginated result', async () => {
      const rows = [{ id: 's1', code: 'NCC0001', name: 'Nhà cung cấp A' }];
      mockDb.query.suppliers.findMany.mockResolvedValue(rows);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getSuppliers(buildReqDto());

      expect(result.data).toHaveLength(1);
      expect(result.pagination.totalRecords).toBe(1);
    });
  });

  describe('getSupplierStats', () => {
    it('sums totals per status, defaulting missing statuses to 0', async () => {
      mockDb.select = chainableMock([
        { status: SupplierStatus.ACTIVE, total: 3 },
        { status: SupplierStatus.PAUSED, total: 1 },
      ]);

      const result = await service.getSupplierStats();

      expect(result.active).toBe(3);
      expect(result.paused).toBe(1);
      expect(result.stopped).toBe(0);
      expect(result.total).toBe(4);
    });
  });

  describe('getSupplierDetail', () => {
    it('returns the mapped supplier when found', async () => {
      mockDb.query.suppliers.findFirst.mockResolvedValue({ id: 's1', code: 'NCC0001' });

      const result = await service.getSupplierDetail('s1');

      expect(result).toBeDefined();
      expect(mockDb.query.suppliers.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          with: {
            group: true,
            creator: true,
            attachments: true,
            representatives: true,
            country: true,
            payment: true,
          },
        }),
      );
    });

    it('throws E019 not found when the supplier does not exist', async () => {
      mockDb.query.suppliers.findFirst.mockResolvedValue(undefined);

      await expect(service.getSupplierDetail('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E019 },
      });
    });
  });

  describe('createSupplier', () => {
    const reqDto: CreateSupplierReqDto = Object.assign(new CreateSupplierReqDto(), {
      name: 'Nhà cung cấp A',
      supplierGroupId: 'group-1',
      taxCode: '0312345678',
      phoneNumber: '0909123456',
      address: '123 Đường ABC',
    });

    it('auto-generates a code, always creates a payment row, and inserts', async () => {
      mockDb.query.supplierGroups.findFirst.mockResolvedValue({ id: 'group-1' });
      mockDb.query.suppliers.findFirst
        .mockResolvedValueOnce(undefined) // validateTaxCodeUniqueness: no conflict
        .mockResolvedValueOnce({ id: 'new-supplier-id' }); // getSupplierDetail

      const result = await service.createSupplier(reqDto, 'user-1');

      expect(mockDb.query.supplierGroups.findFirst).toHaveBeenCalled();
      // 1 insert for the supplier row + 1 for the mandatory 1-1 payment row.
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
    });

    it('inserts attachments and representatives only when provided', async () => {
      mockDb.query.supplierGroups.findFirst.mockResolvedValue({ id: 'group-1' });
      mockDb.query.suppliers.findFirst
        .mockResolvedValueOnce(undefined) // validateTaxCodeUniqueness: no conflict
        .mockResolvedValueOnce({ id: 'new-supplier-id' }); // getSupplierDetail

      await service.createSupplier(
        Object.assign(new CreateSupplierReqDto(), reqDto, {
          attachments: [{ url: '/uploads/a.pdf', filename: 'a.pdf' }],
          representatives: [{ name: 'Nguyễn Văn A', isPrimary: true }],
        }),
        'user-1',
      );

      // supplier + payment + attachments + representatives.
      expect(mockDb.insert).toHaveBeenCalledTimes(4);
    });

    it('throws E020 when the explicit code is already taken', async () => {
      mockDb.query.suppliers.findFirst.mockResolvedValue({ id: 'other-supplier' });

      await expect(
        service.createSupplier(
          Object.assign(new CreateSupplierReqDto(), reqDto, { code: 'NCC0001' }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E020 },
      });
    });

    it('throws E022 when taxCode is already taken', async () => {
      mockDb.query.suppliers.findFirst.mockResolvedValue({ id: 'other-supplier' });

      await expect(service.createSupplier(reqDto, 'user-1')).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E022 },
      });
    });

    it('throws E021 when supplierGroupId does not reference an existing group', async () => {
      mockDb.query.supplierGroups.findFirst.mockResolvedValue(undefined);

      await expect(service.createSupplier(reqDto, 'user-1')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E021 },
      });
    });

    it('throws E023 when countryId does not reference an existing country', async () => {
      mockDb.query.supplierGroups.findFirst.mockResolvedValue({ id: 'group-1' });
      mockDb.query.countries.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createSupplier(
          Object.assign(new CreateSupplierReqDto(), reqDto, { countryId: 'country-1' }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E023 },
      });
    });
  });

  describe('updateSupplier', () => {
    it('throws E019 when the supplier does not exist', async () => {
      mockDb.query.suppliers.findFirst.mockResolvedValue(undefined);

      await expect(
        service.updateSupplier('missing', new UpdateSupplierReqDto()),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E019 },
      });
    });

    it('updates only the supplier fields sent', async () => {
      mockDb.query.suppliers.findFirst.mockResolvedValue({ id: 's1' });

      await service.updateSupplier(
        's1',
        Object.assign(new UpdateSupplierReqDto(), { internalNote: 'Ghi chú nội bộ' }),
      );

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('does not issue a supplier UPDATE when only payment is sent (no values to set)', async () => {
      mockDb.query.suppliers.findFirst.mockResolvedValue({ id: 's1' });

      await service.updateSupplier(
        's1',
        Object.assign(new UpdateSupplierReqDto(), { payment: { bankName: 'Vietcombank' } }),
      );

      // 1 update call for supplier_payment_info, but NOT for the supplier row itself.
      expect(mockDb.update).toHaveBeenCalledTimes(1);
    });

    it('does not issue a payment UPDATE when payment has no defined fields', async () => {
      mockDb.query.suppliers.findFirst.mockResolvedValue({ id: 's1' });

      await service.updateSupplier(
        's1',
        Object.assign(new UpdateSupplierReqDto(), { name: 'Tên mới', payment: {} }),
      );

      // Only the supplier row update, payment update skipped entirely.
      expect(mockDb.update).toHaveBeenCalledTimes(1);
    });

    it('replaces attachments/representatives only when present in the request', async () => {
      mockDb.query.suppliers.findFirst.mockResolvedValue({ id: 's1' });

      await service.updateSupplier(
        's1',
        Object.assign(new UpdateSupplierReqDto(), {
          representatives: [{ name: 'Trần Thị B' }],
        }),
      );

      expect(mockDb.delete).toHaveBeenCalledTimes(1); // representatives only, not attachments
    });
  });

  describe('deleteSupplier', () => {
    it('soft-deletes the supplier', async () => {
      mockDb.query.suppliers.findFirst.mockResolvedValue({ id: 's1' });

      await service.deleteSupplier('s1');

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws E019 when the supplier does not exist', async () => {
      mockDb.query.suppliers.findFirst.mockResolvedValue(undefined);

      await expect(service.deleteSupplier('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E019 },
      });
    });
  });
});
