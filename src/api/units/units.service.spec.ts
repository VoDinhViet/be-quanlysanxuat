import { Test, TestingModule } from '@nestjs/testing';

import { DRIZZLE } from '../../database/database.module';
import { chainableMock, QueryMockArgs } from '../../test-utils/chainable-mock.util';
import { GetUnitsReqDto } from './dto/get-units.req.dto';
import { UnitsService } from './units.service';

describe('UnitsService', () => {
  let service: UnitsService;
  let mockDb: {
    query: { units: { findMany: jest.Mock<any, [QueryMockArgs]> } };
    select: jest.Mock;
  };

  const buildReqDto = (overrides: Partial<GetUnitsReqDto> = {}): GetUnitsReqDto =>
    Object.assign(new GetUnitsReqDto(), overrides);

  beforeEach(async () => {
    mockDb = {
      query: { units: { findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]) } },
      select: chainableMock([{ total: 0 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UnitsService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<UnitsService>(UnitsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUnits', () => {
    it('returns a paginated list without a keyword filter', async () => {
      const rows = [{ id: '1', code: 'KG', name: 'Kilogram' }];
      mockDb.query.units.findMany.mockResolvedValue(rows);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getUnits(buildReqDto());

      const callArgs = mockDb.query.units.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeUndefined();
      expect(callArgs.limit).toBe(10);
      expect(callArgs.offset).toBe(0);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ code: 'KG', name: 'Kilogram' });
      expect(result.pagination.totalRecords).toBe(1);
    });

    it('builds a keyword search filter when q is provided', async () => {
      await service.getUnits(buildReqDto({ q: 'kilo' }));

      const callArgs = mockDb.query.units.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });

    it('applies pagination limit/offset from the request', async () => {
      await service.getUnits(buildReqDto({ limit: 5, page: 3 }));

      const callArgs = mockDb.query.units.findMany.mock.calls[0][0];
      expect(callArgs.limit).toBe(5);
      expect(callArgs.offset).toBe(10);
    });
  });
});
