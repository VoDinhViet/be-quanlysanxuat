import { Test, TestingModule } from '@nestjs/testing';

import { DRIZZLE } from '../../database/database.module';
import { chainableMock, QueryMockArgs } from '../../test-utils/chainable-mock.util';
import { GetMaterialGroupsReqDto } from './dto/get-material-groups.req.dto';
import { MaterialGroupsService } from './material-groups.service';

describe('MaterialGroupsService', () => {
  let service: MaterialGroupsService;
  let mockDb: {
    query: { materialGroups: { findMany: jest.Mock<any, [QueryMockArgs]> } };
    select: jest.Mock;
  };

  const buildReqDto = (overrides: Partial<GetMaterialGroupsReqDto> = {}): GetMaterialGroupsReqDto =>
    Object.assign(new GetMaterialGroupsReqDto(), overrides);

  beforeEach(async () => {
    mockDb = {
      query: {
        materialGroups: { findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]) },
      },
      select: chainableMock([{ total: 0 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MaterialGroupsService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<MaterialGroupsService>(MaterialGroupsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMaterialGroups', () => {
    it('paginates with the default page options', async () => {
      await service.getMaterialGroups(buildReqDto());

      const callArgs = mockDb.query.materialGroups.findMany.mock.calls[0][0];
      expect(callArgs.limit).toBe(10);
      expect(callArgs.offset).toBe(0);
    });

    it('builds a search predicate when q is given', async () => {
      await service.getMaterialGroups(buildReqDto({ q: 'thép' }));

      const callArgs = mockDb.query.materialGroups.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });

    it('maps rows to MaterialGroupResDto and reports the total', async () => {
      mockDb.query.materialGroups.findMany.mockResolvedValue([
        {
          id: 'group-id',
          code: 'THEP_TAM',
          name: 'Thép tấm',
          description: 'Thép dạng tấm',
          createdAt: new Date(),
          updatedAt: new Date(),
          extraneous: 'dropped',
        },
      ]);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getMaterialGroups(buildReqDto());

      expect(result.data).toHaveLength(1);
      expect(result.data[0].code).toBe('THEP_TAM');
      expect(result.data[0]).not.toHaveProperty('extraneous');
    });
  });
});
