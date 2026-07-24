import { Test, TestingModule } from '@nestjs/testing';

import { DRIZZLE } from '../../database/database.module';
import { UnitScope } from '../../database/schemas';
import {
  chainableMock,
  QueryMockArgs,
} from '../../test-utils/chainable-mock.util';
import { GetUnitsReqDto } from './dto/get-units.req.dto';
import { UnitsService } from './units.service';

describe('UnitsService', () => {
  let service: UnitsService;
  let mockDb: {
    query: { units: { findMany: jest.Mock<any, [QueryMockArgs]> } };
    select: jest.Mock;
  };

  const buildReqDto = (
    overrides: Partial<GetUnitsReqDto> = {},
  ): GetUnitsReqDto => Object.assign(new GetUnitsReqDto(), overrides);

  beforeEach(async () => {
    mockDb = {
      query: {
        units: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
        },
      },
      // Still needed: the `scope` filter builds a subquery with `db.select(...)`.
      select: chainableMock([]),
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
    it('returns the whole catalogue as a bare array, unfiltered and unpaginated', async () => {
      mockDb.query.units.findMany.mockResolvedValue([
        { id: '1', code: 'KG', name: 'Kilogram', secret: 'dropped' },
      ]);

      const result = await service.getUnits(buildReqDto());

      const callArgs = mockDb.query.units.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeUndefined();
      expect(callArgs.limit).toBeUndefined();
      expect(callArgs.offset).toBeUndefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ code: 'KG', name: 'Kilogram' });
      expect(result[0]).not.toHaveProperty('secret');
    });

    it('never runs a count query', async () => {
      await service.getUnits(buildReqDto());

      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('orders alphabetically by name for the dropdown', async () => {
      await service.getUnits(buildReqDto());

      expect(
        mockDb.query.units.findMany.mock.calls[0][0].orderBy,
      ).toBeDefined();
    });

    it('builds a keyword search filter when q is provided', async () => {
      await service.getUnits(buildReqDto({ q: 'kilo' }));

      expect(mockDb.query.units.findMany.mock.calls[0][0].where).toBeDefined();
    });

    it('narrows to the requested scope with a unit_scopes subquery', async () => {
      await service.getUnits(buildReqDto({ scope: UnitScope.PRODUCT }));

      expect(mockDb.query.units.findMany.mock.calls[0][0].where).toBeDefined();
      // The scope filter is a subquery over unit_scopes, not a column on units.
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('does not filter by scope when none is requested', async () => {
      await service.getUnits(buildReqDto());

      expect(
        mockDb.query.units.findMany.mock.calls[0][0].where,
      ).toBeUndefined();
    });
  });
});
