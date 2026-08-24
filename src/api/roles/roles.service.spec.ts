import { HttpStatus, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import {
  chainableMock,
  QueryMockArgs,
} from '../../test-utils/chainable-mock.util';
import { PermissionsService } from '../auth/permissions.service';
import { CreateRoleReqDto } from './dto/create-role.req.dto';
import { GetRolesReqDto } from './dto/get-roles.req.dto';
import { UpdateRoleReqDto } from './dto/update-role.req.dto';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  let service: RolesService;
  let mockDb: {
    query: {
      roles: {
        findMany: jest.Mock<any, [QueryMockArgs]>;
        findFirst: jest.Mock;
      };
      credentials: { findFirst: jest.Mock };
    };
    insert: jest.Mock;
    update: jest.Mock;
  };
  let mockPermissionsService: { getPermissionCodes: jest.Mock };

  const buildRole = (overrides: Record<string, unknown> = {}) => ({
    id: 'role-1',
    code: 'ACCOUNTANT',
    name: 'Kế toán',
    description: null,
    permissions: ['clients:read'],
    isSystem: false,
    isProtected: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const buildReqDto = (
    overrides: Partial<GetRolesReqDto> = {},
  ): GetRolesReqDto => Object.assign(new GetRolesReqDto(), overrides);

  beforeEach(async () => {
    mockDb = {
      query: {
        roles: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
          findFirst: jest.fn(),
        },
        credentials: { findFirst: jest.fn() },
      },
      insert: chainableMock(undefined),
      update: chainableMock(undefined),
    };
    mockPermissionsService = { getPermissionCodes: jest.fn() };

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
    it('returns the whole catalogue excluding soft-deleted rows', async () => {
      mockDb.query.roles.findMany.mockResolvedValue([buildRole()]);

      const result = await service.getRoles(buildReqDto());

      const callArgs = mockDb.query.roles.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
      expect(result).toHaveLength(1);
    });

    it('builds a keyword filter when q is provided', async () => {
      await service.getRoles(buildReqDto({ q: 'ke toan' }));

      const callArgs = mockDb.query.roles.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });
  });

  describe('getRole', () => {
    it('returns the role when found', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(buildRole());

      const result = await service.getRole('role-1');

      expect(result.code).toBe('ACCOUNTANT');
    });

    it('throws E027 when not found', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(undefined);

      await expect(service.getRole('missing')).rejects.toMatchObject({
        response: { errorCode: ErrorCode.E027 },
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('createRole', () => {
    const buildDto = (
      overrides: Partial<CreateRoleReqDto> = {},
    ): CreateRoleReqDto =>
      Object.assign(new CreateRoleReqDto(), {
        code: 'QC2',
        name: 'QC phụ',
        permissions: ['iqc:read'],
        ...overrides,
      });

    it('inserts the role once code is unique and permissions are valid', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(undefined);

      await service.createRole(buildDto(), 'actor-1');

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('throws E028 when the code is already taken', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createRole(buildDto(), 'actor-1'),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.E028 },
        status: HttpStatus.CONFLICT,
      });
    });

    it('throws E031 when a permission code is not in PERMISSION_CODES', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createRole(
          buildDto({ permissions: ['bogus:code'] as never }),
          'actor-1',
        ),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.E031 },
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('throws E034 when granting system:manage without holding it', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(undefined);
      mockPermissionsService.getPermissionCodes.mockResolvedValue([
        'roles:update',
      ]);

      await expect(
        service.createRole(
          buildDto({ permissions: ['system:manage'] }),
          'actor-1',
        ),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.E034 },
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('allows granting system:manage when the actor already holds it', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(undefined);
      mockPermissionsService.getPermissionCodes.mockResolvedValue([
        'system:manage',
      ]);

      await service.createRole(
        buildDto({ permissions: ['system:manage'] }),
        'actor-1',
      );

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    const buildDto = (
      overrides: Partial<UpdateRoleReqDto> = {},
    ): UpdateRoleReqDto => Object.assign(new UpdateRoleReqDto(), overrides);

    it('updates a non-system role', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(buildRole());

      await service.updateRole(
        'role-1',
        buildDto({ name: 'Kế toán mới' }),
        'actor-1',
      );

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws E030 on a system role', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(
        buildRole({ isSystem: true }),
      );

      await expect(
        service.updateRole('role-1', buildDto({ name: 'x' }), 'actor-1'),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.E030 },
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('re-validates permission codes when permissions is sent', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(buildRole());

      await expect(
        service.updateRole(
          'role-1',
          buildDto({ permissions: ['bogus:code'] as never }),
          'actor-1',
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E031 } });
    });
  });

  describe('deleteRole', () => {
    it('soft-deletes a role with no assigned credential', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(buildRole());
      mockDb.query.credentials.findFirst.mockResolvedValue(undefined);

      await service.deleteRole('role-1');

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws E030 on a system role', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(
        buildRole({ isSystem: true }),
      );

      await expect(service.deleteRole('role-1')).rejects.toMatchObject({
        response: { errorCode: ErrorCode.E030 },
      });
    });

    it('throws E029 when a credential still references the role', async () => {
      mockDb.query.roles.findFirst.mockResolvedValue(buildRole());
      mockDb.query.credentials.findFirst.mockResolvedValue({ id: 'cred-1' });

      await expect(service.deleteRole('role-1')).rejects.toMatchObject({
        response: { errorCode: ErrorCode.E029 },
        status: HttpStatus.CONFLICT,
      });
    });
  });

  describe('onModuleInit', () => {
    it('warns for every role holding an unknown permission code', async () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      mockDb.query.roles.findMany.mockResolvedValue([
        buildRole({ code: 'QC', permissions: ['products:read'] }),
      ]);

      await service.onModuleInit();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('products:read'),
      );
      warnSpy.mockRestore();
    });

    it('stays silent when every role only holds known codes', async () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      mockDb.query.roles.findMany.mockResolvedValue([buildRole()]);

      await service.onModuleInit();

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
