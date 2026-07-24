import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';

import { DRIZZLE } from '../../database/database.module';
import { PermissionsService } from './permissions.service';

describe('PermissionsService', () => {
  let service: PermissionsService;
  let mockDb: {
    query: {
      credentials: { findFirst: jest.Mock };
      roles: { findFirst: jest.Mock };
    };
  };
  let cacheStore: Record<string, unknown>;
  let mockCache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  const CRED_KEY = 'credential_role:cred-1';
  const ROLE_KEY = 'role_permissions:role-1';

  beforeEach(async () => {
    cacheStore = {};
    mockDb = {
      query: {
        credentials: { findFirst: jest.fn() },
        roles: { findFirst: jest.fn() },
      },
    };
    mockCache = {
      get: jest.fn((key: string) => Promise.resolve(cacheStore[key])),
      set: jest.fn((key: string, value: unknown) => {
        cacheStore[key] = value;
        return Promise.resolve();
      }),
      del: jest.fn(() => Promise.resolve()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPermissionCodes', () => {
    it('loads role + permissions from DB on a cold cache and caches both levels', async () => {
      mockDb.query.credentials.findFirst.mockResolvedValue({
        roleId: 'role-1',
      });
      mockDb.query.roles.findFirst.mockResolvedValue({
        permissions: ['clients:read'],
      });

      const result = await service.getPermissionCodes('cred-1');

      expect(result).toEqual(['clients:read']);
      expect(mockCache.set).toHaveBeenCalledWith(
        CRED_KEY,
        'role-1',
        expect.any(Number),
      );
      expect(mockCache.set).toHaveBeenCalledWith(
        ROLE_KEY,
        ['clients:read'],
        expect.any(Number),
      );
    });

    it('returns [] and never queries roles when the credential has no role', async () => {
      mockDb.query.credentials.findFirst.mockResolvedValue({ roleId: null });

      const result = await service.getPermissionCodes('cred-1');

      expect(result).toEqual([]);
      expect(mockDb.query.roles.findFirst).not.toHaveBeenCalled();
    });

    it('serves both levels from cache without touching the DB', async () => {
      cacheStore[CRED_KEY] = 'role-1';
      cacheStore[ROLE_KEY] = ['products:read'];

      const result = await service.getPermissionCodes('cred-1');

      expect(result).toEqual(['products:read']);
      expect(mockDb.query.credentials.findFirst).not.toHaveBeenCalled();
      expect(mockDb.query.roles.findFirst).not.toHaveBeenCalled();
    });

    it('treats the NO_ROLE sentinel cached value as "no permissions"', async () => {
      cacheStore[CRED_KEY] = '__none__';

      const result = await service.getPermissionCodes('cred-1');

      expect(result).toEqual([]);
      expect(mockDb.query.credentials.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('invalidation', () => {
    it('invalidateRole clears the role permissions cache key', async () => {
      await service.invalidateRole('role-1');
      expect(mockCache.del).toHaveBeenCalledWith(ROLE_KEY);
    });

    it('invalidateCredential clears the credential role cache key', async () => {
      await service.invalidateCredential('cred-1');
      expect(mockCache.del).toHaveBeenCalledWith(CRED_KEY);
    });
  });
});
