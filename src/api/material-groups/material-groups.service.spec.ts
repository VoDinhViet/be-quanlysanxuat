import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import { chainableMock, QueryMockArgs } from '../../test-utils/chainable-mock.util';
import { CreateMaterialGroupReqDto } from './dto/create-material-group.req.dto';
import { GetMaterialGroupsReqDto } from './dto/get-material-groups.req.dto';
import { UpdateMaterialGroupReqDto } from './dto/update-material-group.req.dto';
import { MaterialGroupsService } from './material-groups.service';

describe('MaterialGroupsService', () => {
  let service: MaterialGroupsService;
  let mockDb: {
    query: {
      materialGroups: { findMany: jest.Mock<any, [QueryMockArgs]>; findFirst: jest.Mock };
      materials: { findFirst: jest.Mock };
    };
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  const buildReqDto = (overrides: Partial<GetMaterialGroupsReqDto> = {}): GetMaterialGroupsReqDto =>
    Object.assign(new GetMaterialGroupsReqDto(), overrides);

  beforeEach(async () => {
    mockDb = {
      query: {
        materialGroups: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
          findFirst: jest.fn(),
        },
        materials: { findFirst: jest.fn() },
      },
      select: chainableMock([{ total: 0 }]),
      insert: chainableMock([{ id: 'new-group-id' }]),
      update: chainableMock(undefined),
      delete: chainableMock(undefined),
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
    it('returns a paginated list without a keyword filter', async () => {
      mockDb.query.materialGroups.findMany.mockResolvedValue([
        { id: '1', code: 'THEP_TAM', name: 'Thép tấm' },
      ]);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getMaterialGroups(buildReqDto());

      const callArgs = mockDb.query.materialGroups.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeUndefined();
      expect(result.data).toHaveLength(1);
      expect(result.pagination.totalRecords).toBe(1);
    });

    it('builds a keyword filter when q is provided', async () => {
      await service.getMaterialGroups(buildReqDto({ q: 'thep' }));

      const callArgs = mockDb.query.materialGroups.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });
  });

  describe('getMaterialGroupDetail', () => {
    it('returns the mapped group when found', async () => {
      mockDb.query.materialGroups.findFirst.mockResolvedValue({
        id: '1',
        code: 'THEP_TAM',
        name: 'Thép tấm',
      });

      const result = await service.getMaterialGroupDetail('1');

      expect(result).toMatchObject({ code: 'THEP_TAM' });
    });

    it('throws E037 when the group does not exist', async () => {
      mockDb.query.materialGroups.findFirst.mockResolvedValue(undefined);

      await expect(service.getMaterialGroupDetail('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E037 },
      });
    });
  });

  describe('createMaterialGroup', () => {
    const reqDto: CreateMaterialGroupReqDto = Object.assign(new CreateMaterialGroupReqDto(), {
      code: 'THEP_TAM',
      name: 'Thép tấm',
    });

    it('creates a group when the code is free', async () => {
      mockDb.query.materialGroups.findFirst
        .mockResolvedValueOnce(undefined) // validateCodeUniqueness
        .mockResolvedValueOnce({ id: 'new-group-id', code: 'THEP_TAM', name: 'Thép tấm' }); // detail

      const result = await service.createMaterialGroup(reqDto);

      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    it('throws E038 when the code is already taken', async () => {
      mockDb.query.materialGroups.findFirst.mockResolvedValue({ id: 'other' });

      await expect(service.createMaterialGroup(reqDto)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E038 },
      });
    });
  });

  describe('updateMaterialGroup', () => {
    it('throws E037 when the group does not exist', async () => {
      mockDb.query.materialGroups.findFirst.mockResolvedValue(undefined);

      await expect(
        service.updateMaterialGroup('missing', new UpdateMaterialGroupReqDto()),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E037 },
      });
    });

    it('updates when a field is sent', async () => {
      mockDb.query.materialGroups.findFirst.mockResolvedValue({ id: '1' });

      await service.updateMaterialGroup(
        '1',
        Object.assign(new UpdateMaterialGroupReqDto(), { name: 'Mới' }),
      );

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('does not issue an UPDATE when no field is sent', async () => {
      mockDb.query.materialGroups.findFirst.mockResolvedValue({ id: '1' });

      await service.updateMaterialGroup('1', new UpdateMaterialGroupReqDto());

      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteMaterialGroup', () => {
    it('throws E039 when the group is still used by a material', async () => {
      mockDb.query.materialGroups.findFirst.mockResolvedValue({ id: '1' });
      mockDb.query.materials.findFirst.mockResolvedValue({ id: 'mat-1' });

      await expect(service.deleteMaterialGroup('1')).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E039 },
      });
    });

    it('hard-deletes an unused group', async () => {
      mockDb.query.materialGroups.findFirst.mockResolvedValue({ id: '1' });
      mockDb.query.materials.findFirst.mockResolvedValue(undefined);

      await service.deleteMaterialGroup('1');

      expect(mockDb.delete).toHaveBeenCalled();
    });
  });
});
