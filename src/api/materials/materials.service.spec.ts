import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PageOptionsDto } from '../../common/dto/offset-pagination/page-options.dto';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import { MaterialStatus, MaterialType } from '../../database/schemas';
import { chainableMock, QueryMockArgs } from '../../test-utils/chainable-mock.util';
import { CreateMaterialReqDto } from './dto/create-material.req.dto';
import { GetMaterialsReqDto } from './dto/get-materials.req.dto';
import { UpdateMaterialReqDto } from './dto/update-material.req.dto';
import { MaterialsService } from './materials.service';

describe('MaterialsService', () => {
  let service: MaterialsService;
  let mockDb: {
    query: {
      materials: { findMany: jest.Mock<any, [QueryMockArgs]>; findFirst: jest.Mock };
      materialGroups: { findFirst: jest.Mock };
      materialLogs: { findMany: jest.Mock<any, [QueryMockArgs]> };
      units: { findFirst: jest.Mock };
      clients: { findFirst: jest.Mock };
      suppliers: { findFirst: jest.Mock };
    };
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  const buildExisting = (overrides: Record<string, unknown> = {}) => ({
    id: 'mat-1',
    code: 'VT0001',
    name: 'Thép tấm SS400',
    unitId: 'unit-1',
    materialGroupId: 'group-1',
    type: MaterialType.INTERNAL,
    clientId: null,
    imageUrl: null,
    status: MaterialStatus.ACTIVE,
    note: null,
    materialGrade: null,
    technicalStandard: null,
    dimensions: null,
    specificWeight: null,
    colorSurface: null,
    description: null,
    origin: null,
    preferredSupplierId: null,
    leadTime: null,
    ...overrides,
  });

  const baseCreate = (overrides: Record<string, unknown> = {}): CreateMaterialReqDto =>
    Object.assign(new CreateMaterialReqDto(), {
      name: 'Thép tấm SS400',
      unitId: 'unit-1',
      materialGroupId: 'group-1',
      ...overrides,
    });

  beforeEach(async () => {
    mockDb = {
      query: {
        materials: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
          findFirst: jest.fn(),
        },
        materialGroups: { findFirst: jest.fn() },
        materialLogs: { findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]) },
        units: { findFirst: jest.fn() },
        clients: { findFirst: jest.fn() },
        suppliers: { findFirst: jest.fn() },
      },
      select: chainableMock([{ total: 0 }]),
      insert: chainableMock([{ id: 'new-material-id' }]),
      update: chainableMock(undefined),
      delete: chainableMock(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MaterialsService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<MaterialsService>(MaterialsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMaterials', () => {
    it('applies no filter without q/filters', async () => {
      await service.getMaterials(Object.assign(new GetMaterialsReqDto(), {}));

      const callArgs = mockDb.query.materials.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeUndefined();
      expect(callArgs.with).toEqual({ unit: true, group: true, client: true, creator: true });
    });

    it('builds a keyword + filters where clause', async () => {
      await service.getMaterials(
        Object.assign(new GetMaterialsReqDto(), {
          q: 'thep',
          type: MaterialType.CLIENT,
          materialGroupId: 'group-1',
          status: MaterialStatus.ACTIVE,
        }),
      );

      const callArgs = mockDb.query.materials.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });
  });

  describe('getMaterialDetail', () => {
    it('returns the mapped material when found', async () => {
      mockDb.query.materials.findFirst.mockResolvedValue(buildExisting());

      const result = await service.getMaterialDetail('mat-1');

      expect(result).toMatchObject({ code: 'VT0001' });
    });

    it('throws E035 when not found', async () => {
      mockDb.query.materials.findFirst.mockResolvedValue(undefined);

      await expect(service.getMaterialDetail('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E035 },
      });
    });
  });

  describe('createMaterial', () => {
    it('auto-generates a code and inserts an INTERNAL material + a CREATE log', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({ id: 'unit-1' });
      mockDb.query.materialGroups.findFirst.mockResolvedValue({ id: 'group-1' });
      mockDb.query.materials.findFirst.mockResolvedValue(buildExisting({ id: 'new-material-id' }));

      const result = await service.createMaterial(baseCreate(), 'user-1');

      // 1 insert for the material + 1 for the audit log.
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
    });

    it('inserts attachments when provided', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({ id: 'unit-1' });
      mockDb.query.materialGroups.findFirst.mockResolvedValue({ id: 'group-1' });
      mockDb.query.materials.findFirst.mockResolvedValue(buildExisting({ id: 'new-material-id' }));

      await service.createMaterial(
        baseCreate({ attachments: [{ url: '/uploads/a.pdf', filename: 'a.pdf' }] }),
        'user-1',
      );

      // material + attachments + log.
      expect(mockDb.insert).toHaveBeenCalledTimes(3);
    });

    it('throws E040 when type is CLIENT but no client is given', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({ id: 'unit-1' });
      mockDb.query.materialGroups.findFirst.mockResolvedValue({ id: 'group-1' });

      await expect(
        service.createMaterial(baseCreate({ type: MaterialType.CLIENT }), 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: { errorCode: ErrorCode.E040 },
      });
    });

    it('creates a CLIENT material when the client exists', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({ id: 'unit-1' });
      mockDb.query.materialGroups.findFirst.mockResolvedValue({ id: 'group-1' });
      mockDb.query.clients.findFirst.mockResolvedValue({ id: 'client-1' });
      mockDb.query.materials.findFirst.mockResolvedValue(buildExisting({ id: 'new-material-id' }));

      const result = await service.createMaterial(
        baseCreate({ type: MaterialType.CLIENT, clientId: 'client-1' }),
        'user-1',
      );

      expect(result).toBeDefined();
    });

    it('throws E036 when an explicit code is already taken', async () => {
      mockDb.query.materials.findFirst.mockResolvedValue({ id: 'other' });

      await expect(
        service.createMaterial(baseCreate({ code: 'VT0001' }), 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E036 },
      });
    });

    it('throws E011 when the unit does not exist', async () => {
      mockDb.query.units.findFirst.mockResolvedValue(undefined);

      await expect(service.createMaterial(baseCreate(), 'user-1')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E011 },
      });
    });

    it('throws E037 when the material group does not exist', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({ id: 'unit-1' });
      mockDb.query.materialGroups.findFirst.mockResolvedValue(undefined);

      await expect(service.createMaterial(baseCreate(), 'user-1')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E037 },
      });
    });

    it('throws E019 when the preferred supplier does not exist', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({ id: 'unit-1' });
      mockDb.query.materialGroups.findFirst.mockResolvedValue({ id: 'group-1' });
      mockDb.query.suppliers.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createMaterial(baseCreate({ preferredSupplierId: 'sup-1' }), 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E019 },
      });
    });

    it('throws E009 when a CLIENT material references a missing client', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({ id: 'unit-1' });
      mockDb.query.materialGroups.findFirst.mockResolvedValue({ id: 'group-1' });
      mockDb.query.clients.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createMaterial(
          baseCreate({ type: MaterialType.CLIENT, clientId: 'client-1' }),
          'user-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E009 },
      });
    });
  });

  describe('updateMaterial', () => {
    it('throws E035 when the material does not exist', async () => {
      mockDb.query.materials.findFirst.mockResolvedValue(undefined);

      await expect(
        service.updateMaterial('missing', new UpdateMaterialReqDto(), 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E035 },
      });
    });

    it('updates changed fields and records an UPDATE log', async () => {
      mockDb.query.materials.findFirst
        .mockResolvedValueOnce(buildExisting())
        .mockResolvedValueOnce(buildExisting({ name: 'Tên mới' }));

      await service.updateMaterial(
        'mat-1',
        Object.assign(new UpdateMaterialReqDto(), { name: 'Tên mới' }),
        'user-1',
      );

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled(); // audit log
    });

    it('does not issue a material UPDATE when only attachments are sent', async () => {
      mockDb.query.materials.findFirst
        .mockResolvedValueOnce(buildExisting())
        .mockResolvedValueOnce(buildExisting());

      await service.updateMaterial(
        'mat-1',
        Object.assign(new UpdateMaterialReqDto(), {
          attachments: [{ url: '/u/a.pdf', filename: 'a.pdf' }],
        }),
        'user-1',
      );

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockDb.delete).toHaveBeenCalled(); // attachments replace-all
    });

    it('clears the client when switching an existing CLIENT material to INTERNAL', async () => {
      mockDb.query.materials.findFirst
        .mockResolvedValueOnce(buildExisting({ type: MaterialType.CLIENT, clientId: 'client-1' }))
        .mockResolvedValueOnce(buildExisting());

      await service.updateMaterial(
        'mat-1',
        Object.assign(new UpdateMaterialReqDto(), { type: MaterialType.INTERNAL }),
        'user-1',
      );

      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('deleteMaterial', () => {
    it('hard-deletes an existing material', async () => {
      mockDb.query.materials.findFirst.mockResolvedValue(buildExisting());

      await service.deleteMaterial('mat-1');

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('throws E035 when the material does not exist', async () => {
      mockDb.query.materials.findFirst.mockResolvedValue(undefined);

      await expect(service.deleteMaterial('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E035 },
      });
    });
  });

  describe('getMaterialLogs', () => {
    it('lists logs for an existing material', async () => {
      mockDb.query.materials.findFirst.mockResolvedValue(buildExisting());
      mockDb.query.materialLogs.findMany.mockResolvedValue([
        { id: 'log-1', action: 'CREATE', changes: {}, createdAt: new Date() },
      ]);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getMaterialLogs('mat-1', new PageOptionsDto());

      expect(mockDb.query.materialLogs.findMany).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
    });

    it('throws E035 when the material does not exist', async () => {
      mockDb.query.materials.findFirst.mockResolvedValue(undefined);

      await expect(service.getMaterialLogs('missing', new PageOptionsDto())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E035 },
      });
    });
  });
});
