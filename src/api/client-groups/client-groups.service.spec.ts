import { Test, TestingModule } from '@nestjs/testing';

import { DRIZZLE } from '../../database/database.module';
import {
  chainableMock,
  QueryMockArgs,
} from '../../test-utils/chainable-mock.util';
import { ClientGroupsService } from './client-groups.service';
import { GetClientGroupsReqDto } from './dto/get-client-groups.req.dto';

describe('ClientGroupsService', () => {
  let service: ClientGroupsService;
  let mockDb: {
    query: { clientGroups: { findMany: jest.Mock<any, [QueryMockArgs]> } };
    select: jest.Mock;
  };

  const buildReqDto = (
    overrides: Partial<GetClientGroupsReqDto> = {},
  ): GetClientGroupsReqDto =>
    Object.assign(new GetClientGroupsReqDto(), overrides);

  beforeEach(async () => {
    mockDb = {
      query: {
        clientGroups: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
        },
      },
      select: chainableMock([{ total: 0 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientGroupsService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<ClientGroupsService>(ClientGroupsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getClientGroups', () => {
    it('returns a paginated list without a keyword filter', async () => {
      const groups = [{ id: '1', code: 'STRATEGIC', name: 'Chiến lược' }];
      mockDb.query.clientGroups.findMany.mockResolvedValue(groups);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getClientGroups(buildReqDto());

      const callArgs = mockDb.query.clientGroups.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeUndefined();
      expect(callArgs.limit).toBe(10);
      expect(callArgs.offset).toBe(0);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        code: 'STRATEGIC',
        name: 'Chiến lược',
      });
      expect(result.pagination.totalRecords).toBe(1);
    });

    it('builds a keyword search filter when q is provided', async () => {
      await service.getClientGroups(buildReqDto({ q: 'chien luoc' }));

      const callArgs = mockDb.query.clientGroups.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });

    it('applies pagination limit/offset from the request', async () => {
      await service.getClientGroups(buildReqDto({ limit: 5, page: 3 }));

      const callArgs = mockDb.query.clientGroups.findMany.mock.calls[0][0];
      expect(callArgs.limit).toBe(5);
      expect(callArgs.offset).toBe(10);
    });
  });
});
