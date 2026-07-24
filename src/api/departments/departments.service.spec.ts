import { Test, TestingModule } from '@nestjs/testing';

import { DRIZZLE } from '../../database/database.module';
import {
  chainableMock,
  QueryMockArgs,
} from '../../test-utils/chainable-mock.util';
import { DepartmentsService } from './departments.service';
import { GetDepartmentsReqDto } from './dto/get-departments.req.dto';

describe('DepartmentsService', () => {
  let service: DepartmentsService;
  let mockDb: {
    query: { departments: { findMany: jest.Mock<any, [QueryMockArgs]> } };
    select: jest.Mock;
  };

  const buildReqDto = (
    overrides: Partial<GetDepartmentsReqDto> = {},
  ): GetDepartmentsReqDto =>
    Object.assign(new GetDepartmentsReqDto(), overrides);

  beforeEach(async () => {
    mockDb = {
      query: {
        departments: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
        },
      },
      select: chainableMock([{ total: 0 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DepartmentsService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<DepartmentsService>(DepartmentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDepartments', () => {
    it('returns a paginated list without a keyword filter', async () => {
      const rows = [{ id: '1', code: 'SX', name: 'Sản xuất' }];
      mockDb.query.departments.findMany.mockResolvedValue(rows);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getDepartments(buildReqDto());

      const callArgs = mockDb.query.departments.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeUndefined();
      expect(callArgs.limit).toBe(10);
      expect(callArgs.offset).toBe(0);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ code: 'SX', name: 'Sản xuất' });
      expect(result.pagination.totalRecords).toBe(1);
    });

    it('builds a keyword search filter when q is provided', async () => {
      await service.getDepartments(buildReqDto({ q: 'san xuat' }));

      const callArgs = mockDb.query.departments.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });

    it('applies pagination limit/offset from the request', async () => {
      await service.getDepartments(buildReqDto({ limit: 5, page: 3 }));

      const callArgs = mockDb.query.departments.findMany.mock.calls[0][0];
      expect(callArgs.limit).toBe(5);
      expect(callArgs.offset).toBe(10);
    });
  });
});
