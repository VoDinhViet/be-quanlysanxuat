import { Test, TestingModule } from '@nestjs/testing';

import { DRIZZLE } from '../../database/database.module';
import {
  chainableMock,
  QueryMockArgs,
} from '../../test-utils/chainable-mock.util';
import { GetProductGroupsReqDto } from './dto/get-product-groups.req.dto';
import { ProductGroupsService } from './product-groups.service';

describe('ProductGroupsService', () => {
  let service: ProductGroupsService;
  let mockDb: {
    query: { productGroups: { findMany: jest.Mock<any, [QueryMockArgs]> } };
    select: jest.Mock;
  };

  const buildReqDto = (
    overrides: Partial<GetProductGroupsReqDto> = {},
  ): GetProductGroupsReqDto =>
    Object.assign(new GetProductGroupsReqDto(), overrides);

  beforeEach(async () => {
    mockDb = {
      query: {
        productGroups: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
        },
      },
      select: chainableMock([{ total: 0 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductGroupsService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<ProductGroupsService>(ProductGroupsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProductGroups', () => {
    it('returns a paginated list without a keyword filter', async () => {
      const groups = [{ id: '1', code: 'PG01', name: 'Nhóm sản phẩm A' }];
      mockDb.query.productGroups.findMany.mockResolvedValue(groups);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getProductGroups(buildReqDto());

      const callArgs = mockDb.query.productGroups.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeUndefined();
      expect(callArgs.limit).toBe(10);
      expect(callArgs.offset).toBe(0);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        code: 'PG01',
        name: 'Nhóm sản phẩm A',
      });
      expect(result.pagination.totalRecords).toBe(1);
    });

    it('builds a keyword search filter when q is provided', async () => {
      await service.getProductGroups(buildReqDto({ q: 'san pham' }));

      const callArgs = mockDb.query.productGroups.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });

    it('applies pagination limit/offset from the request', async () => {
      await service.getProductGroups(buildReqDto({ limit: 5, page: 3 }));

      const callArgs = mockDb.query.productGroups.findMany.mock.calls[0][0];
      expect(callArgs.limit).toBe(5);
      expect(callArgs.offset).toBe(10);
    });
  });
});
