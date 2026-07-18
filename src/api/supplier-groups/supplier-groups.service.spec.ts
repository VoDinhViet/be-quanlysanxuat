import { Test, TestingModule } from '@nestjs/testing';

import { DRIZZLE } from '../../database/database.module';
import { chainableMock, QueryMockArgs } from '../../test-utils/chainable-mock.util';
import { GetSupplierGroupsReqDto } from './dto/get-supplier-groups.req.dto';
import { SupplierGroupsService } from './supplier-groups.service';

describe('SupplierGroupsService', () => {
  let service: SupplierGroupsService;
  let mockDb: {
    query: { supplierGroups: { findMany: jest.Mock<any, [QueryMockArgs]> } };
    select: jest.Mock;
  };

  const buildReqDto = (overrides: Partial<GetSupplierGroupsReqDto> = {}): GetSupplierGroupsReqDto =>
    Object.assign(new GetSupplierGroupsReqDto(), overrides);

  beforeEach(async () => {
    mockDb = {
      query: {
        supplierGroups: { findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]) },
      },
      select: chainableMock([{ total: 0 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SupplierGroupsService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<SupplierGroupsService>(SupplierGroupsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSupplierGroups', () => {
    it('returns a paginated list without a keyword filter', async () => {
      const groups = [{ id: '1', code: 'VTKL', name: 'Vật tư kim loại' }];
      mockDb.query.supplierGroups.findMany.mockResolvedValue(groups);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getSupplierGroups(buildReqDto());

      const callArgs = mockDb.query.supplierGroups.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeUndefined();
      expect(callArgs.limit).toBe(10);
      expect(callArgs.offset).toBe(0);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ code: 'VTKL', name: 'Vật tư kim loại' });
      expect(result.pagination.totalRecords).toBe(1);
    });

    it('builds a keyword search filter when q is provided', async () => {
      await service.getSupplierGroups(buildReqDto({ q: 'vat tu' }));

      const callArgs = mockDb.query.supplierGroups.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });

    it('applies pagination limit/offset from the request', async () => {
      await service.getSupplierGroups(buildReqDto({ limit: 5, page: 3 }));

      const callArgs = mockDb.query.supplierGroups.findMany.mock.calls[0][0];
      expect(callArgs.limit).toBe(5);
      expect(callArgs.offset).toBe(10);
    });
  });
});
