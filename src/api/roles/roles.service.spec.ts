import { Test, TestingModule } from '@nestjs/testing';

import { DRIZZLE } from '../../database/database.module';
import { QueryMockArgs } from '../../test-utils/chainable-mock.util';
import { GetRolesReqDto } from './dto/get-roles.req.dto';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  let service: RolesService;
  let mockDb: {
    query: {
      roles: {
        findMany: jest.Mock<any, [QueryMockArgs]>;
      };
    };
  };

  const buildRole = (overrides: Record<string, unknown> = {}) => ({
    id: 'role-1',
    code: 'ACCOUNTANT',
    name: 'Kế toán',
    description: null,
    permissions: ['roles:read'],
    isSystem: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const buildReqDto = (
    overrides: Partial<GetRolesReqDto> = {},
  ): GetRolesReqDto => Object.assign(new GetRolesReqDto(), overrides);

  beforeEach(async () => {
    mockDb = {
      query: {
        roles: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRoles', () => {
    it('returns the whole catalogue excluding soft-deleted rows', async () => {
      mockDb.query.roles.findMany.mockResolvedValue([buildRole()]);

      const result = await service.getRoles(buildReqDto());

      const callArgs = mockDb.query.roles.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
      expect(callArgs.limit).toBeUndefined();
      expect(callArgs.offset).toBeUndefined();
      expect(result).toHaveLength(1);
    });

    it('builds a keyword filter when q is provided', async () => {
      await service.getRoles(buildReqDto({ q: 'ke toan' }));

      const callArgs = mockDb.query.roles.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });
  });
});
