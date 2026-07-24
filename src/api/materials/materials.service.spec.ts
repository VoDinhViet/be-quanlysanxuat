import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import {
  MaterialStatus,
  MaterialType,
  UnitScope,
} from '../../database/schemas';
import {
  chainableMock,
  QueryMockArgs,
} from '../../test-utils/chainable-mock.util';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { CreateMaterialReqDto } from './dto/create-material.req.dto';
import { GetMaterialsReqDto } from './dto/get-materials.req.dto';
import { MaterialsService } from './materials.service';

/** Minimal stand-in for drizzle's insert builder: `.values().returning()` or a bare `await`. */
interface InsertChain {
  values: jest.Mock;
  returning: jest.Mock;
  then: (resolve: (value: unknown) => unknown) => unknown;
}

describe('MaterialsService', () => {
  let service: MaterialsService;
  let mockDb: {
    query: {
      materials: {
        findMany: jest.Mock<any, [QueryMockArgs]>;
        findFirst: jest.Mock;
      };
      materialGroups: { findFirst: jest.Mock };
      units: { findFirst: jest.Mock };
      clients: { findFirst: jest.Mock };
    };
    select: jest.Mock;
    insert: jest.Mock;
    transaction: jest.Mock;
  };
  let mockFilesService: { linkFiles: jest.Mock };
  /** Rows handed to each `insert(...).values(...)` call, in order. */
  let insertedValues: unknown[];

  /** The single row an `insert(materials)` received. */
  const insertedRow = (index: number) =>
    insertedValues[index] as Record<string, unknown>;

  /**
   * `chainable()` hands back a fresh jest.fn on every property access, so `.values()` arguments
   * can't be read back from it. This capturing variant records them while still supporting both
   * `insert().values().returning()` and a bare `await insert().values()`.
   */
  const buildInsertMock = () =>
    jest.fn(() => {
      const chain: InsertChain = {
        values: jest.fn((rows: unknown) => {
          insertedValues.push(rows);
          return chain;
        }),
        returning: jest.fn().mockResolvedValue([{ id: 'new-material-id' }]),
        then: (resolve) => resolve(undefined),
      };
      return chain;
    });

  const DETAIL_ROW = {
    id: 'new-material-id',
    code: 'VT0001',
    name: 'Thép tấm 5mm',
    type: MaterialType.INTERNAL,
    status: MaterialStatus.ACTIVE,
    unit: { id: 'unit-id', code: 'KG', name: 'Kilogram' },
    group: { id: 'group-id', code: 'THEP_TAM', name: 'Thép tấm' },
    client: null,
    imageFile: null,
    attachments: [],
    creator: { id: 'user-id', username: 'admin' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const buildListReqDto = (
    overrides: Partial<GetMaterialsReqDto> = {},
  ): GetMaterialsReqDto => Object.assign(new GetMaterialsReqDto(), overrides);

  const buildCreateReqDto = (
    overrides: Partial<CreateMaterialReqDto> = {},
  ): CreateMaterialReqDto =>
    Object.assign(new CreateMaterialReqDto(), {
      name: 'Thép tấm 5mm',
      unitId: 'unit-id',
      materialGroupId: 'group-id',
      ...overrides,
    });

  beforeEach(async () => {
    insertedValues = [];
    mockDb = {
      query: {
        materials: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue(DETAIL_ROW),
        },
        materialGroups: {
          findFirst: jest.fn().mockResolvedValue({ id: 'group-id' }),
        },
        units: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'unit-id',
            scopes: [{ scope: UnitScope.MATERIAL }],
          }),
        },
        clients: {
          findFirst: jest.fn().mockResolvedValue({ id: 'client-id' }),
        },
      },
      select: chainableMock([{ total: 0 }]),
      insert: buildInsertMock(),
      // Passing mockDb itself as the transaction handle keeps `tx.insert(...)` pointing at the
      // same jest mock, so call-count assertions work whether a write is inside the tx or not.
      transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(mockDb),
      ),
    };
    mockFilesService = { linkFiles: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialsService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: FilesService, useValue: mockFilesService },
      ],
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
    it('paginates with default page options and pulls the list relations', async () => {
      await service.getMaterials(buildListReqDto());

      const callArgs = mockDb.query.materials.findMany.mock.calls[0][0];
      expect(callArgs.limit).toBe(10);
      expect(callArgs.offset).toBe(0);
      expect(callArgs.with).toEqual({
        unit: true,
        group: true,
        client: true,
        creator: true,
        imageFile: true,
      });
    });

    it('builds a predicate when q is given', async () => {
      await service.getMaterials(buildListReqDto({ q: 'thép' }));

      expect(
        mockDb.query.materials.findMany.mock.calls[0][0].where,
      ).toBeDefined();
    });

    it('builds a predicate for each filter', async () => {
      await service.getMaterials(
        buildListReqDto({
          type: MaterialType.CLIENT,
          materialGroupId: 'group-id',
          clientId: 'client-id',
          status: MaterialStatus.INACTIVE,
        }),
      );

      expect(
        mockDb.query.materials.findMany.mock.calls[0][0].where,
      ).toBeDefined();
    });

    it('maps rows to MaterialResDto and reports the total', async () => {
      mockDb.query.materials.findMany.mockResolvedValue([
        { ...DETAIL_ROW, secret: 'dropped' },
      ]);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getMaterials(buildListReqDto());

      expect(result.data).toHaveLength(1);
      expect(result.data[0].code).toBe('VT0001');
      expect(result.data[0]).not.toHaveProperty('secret');
    });
  });

  describe('createMaterial', () => {
    it('auto-generates the code when omitted and writes inside a transaction', async () => {
      const result = await service.createMaterial(
        buildCreateReqDto(),
        'user-id',
      );

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      const inserted = insertedRow(0);
      expect(inserted.code).toBe('VT0001');
      expect(inserted.type).toBe(MaterialType.INTERNAL);
      expect(inserted.status).toBe(MaterialStatus.ACTIVE);
      expect(inserted.createdBy).toBe('user-id');
      expect(result.code).toBe('VT0001');
    });

    it('keeps a client-supplied code after checking uniqueness', async () => {
      mockDb.query.materials.findFirst
        .mockResolvedValueOnce(undefined) // uniqueness probe
        .mockResolvedValueOnce(DETAIL_ROW); // detail re-read

      await service.createMaterial(
        buildCreateReqDto({ code: 'VT9999' }),
        'user-id',
      );

      const inserted = insertedRow(0);
      expect(inserted.code).toBe('VT9999');
    });

    it('inserts attachments in the same transaction', async () => {
      await service.createMaterial(
        buildCreateReqDto({ attachmentFileIds: ['file-a', 'file-b'] }),
        'user-id',
      );

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
      const attachmentRows = insertedValues[1];
      expect(attachmentRows).toEqual([
        { materialId: 'new-material-id', fileId: 'file-a' },
        { materialId: 'new-material-id', fileId: 'file-b' },
      ]);
    });

    it('validates image and attachment file ids together', async () => {
      await service.createMaterial(
        buildCreateReqDto({
          imageFileId: 'image-file',
          attachmentFileIds: ['doc-file'],
        }),
        'user-id',
      );

      expect(mockFilesService.linkFiles).toHaveBeenCalledWith([
        'image-file',
        'doc-file',
      ]);
    });

    it('persists the client link and requires it when type is CLIENT', async () => {
      await service.createMaterial(
        buildCreateReqDto({ type: MaterialType.CLIENT, clientId: 'client-id' }),
        'user-id',
      );

      const inserted = insertedRow(0);
      expect(inserted.clientId).toBe('client-id');
    });

    it('clears any clientId when type is INTERNAL', async () => {
      await service.createMaterial(
        buildCreateReqDto({
          type: MaterialType.INTERNAL,
          clientId: 'client-id',
        }),
        'user-id',
      );

      const inserted = insertedRow(0);
      expect(inserted.clientId).toBeNull();
      expect(mockDb.query.clients.findFirst).not.toHaveBeenCalled();
    });

    it('throws E036 when the supplied code is taken', async () => {
      mockDb.query.materials.findFirst.mockResolvedValueOnce({
        id: 'existing-id',
      });

      await expect(
        service.createMaterial(
          buildCreateReqDto({ code: 'VT0001' }),
          'user-id',
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E036 } });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E011 when the unit does not exist', async () => {
      mockDb.query.units.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createMaterial(buildCreateReqDto(), 'user-id'),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.E011 },
      });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E043 when the unit exists but is not usable on materials', async () => {
      mockDb.query.units.findFirst.mockResolvedValue({
        id: 'unit-id',
        scopes: [],
      });

      await expect(
        service.createMaterial(buildCreateReqDto(), 'user-id'),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.E043 },
      });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E037 when the material group does not exist', async () => {
      mockDb.query.materialGroups.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createMaterial(buildCreateReqDto(), 'user-id'),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.E037 },
      });
    });

    it('throws E040 when type is CLIENT without a clientId', async () => {
      await expect(
        service.createMaterial(
          buildCreateReqDto({ type: MaterialType.CLIENT }),
          'user-id',
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E040 } });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('throws E009 when the referenced client does not exist', async () => {
      mockDb.query.clients.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createMaterial(
          buildCreateReqDto({ type: MaterialType.CLIENT, clientId: 'missing' }),
          'user-id',
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E009 } });
    });

    it('propagates E042 from the files registry before opening a transaction', async () => {
      mockFilesService.linkFiles.mockRejectedValue(
        new AppException(ErrorCode.E042, HttpStatus.NOT_FOUND),
      );

      await expect(
        service.createMaterial(
          buildCreateReqDto({ attachmentFileIds: ['ghost'] }),
          'user-id',
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E042 } });
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('rolls back and never re-reads the detail when a write inside the transaction fails', async () => {
      const failure = new Error('attachment insert failed');
      mockDb.transaction.mockRejectedValue(failure);

      await expect(
        service.createMaterial(
          buildCreateReqDto({ attachmentFileIds: ['file-a'] }),
          'user-id',
        ),
      ).rejects.toThrow(failure);
      expect(mockDb.query.materials.findFirst).not.toHaveBeenCalled();
    });
  });
});
