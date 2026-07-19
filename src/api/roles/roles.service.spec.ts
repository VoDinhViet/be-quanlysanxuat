import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import { chainableMock, QueryMockArgs } from '../../test-utils/chainable-mock.util';
import { PermissionsService } from '../auth/permissions.service';
import { CreateRoleReqDto } from './dto/create-role.req.dto';
import { GetRolesReqDto } from './dto/get-roles.req.dto';
import { UpdateRoleReqDto } from './dto/update-role.req.dto';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  let service: RolesService;
  let mockDb: {
    query: {
      roles: { findMany: jest.Mock<any, [QueryMockArgs]>; findFirst: jest.Mock };
      credentials: { findFirst: jest.Mock };
    };
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
  };
  let mockPermissionsService: {
    invalidateRole: jest.Mock;
    invalidateCredential: jest.Mock;
    getPermissionCodes: jest.Mock;
  };

  const buildRole = (overrides: Record<string, unknown> = {}) => ({
    id: 'role-1',
    code: 'ACCOUNTANT',
    name: 'Kế toán',
    description: null,
    permissions: ['clients:read'],
    isSystem: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const buildReqDto = (overrides: Partial<GetRolesReqDto> = {}): GetRolesReqDto =>
    Object.assign(new GetRolesReqDto(), overrides);

  beforeEach(async () => {
    mockDb = {
      query: {
        roles: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
          findFirst: jest.fn(),
        },
        credentials: { findFirst: jest.fn() },
      },
      select: chainableMock([{ total: 0 }]),
      insert: chainableMock([{ id: 'new-role-id' }]),
      update: chainableMock(undefined),
    };
    mockPermissionsService = {
      invalidateRole: jest.fn(),
      invalidateCredential: jest.fn(),
      getPermissionCodes: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: PermissionsService, useValue: mockPermissionsService },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRoles', () => {
    it('applies pagination and excludes soft-deleted rows', async () => {
      mockDb.query.roles.findMany.mockResolvedValue([buildRole()]);
      mockDb.select = chainableMock([{ total: 1 }]);

      const result = await service.getRoles(buildReqDto({ limit: 5, page: 2 }));

      const callArgs = mockDb.query.roles.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
      expect(callArgs.limit).toBe(5);
      expect(callArgs.offset).toBe(5);
      expect(result.data).toHaveLength(1);
      expect(result.pagination.totalRecords).toBe(1);
    });

    it('builds a keyword filter when q is provided', async () => {
      await service.getRoles(buildReqDto({ q: 'ke toan' }));

      const callArgs = mockDb.query.roles.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });
  });

  describe('getRoleDetail', () => {
    it('returns the mapped role when found', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(buildRole());

      const result = await service.getRoleDetail('role-1');

      expect(result).toMatchObject({ code: 'ACCOUNTANT', permissions: ['clients:read'] });
    });

    it('throws E027 not found when the role does not exist', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(undefined);

      await expect(service.getRoleDetail('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E027 },
      });
    });
  });

  describe('createRole', () => {
    const reqDto: CreateRoleReqDto = Object.assign(new CreateRoleReqDto(), {
      code: 'ACCOUNTANT',
      name: 'Kế toán',
      permissions: ['clients:read'],
    });

    it('creates a role when the code is free and permissions are valid', async () => {
      mockDb.query.roles.findFirst
        .mockResolvedValueOnce(undefined) // validateCodeUniqueness
        .mockResolvedValueOnce(buildRole()); // getRoleDetail

      const result = await service.createRole(reqDto, 'actor-cred');

      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    it('throws E028 when the code is already taken', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue({ id: 'other-role' });

      await expect(service.createRole(reqDto, 'actor-cred')).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E028 },
      });
    });

    it('throws E031 when a permission code is outside the catalogue', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(undefined); // code is free

      await expect(
        service.createRole(
          Object.assign(new CreateRoleReqDto(), reqDto, { permissions: ['not:a-real-code'] }),
          'actor-cred',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: { errorCode: ErrorCode.E031 },
      });
    });

    it('throws E034 when a non-super actor tries to grant system:manage', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(undefined); // code is free
      mockPermissionsService.getPermissionCodes.mockResolvedValue(['roles:update']);

      await expect(
        service.createRole(
          Object.assign(new CreateRoleReqDto(), reqDto, { permissions: ['system:manage'] }),
          'actor-cred',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: { errorCode: ErrorCode.E034 },
      });
    });

    it('allows a super actor to grant system:manage', async () => {
      mockDb.query.roles.findFirst
        .mockResolvedValueOnce(undefined) // validateCodeUniqueness
        .mockResolvedValueOnce(buildRole({ permissions: ['system:manage'] })); // getRoleDetail
      mockPermissionsService.getPermissionCodes.mockResolvedValue(['system:manage']);

      const result = await service.createRole(
        Object.assign(new CreateRoleReqDto(), reqDto, { permissions: ['system:manage'] }),
        'actor-cred',
      );

      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });
  });

  describe('updateRole', () => {
    it('throws E027 when the role does not exist', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(undefined);

      await expect(
        service.updateRole('missing', new UpdateRoleReqDto(), 'actor-cred'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E027 },
      });
    });

    it('throws E030 when trying to modify a system role', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(buildRole({ isSystem: true }));

      await expect(
        service.updateRole(
          'role-1',
          Object.assign(new UpdateRoleReqDto(), { name: 'x' }),
          'actor-cred',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: { errorCode: ErrorCode.E030 },
      });
    });

    it('throws E034 when a non-super actor adds system:manage to a role', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(buildRole());
      mockPermissionsService.getPermissionCodes.mockResolvedValue(['roles:update']);

      await expect(
        service.updateRole(
          'role-1',
          Object.assign(new UpdateRoleReqDto(), { permissions: ['system:manage'] }),
          'actor-cred',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: { errorCode: ErrorCode.E034 },
      });
    });

    it('updates fields and invalidates the role cache', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(buildRole());

      await service.updateRole(
        'role-1',
        Object.assign(new UpdateRoleReqDto(), { name: 'Kế toán trưởng' }),
        'actor-cred',
      );

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockPermissionsService.invalidateRole).toHaveBeenCalledWith('role-1');
    });

    it('skips the UPDATE when no fields are sent but still invalidates the cache', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(buildRole());

      await service.updateRole('role-1', new UpdateRoleReqDto(), 'actor-cred');

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockPermissionsService.invalidateRole).toHaveBeenCalledWith('role-1');
    });
  });

  describe('deleteRole', () => {
    it('throws E030 for a system role', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(buildRole({ isSystem: true }));

      await expect(service.deleteRole('role-1')).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: { errorCode: ErrorCode.E030 },
      });
    });

    it('throws E029 when the role is still assigned to a credential', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(buildRole());
      mockDb.query.credentials.findFirst.mockResolvedValue({ id: 'cred-1' });

      await expect(service.deleteRole('role-1')).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E029 },
      });
    });

    it('soft-deletes an unused role and invalidates its cache', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(buildRole());
      mockDb.query.credentials.findFirst.mockResolvedValue(undefined);

      await service.deleteRole('role-1');

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockPermissionsService.invalidateRole).toHaveBeenCalledWith('role-1');
    });
  });

  describe('getPermissionCatalog', () => {
    it('groups the permission codes by resource', () => {
      const catalog = service.getPermissionCatalog();

      const clients = catalog.find((group) => group.resource === 'clients');
      expect(clients).toBeDefined();
      expect(clients?.permissions.some((p) => p.code === 'clients:create')).toBe(true);
      expect(clients?.permissions.every((p) => typeof p.action === 'string')).toBe(true);
    });
  });
});
