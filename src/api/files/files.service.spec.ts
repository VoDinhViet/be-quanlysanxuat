import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Readable } from 'stream';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import { FileKind, UploadType } from '../../database/schemas';
import { STORAGE_PROVIDER } from '../../storage/storage.constants';
import { chainableMock } from '../../test-utils/chainable-mock.util';
import { PermissionsService } from '../auth/permissions.service';
import { setFileUrlResolver } from './file-url-resolver';
import { FilesService } from './files.service';
import { detectFileType } from './util/file-type.util';

jest.mock('./util/file-type.util');

const mockDetectFileType = detectFileType as jest.Mock;

const CONFIG_VALUES: Record<string, unknown> = {
  'upload.maxImageSize': 5 * 1024 * 1024,
  'upload.maxDocumentSize': 10 * 1024 * 1024,
  'upload.driver': 'local',
};

describe('FilesService', () => {
  let service: FilesService;
  let mockDb: {
    query: { files: { findFirst: jest.Mock; findMany: jest.Mock } };
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let mockStorageProvider: {
    save: jest.Mock;
    delete: jest.Mock;
    createReadStream: jest.Mock;
  };
  let mockConfigService: { getOrThrow: jest.Mock };
  let mockPermissionsService: { getPermissionCodes: jest.Mock };
  /** Rows handed to `insert(...).values(...)`, so tests can assert on what was written. */
  let insertedValues: Record<string, unknown>[];

  const UPLOADER = 'credential-1';
  const OTHER_USER = 'credential-2';

  const buildFile = (
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File =>
    ({
      originalname: 'photo.png',
      buffer: Buffer.from('fake-image-bytes'),
      size: 1024,
      mimetype: 'image/png',
      ...overrides,
    }) as Express.Multer.File;

  const buildFileRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'file-1',
    storageKey: '2026/07/20/uuid.png',
    originalName: 'photo.png',
    mimetype: 'image/png',
    size: 1024,
    checksum: 'abc123',
    type: UploadType.MATERIAL_IMAGE,
    kind: FileKind.IMAGE,
    storageDriver: 'local',
    uploadedBy: UPLOADER,
    createdAt: new Date('2026-07-20'),
    ...overrides,
  });

  /** Minimal stand-in for drizzle's insert builder: `.values().returning()`. */
  interface InsertChain {
    values: jest.Mock;
    returning: jest.Mock;
  }

  /** Captures `.values()` — `chainable()` returns a fresh jest.fn per access and can't report it. */
  const buildInsertMock = () =>
    jest.fn((): InsertChain => {
      const chain: InsertChain = {
        values: jest.fn((rows: Record<string, unknown>) => {
          insertedValues.push(rows);
          return chain;
        }),
        returning: jest.fn().mockResolvedValue([buildFileRow()]),
      };
      return chain;
    });

  beforeEach(async () => {
    insertedValues = [];
    // `FileResDto.url` goes through the module-level resolver, which throws until FilesModule binds
    // it at boot. Tests have no module lifecycle, so bind a deterministic stand-in here.
    setFileUrlResolver(
      (fileId) => `/api/files/${fileId}/download?exp=1&sig=test`,
    );

    mockDb = {
      query: { files: { findFirst: jest.fn(), findMany: jest.fn() } },
      insert: buildInsertMock(),
      update: chainableMock(undefined),
      delete: chainableMock(undefined),
    };
    mockStorageProvider = {
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      createReadStream: jest.fn(() => Readable.from(['bytes'])),
    };
    mockConfigService = {
      getOrThrow: jest.fn((key: string) => CONFIG_VALUES[key]),
    };
    mockPermissionsService = {
      getPermissionCodes: jest.fn().mockResolvedValue([]),
    };
    mockDetectFileType.mockResolvedValue({ mime: 'image/png', ext: 'png' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: STORAGE_PROVIDER, useValue: mockStorageProvider },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PermissionsService, useValue: mockPermissionsService },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upload', () => {
    it('throws E016 when no file is provided', async () => {
      await expect(
        service.upload(undefined, { type: UploadType.MATERIAL_IMAGE }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: { errorCode: ErrorCode.E016 },
      });
      expect(mockStorageProvider.save).not.toHaveBeenCalled();
    });

    it('throws E017 when the file exceeds the size limit for its kind', async () => {
      const file = buildFile({ size: 6 * 1024 * 1024 }); // > 5MB image limit

      await expect(
        service.upload(file, { type: UploadType.MATERIAL_IMAGE }),
      ).rejects.toMatchObject({
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        response: { errorCode: ErrorCode.E017 },
      });
      expect(mockDetectFileType).not.toHaveBeenCalled();
    });

    it('throws E016 when the content type cannot be detected', async () => {
      mockDetectFileType.mockResolvedValue(undefined);

      await expect(
        service.upload(buildFile(), { type: UploadType.MATERIAL_IMAGE }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: { errorCode: ErrorCode.E016 },
      });
      expect(mockStorageProvider.save).not.toHaveBeenCalled();
    });

    it('throws E016 when the detected type is not allowed for the type policy', async () => {
      // Client asks for an avatar, but the real bytes are a PDF — magic-byte check must win.
      mockDetectFileType.mockResolvedValue({
        mime: 'application/pdf',
        ext: 'pdf',
      });

      await expect(
        service.upload(buildFile(), { type: UploadType.USER_AVATAR }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: { errorCode: ErrorCode.E016 },
      });
    });

    it('rejects legacy .doc/.xls (undetectable by file-type) even under a DOCUMENT type', async () => {
      mockDetectFileType.mockResolvedValue(undefined);
      const file = buildFile({
        originalname: 'contract.doc',
        mimetype: 'application/msword',
      });

      await expect(
        service.upload(file, { type: UploadType.MATERIAL_DOCUMENT }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: { errorCode: ErrorCode.E016 },
      });
    });

    it('saves the file, inserts a registry row, and returns the mapped FileResDto', async () => {
      const file = buildFile();

      const result = await service.upload(file, {
        type: UploadType.MATERIAL_IMAGE,
        uploadedBy: UPLOADER,
      });

      expect(mockStorageProvider.save).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}\/\d{2}\/\d{2}\/.+\.png$/),
        file.buffer,
        'image/png',
      );
      expect(insertedValues[0]).toMatchObject({
        type: UploadType.MATERIAL_IMAGE,
        kind: FileKind.IMAGE,
        uploadedBy: UPLOADER,
      });
      expect(result.id).toBe('file-1');
      expect(result.url).toBe('/api/files/file-1/download?exp=1&sig=test');
    });

    // The whole point of deriving `kind` server-side: a DOCUMENT type must pick the document
    // allowlist and cap even though the client never says so.
    it('derives kind from the policy rather than from the client', async () => {
      mockDetectFileType.mockResolvedValue({
        mime: 'application/pdf',
        ext: 'pdf',
      });

      await service.upload(
        buildFile({ originalname: 'invoice.pdf', size: 8 * 1024 * 1024 }),
        {
          type: UploadType.MATERIAL_DOCUMENT,
        },
      );

      expect(mockConfigService.getOrThrow).toHaveBeenCalledWith(
        'upload.maxDocumentSize',
        {
          infer: true,
        },
      );
      expect(insertedValues[0].kind).toBe(FileKind.DOCUMENT);
    });

    it('applies the image cap to an image type', async () => {
      await service.upload(buildFile(), { type: UploadType.PRODUCT_IMAGE });

      expect(mockConfigService.getOrThrow).toHaveBeenCalledWith(
        'upload.maxImageSize',
        {
          infer: true,
        },
      );
    });
  });

  describe('getFileById', () => {
    it('returns the mapped file when found', async () => {
      mockDb.query.files.findFirst.mockResolvedValue(buildFileRow());

      const result = await service.getFileById('file-1');

      expect(result.id).toBe('file-1');
      expect(result.url).toBe('/api/files/file-1/download?exp=1&sig=test');
    });

    it('throws E042 when the file does not exist', async () => {
      mockDb.query.files.findFirst.mockResolvedValue(undefined);

      await expect(service.getFileById('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E042 },
      });
    });
  });

  describe('streamFile', () => {
    const reqDto = {
      exp: Math.floor(Date.now() / 1000) + 600,
      sig: 'whatever',
    };
    type HeaderMap = Record<string, string>;
    const buildRes = () => ({ set: jest.fn<void, [HeaderMap]>() });
    /** Headers passed to the single `res.set({...})` call. */
    const headersOf = (res: { set: jest.Mock<void, [HeaderMap]> }): HeaderMap =>
      res.set.mock.calls[0][0];

    it('streams the bytes and serves images inline', async () => {
      mockDb.query.files.findFirst.mockResolvedValue(buildFileRow());
      const res = buildRes();

      const result = await service.streamFile('file-1', reqDto, res as never);

      expect(mockStorageProvider.createReadStream).toHaveBeenCalledWith(
        '2026/07/20/uuid.png',
      );
      expect(result).toBeDefined();
      const headers = headersOf(res);
      expect(headers['Content-Type']).toBe('image/png');
      expect(headers['Content-Disposition']).toMatch(/^inline;/);
    });

    it('serves documents as an attachment', async () => {
      mockDb.query.files.findFirst.mockResolvedValue(
        buildFileRow({ kind: FileKind.DOCUMENT, mimetype: 'application/pdf' }),
      );
      const res = buildRes();

      await service.streamFile('file-1', reqDto, res as never);

      expect(headersOf(res)['Content-Disposition']).toMatch(/^attachment;/);
    });

    // Vietnamese filenames are the norm here; a bare `filename=` would mangle every diacritic.
    it('encodes a Vietnamese filename via RFC 5987 and keeps an ASCII fallback', async () => {
      mockDb.query.files.findFirst.mockResolvedValue(
        buildFileRow({
          originalName: 'Bản vẽ kỹ thuật.pdf',
          kind: FileKind.DOCUMENT,
        }),
      );
      const res = buildRes();

      await service.streamFile('file-1', reqDto, res as never);

      const disposition = headersOf(res)['Content-Disposition'];
      expect(disposition).toContain(
        `filename*=UTF-8''${encodeURIComponent('Bản vẽ kỹ thuật.pdf')}`,
      );
      // The fallback must not carry raw non-ASCII bytes into the header.
      const fallback = /filename="([^"]*)"/.exec(disposition)?.[1] as string;
      expect(fallback).toMatch(/^[\x20-\x7E]*$/);
    });

    it('caps Cache-Control at the signature lifetime', async () => {
      mockDb.query.files.findFirst.mockResolvedValue(buildFileRow());
      const res = buildRes();

      await service.streamFile('file-1', reqDto, res as never);

      expect(headersOf(res)['Cache-Control']).toMatch(/^private, max-age=\d+$/);
    });

    it('throws E042 when the file does not exist', async () => {
      mockDb.query.files.findFirst.mockResolvedValue(undefined);

      await expect(
        service.streamFile('missing', reqDto, buildRes() as never),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E042 } });
    });
  });

  describe('deleteFile', () => {
    it('lets the uploader delete their own file', async () => {
      mockDb.query.files.findFirst.mockResolvedValue(buildFileRow());

      await service.deleteFile('file-1', UPLOADER);

      expect(mockStorageProvider.delete).toHaveBeenCalledWith(
        '2026/07/20/uuid.png',
      );
      expect(mockDb.delete).toHaveBeenCalled();
      // The uploader shortcut must not even consult the permission cache.
      expect(mockPermissionsService.getPermissionCodes).not.toHaveBeenCalled();
    });

    it('lets a system:manage holder delete someone else’s file', async () => {
      mockDb.query.files.findFirst.mockResolvedValue(buildFileRow());
      mockPermissionsService.getPermissionCodes.mockResolvedValue([
        'system:manage',
      ]);

      await service.deleteFile('file-1', OTHER_USER);

      expect(mockStorageProvider.delete).toHaveBeenCalled();
    });

    it('throws E033 when another user without system:manage tries to delete', async () => {
      mockDb.query.files.findFirst.mockResolvedValue(buildFileRow());
      mockPermissionsService.getPermissionCodes.mockResolvedValue([
        'materials:read',
      ]);

      await expect(
        service.deleteFile('file-1', OTHER_USER),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: { errorCode: ErrorCode.E033 },
      });
      expect(mockStorageProvider.delete).not.toHaveBeenCalled();
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('throws E042 when the file does not exist', async () => {
      mockDb.query.files.findFirst.mockResolvedValue(undefined);

      await expect(
        service.deleteFile('missing', UPLOADER),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E042 },
      });
      expect(mockStorageProvider.delete).not.toHaveBeenCalled();
    });
  });

  describe('linkFiles', () => {
    it('resolves without querying or writing when the id list is empty', async () => {
      await service.linkFiles([]);

      expect(mockDb.query.files.findMany).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('stamps linkedAt when every id exists (de-duplicated)', async () => {
      mockDb.query.files.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

      await expect(service.linkFiles(['a', 'b', 'a'])).resolves.toBeUndefined();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws E042 and marks nothing when at least one id does not exist', async () => {
      mockDb.query.files.findMany.mockResolvedValue([{ id: 'a' }]);

      await expect(service.linkFiles(['a', 'missing'])).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E042 },
      });
      // A partial link would take real files out of the sweeper's reach on a failed request.
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });
});
