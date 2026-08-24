import { Test, TestingModule } from '@nestjs/testing';

import { DRIZZLE } from '../../database/database.module';
import { chainableMock } from '../../test-utils/chainable-mock.util';
import { PermissionsService } from './permissions.service';

describe('PermissionsService', () => {
  let service: PermissionsService;
  let mockDb: { select: jest.Mock };

  beforeEach(async () => {
    mockDb = { select: chainableMock([{ permissions: ['clients:read'] }]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PermissionsService, { provide: DRIZZLE, useValue: mockDb }],
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
    it("returns the joined role's permissions", async () => {
      const result = await service.getPermissionCodes('cred-1');

      expect(result).toEqual(['clients:read']);
    });

    it('returns [] when the credential has no role (no matching row)', async () => {
      mockDb.select = chainableMock([]);

      const result = await service.getPermissionCodes('cred-1');

      expect(result).toEqual([]);
    });
  });
});
