import { Test, TestingModule } from '@nestjs/testing';

import { DRIZZLE } from '../../database/database.module';
import {
  chainableMock,
  QueryMockArgs,
} from '../../test-utils/chainable-mock.util';
import { CountriesService } from './countries.service';
import { GetCountriesReqDto } from './dto/get-countries.req.dto';

describe('CountriesService', () => {
  let service: CountriesService;
  let mockDb: {
    query: { countries: { findMany: jest.Mock<any, [QueryMockArgs]> } };
    select: jest.Mock;
  };

  const buildReqDto = (
    overrides: Partial<GetCountriesReqDto> = {},
  ): GetCountriesReqDto => Object.assign(new GetCountriesReqDto(), overrides);

  beforeEach(async () => {
    mockDb = {
      query: {
        countries: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
        },
      },
      select: chainableMock([{ total: 0 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CountriesService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<CountriesService>(CountriesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCountries', () => {
    it('returns a paginated list without a keyword filter', async () => {
      const rows = [{ id: '1', code: 'VN', name: 'Việt Nam' }];
      mockDb.query.countries.findMany.mockResolvedValue(rows);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getCountries(buildReqDto());

      const callArgs = mockDb.query.countries.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeUndefined();
      expect(callArgs.limit).toBe(10);
      expect(callArgs.offset).toBe(0);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ code: 'VN', name: 'Việt Nam' });
      expect(result.pagination.totalRecords).toBe(1);
    });

    it('builds a keyword search filter when q is provided', async () => {
      await service.getCountries(buildReqDto({ q: 'viet nam' }));

      const callArgs = mockDb.query.countries.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });

    it('applies pagination limit/offset from the request', async () => {
      await service.getCountries(buildReqDto({ limit: 5, page: 3 }));

      const callArgs = mockDb.query.countries.findMany.mock.calls[0][0];
      expect(callArgs.limit).toBe(5);
      expect(callArgs.offset).toBe(10);
    });
  });
});
