import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { DRIZZLE } from '../../database/database.module';
import { STORAGE_PROVIDER } from '../../storage/storage.constants';
import {
  chainableMock,
  QueryMockArgs,
} from '../../test-utils/chainable-mock.util';
import { FilesCleanupService } from './files-cleanup.service';

const ORPHAN_TTL = 24 * 60 * 60;

describe('FilesCleanupService', () => {
  let service: FilesCleanupService;
  let mockDb: {
    query: { files: { findMany: jest.Mock<any, [QueryMockArgs]> } };
    delete: jest.Mock;
  };
  let mockStorageProvider: { delete: jest.Mock };
  let mockConfigService: { getOrThrow: jest.Mock };

  const orphan = (id: string, storageKey: string) => ({ id, storageKey });

  beforeEach(async () => {
    mockDb = {
      query: {
        files: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
        },
      },
      delete: chainableMock(undefined),
    };
    mockStorageProvider = { delete: jest.fn().mockResolvedValue(undefined) };
    mockConfigService = { getOrThrow: jest.fn(() => ORPHAN_TTL) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesCleanupService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: STORAGE_PROVIDER, useValue: mockStorageProvider },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<FilesCleanupService>(FilesCleanupService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('touches nothing when there are no orphans', async () => {
    await service.sweepOrphans();

    expect(mockStorageProvider.delete).not.toHaveBeenCalled();
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  // The `where` clause is a drizzle SQL object, too opaque to assert structurally without pinning
  // internals. What is worth pinning is that the grace period is read from config at all — a
  // sweeper that ignored it would delete files the moment they were uploaded.
  it('reads the grace period from config and narrows the selected columns', async () => {
    await service.sweepOrphans();

    expect(mockConfigService.getOrThrow).toHaveBeenCalledWith(
      'upload.orphanTtl',
      { infer: true },
    );
    const callArgs = mockDb.query.files.findMany.mock.calls[0][0];
    expect(callArgs.where).toBeDefined();
    expect(callArgs.columns).toEqual({ id: true, storageKey: true });
  });

  it('deletes the stored bytes for every orphan, then the rows', async () => {
    mockDb.query.files.findMany.mockResolvedValue([
      orphan('file-1', '2026/07/20/a.png'),
      orphan('file-2', '2026/07/20/b.pdf'),
    ]);

    await service.sweepOrphans();

    expect(mockStorageProvider.delete).toHaveBeenCalledTimes(2);
    expect(mockStorageProvider.delete).toHaveBeenCalledWith('2026/07/20/a.png');
    expect(mockStorageProvider.delete).toHaveBeenCalledWith('2026/07/20/b.pdf');
    expect(mockDb.delete).toHaveBeenCalledTimes(1);
  });

  // Bytes must go first: a row pointing at missing bytes gets retried next sweep, but bytes with
  // no row left behind are unreachable — nothing records the storage key any more.
  it('removes bytes before rows', async () => {
    const order: string[] = [];
    mockDb.query.files.findMany.mockResolvedValue([
      orphan('file-1', '2026/07/20/a.png'),
    ]);
    mockStorageProvider.delete.mockImplementation(() => {
      order.push('bytes');
      return Promise.resolve();
    });
    const deleteChain = chainableMock(undefined);
    mockDb.delete = jest.fn((...args: unknown[]) => {
      order.push('row');
      return deleteChain(...args) as unknown;
    });

    await service.sweepOrphans();

    expect(order).toEqual(['bytes', 'row']);
  });
});
