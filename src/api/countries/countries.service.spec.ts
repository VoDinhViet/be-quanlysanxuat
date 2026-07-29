import { Test, TestingModule } from '@nestjs/testing';

import { DRIZZLE } from '../../database/database.module';
import { QueryMockArgs } from '../../test-utils/chainable-mock.util';
import { CountriesService } from './countries.service';
import { GetCountriesReqDto } from './dto/get-countries.req.dto';

describe('CountriesService', () => {
  let service: CountriesService;
  let mockDb: {
    query: { countries: { findMany: jest.Mock<any, [QueryMockArgs]> } };
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
    it('returns the whole catalogue as a bare array, unfiltered and unpaginated', async () => {
      const rows = [{ id: '1', code: 'VN', name: 'Việt Nam' }];
      mockDb.query.countries.findMany.mockResolvedValue(rows);

      const result = await service.getCountries(buildReqDto());

      const callArgs = mockDb.query.countries.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeUndefined();
      expect(callArgs.limit).toBeUndefined();
      expect(callArgs.offset).toBeUndefined();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ code: 'VN', name: 'Việt Nam' });
    });

    it('builds a keyword search filter when q is provided', async () => {
      await service.getCountries(buildReqDto({ q: 'viet nam' }));

      const callArgs = mockDb.query.countries.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });
  });
});
