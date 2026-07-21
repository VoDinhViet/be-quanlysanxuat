import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import { OperationStatus, OperationType } from '../../database/schemas';
import { chainableMock, QueryMockArgs } from '../../test-utils/chainable-mock.util';
import { CreateOperationReqDto } from './dto/create-operation.req.dto';
import { GetOperationsReqDto } from './dto/get-operations.req.dto';
import { UpdateOperationReqDto } from './dto/update-operation.req.dto';
import { OperationsService } from './operations.service';

describe('OperationsService', () => {
  let service: OperationsService;
  let mockDb: {
    query: {
      operations: { findMany: jest.Mock<any, [QueryMockArgs]>; findFirst: jest.Mock };
    };
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
  };

  const buildReqDto = (overrides: Partial<GetOperationsReqDto> = {}): GetOperationsReqDto =>
    Object.assign(new GetOperationsReqDto(), overrides);

  beforeEach(async () => {
    mockDb = {
      query: {
        operations: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
          findFirst: jest.fn(),
        },
      },
      select: chainableMock([{ total: 0 }]),
      insert: chainableMock([{ id: 'new-operation-id' }]),
      update: chainableMock(undefined),
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
    it('excludes soft-deleted rows and applies no filter without q/filters', async () => {
      await service.getOperations(buildReqDto());

      const callArgs = mockDb.query.operations.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
      expect(callArgs.limit).toBe(10);
      expect(callArgs.offset).toBe(0);
      expect(callArgs.with).toEqual({ creator: true });
    });

    it('applies type/status filters when provided', async () => {
      await service.getOperations(
        buildReqDto({ type: OperationType.OUTSOURCE, status: OperationStatus.ACTIVE }),
      );

      expect(mockDb.query.operations.findMany).toHaveBeenCalled();
    });

    it('returns the mapped paginated result', async () => {
      const rows = [{ id: 'op1', code: 'CD0001', name: 'Cắt laser' }];
      mockDb.query.operations.findMany.mockResolvedValue(rows);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getOperations(buildReqDto());

      expect(result.data).toHaveLength(1);
      expect(result.pagination.totalRecords).toBe(1);
    });
  });

  describe('getOperationDetail', () => {
    it('returns the mapped operation when found', async () => {
      mockDb.query.operations.findFirst.mockResolvedValue({ id: 'op1', code: 'CD0001' });

      const result = await service.getOperationDetail('op1');

      expect(result).toBeDefined();
      expect(mockDb.query.operations.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ with: { creator: true } }),
      );
    });

    it('throws E046 not found when the operation does not exist', async () => {
      mockDb.query.operations.findFirst.mockResolvedValue(undefined);

      await expect(service.getOperationDetail('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E046 },
      });
    });
  });

  describe('createOperation', () => {
    const reqDto: CreateOperationReqDto = Object.assign(new CreateOperationReqDto(), {
      name: 'Cắt laser',
      type: OperationType.INHOUSE,
    });

    it('auto-generates a code and inserts', async () => {
      mockDb.select = chainableMock([{ total: 3 }]);
      mockDb.query.operations.findFirst.mockResolvedValue({ id: 'new-operation-id' });

      const result = await service.createOperation(reqDto, 'user-1');

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('throws E047 when the explicit code is already taken', async () => {
      mockDb.query.operations.findFirst.mockResolvedValue({ id: 'other-operation' });

      await expect(
        service.createOperation(
          Object.assign(new CreateOperationReqDto(), reqDto, { code: 'CD0001' }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E047 },
      });
    });
  });

  describe('updateOperation', () => {
    it('throws E046 when the operation does not exist', async () => {
      mockDb.query.operations.findFirst.mockResolvedValue(undefined);

      await expect(
        service.updateOperation('missing', new UpdateOperationReqDto()),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E046 },
      });
    });

    it('updates the operation when it exists', async () => {
      mockDb.query.operations.findFirst
        .mockResolvedValueOnce({ id: 'op1' }) // ensureOperationExists
        .mockResolvedValueOnce({ id: 'op1', code: 'CD0002' }); // getOperationDetail

      const result = await service.updateOperation(
        'op1',
        Object.assign(new UpdateOperationReqDto(), { name: 'Cắt laser CNC' }),
      );

      expect(mockDb.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    // Was a 500: `.set()` with every value `undefined` throws a bare "No values to set". The
    // always-written `updated_at` is what makes an empty PATCH a harmless no-op instead.
    it('handles an empty PATCH body without throwing', async () => {
      mockDb.query.operations.findFirst
        .mockResolvedValueOnce({ id: 'op1' })
        .mockResolvedValueOnce({ id: 'op1' });

      await expect(
        service.updateOperation('op1', new UpdateOperationReqDto()),
      ).resolves.toBeDefined();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws E047 when the new code is already taken by another operation', async () => {
      mockDb.query.operations.findFirst
        .mockResolvedValueOnce({ id: 'op1' }) // ensureOperationExists
        .mockResolvedValueOnce({ id: 'other' }); // validateCodeUniqueness conflict

      await expect(
        service.updateOperation(
          'op1',
          Object.assign(new UpdateOperationReqDto(), { code: 'CD0003' }),
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E047 },
      });
    });
  });

  describe('deleteOperation', () => {
    it('soft-deletes the operation', async () => {
      mockDb.query.operations.findFirst.mockResolvedValue({ id: 'op1' });

      await service.deleteOperation('op1');

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws E046 when the operation does not exist', async () => {
      mockDb.query.operations.findFirst.mockResolvedValue(undefined);

      await expect(service.deleteOperation('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E046 },
      });
    });
  });
});
