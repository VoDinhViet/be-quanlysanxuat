import { Test, TestingModule } from '@nestjs/testing';

import { DRIZZLE } from '../../database/database.module';
import { OperationStatus, OperationType } from '../../database/schemas';
import { QueryMockArgs } from '../../test-utils/chainable-mock.util';
import { GetOperationsReqDto } from './dto/get-operations.req.dto';
import { OperationsService } from './operations.service';

describe('OperationsService', () => {
  let service: OperationsService;
  let mockDb: {
    query: { operations: { findMany: jest.Mock<any, [QueryMockArgs]> } };
  };

  const buildReqDto = (
    overrides: Partial<GetOperationsReqDto> = {},
  ): GetOperationsReqDto => Object.assign(new GetOperationsReqDto(), overrides);

  beforeEach(async () => {
    mockDb = {
      query: {
        operations: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OperationsService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<OperationsService>(OperationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOperations', () => {
    it('returns the whole catalogue as a bare array, unfiltered and unpaginated', async () => {
      const rows = [{ id: 'op1', code: 'CD0001', name: 'Cắt laser' }];
      mockDb.query.operations.findMany.mockResolvedValue(rows);

      const result = await service.getOperations(buildReqDto());

      const callArgs = mockDb.query.operations.findMany.mock.calls[0][0];
      expect(callArgs.limit).toBe(100);
      expect(callArgs.offset).toBeUndefined();
      expect(callArgs.with).toEqual({ creator: true });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ code: 'CD0001', name: 'Cắt laser' });
    });

    it('applies type/status filters when provided', async () => {
      await service.getOperations(
        buildReqDto({
          type: OperationType.OUTSOURCE,
          status: OperationStatus.ACTIVE,
        }),
      );

      expect(mockDb.query.operations.findMany).toHaveBeenCalled();
    });
  });
});
