import { Test, TestingModule } from '@nestjs/testing';

import { DRIZZLE } from '../../database/database.module';
import { chainableMock, QueryMockArgs } from '../../test-utils/chainable-mock.util';
import { GetPositionsReqDto } from './dto/get-positions.req.dto';
import { PositionsService } from './positions.service';

describe('PositionsService', () => {
  let service: PositionsService;
  let mockDb: {
    query: { positions: { findMany: jest.Mock<any, [QueryMockArgs]> } };
    select: jest.Mock;
  };

  const buildReqDto = (overrides: Partial<GetPositionsReqDto> = {}): GetPositionsReqDto =>
    Object.assign(new GetPositionsReqDto(), overrides);

  beforeEach(async () => {
    mockDb = {
      query: { positions: { findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]) } },
      select: chainableMock([{ total: 0 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PositionsService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<PositionsService>(PositionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPositions', () => {
    it('returns a paginated list without a keyword filter', async () => {
      const rows = [{ id: '1', code: 'TP', name: 'Trưởng phòng' }];
      mockDb.query.positions.findMany.mockResolvedValue(rows);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getPositions(buildReqDto());

      const callArgs = mockDb.query.positions.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeUndefined();
      expect(callArgs.limit).toBe(10);
      expect(callArgs.offset).toBe(0);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ code: 'TP', name: 'Trưởng phòng' });
      expect(result.pagination.totalRecords).toBe(1);
    });

    it('builds a keyword search filter when q is provided', async () => {
      await service.getPositions(buildReqDto({ q: 'truong phong' }));

      const callArgs = mockDb.query.positions.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });

    it('applies pagination limit/offset from the request', async () => {
      await service.getPositions(buildReqDto({ limit: 5, page: 3 }));

      const callArgs = mockDb.query.positions.findMany.mock.calls[0][0];
      expect(callArgs.limit).toBe(5);
      expect(callArgs.offset).toBe(10);
    });
  });
});
