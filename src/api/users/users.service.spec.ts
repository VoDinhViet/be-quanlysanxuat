import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { AppException } from '../../exceptions/app.exception';
import { DRIZZLE } from '../../database/database.module';
import {
  chainable,
  chainableMock,
  QueryMockArgs,
} from '../../test-utils/chainable-mock.util';
import { PermissionsService } from '../auth/permissions.service';
import { setFileUrlResolver } from '../files/file-url-resolver';
import { FilesService } from '../files/files.service';
import { AssignRoleReqDto } from './dto/assign-role.req.dto';
import { CreateUserReqDto } from './dto/create-user.req.dto';
import { GetUsersReqDto } from './dto/get-users.req.dto';
import { UpdateUserReqDto } from './dto/update-user.req.dto';
import { UsersService } from './users.service';

/** Minimal stand-in for drizzle's insert builder: `.values().returning()` or a bare `await`. */
interface InsertChain {
  values: jest.Mock;
  returning: jest.Mock;
  then: (resolve: (value: unknown) => unknown) => unknown;
}

/** Minimal stand-in for drizzle's update builder: `.set().where()`, awaited. */
interface UpdateChain {
  set: jest.Mock;
  where: jest.Mock;
  then: (resolve: (value: unknown) => unknown) => unknown;
}

describe('UsersService', () => {
  let service: UsersService;
  let mockDb: {
    query: {
      users: {
        findMany: jest.Mock<any, [QueryMockArgs]>;
        findFirst: jest.Mock;
      };
      credentials: { findFirst: jest.Mock };
      departments: { findFirst: jest.Mock };
      positions: { findFirst: jest.Mock };
      roles: { findFirst: jest.Mock };
    };
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
  };
  let mockPermissionsService: {
    invalidateCredential: jest.Mock;
    invalidateRole: jest.Mock;
    getPermissionCodes: jest.Mock;
  };
  let mockFilesService: {
    upload: jest.Mock;
    linkFiles: jest.Mock;
  };

  /** Rows handed to each `insert(...).values(...)` call, in order. */
  let insertedValues: unknown[];
  /** Rows handed to each `update(...).set(...)` call, in order. */
  let updatedValues: unknown[];

  const insertedRow = (index: number) =>
    insertedValues[index] as Record<string, unknown>;
  const updatedRow = (index: number) =>
    updatedValues[index] as Record<string, unknown>;

  /**
   * `chainable()` hands back a fresh jest.fn on every property access, so the values written by
   * `.values()`/`.set()` can't be read back from it. These capturing variants record them while
   * still supporting the awaited chains the service builds.
   */
  const buildInsertMock = () =>
    jest.fn(() => {
      const chain: InsertChain = {
        values: jest.fn((rows: unknown) => {
          insertedValues.push(rows);
          return chain;
        }),
        returning: jest.fn().mockResolvedValue([{ id: 'new-user-id' }]),
        then: (resolve) => resolve(undefined),
      };
      return chain;
    });

  const buildUpdateMock = () =>
    jest.fn(() => {
      const chain: UpdateChain = {
        set: jest.fn((row: unknown) => {
          updatedValues.push(row);
          return chain;
        }),
        where: jest.fn(() => chain),
        then: (resolve) => resolve(undefined),
      };
      return chain;
    });

  const buildReqDto = (
    overrides: Partial<GetUsersReqDto> = {},
  ): GetUsersReqDto => Object.assign(new GetUsersReqDto(), overrides);

  beforeEach(async () => {
    insertedValues = [];
    updatedValues = [];

    // FileResDto.url is minted by a module-level resolver that FilesModule installs at bootstrap;
    // stub it so avatar mapping doesn't throw "resolver not initialised" in unit tests.
    setFileUrlResolver((fileId) => `/api/files/${fileId}/download?sig=test`);

    mockDb = {
      query: {
        users: {
          findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]),
          findFirst: jest.fn(),
        },
        credentials: { findFirst: jest.fn() },
        departments: { findFirst: jest.fn() },
        positions: { findFirst: jest.fn() },
        roles: { findFirst: jest.fn() },
      },
      select: chainableMock([{ total: 0 }]),
      insert: buildInsertMock(),
      update: buildUpdateMock(),
    };
    mockPermissionsService = {
      invalidateCredential: jest.fn(),
      invalidateRole: jest.fn(),
      // Default actor holds `roles:update` — every role-assignment path checks it first
      // (`ensureActorMayManageRoles`). Override per test to exercise E033/E034.
      getPermissionCodes: jest.fn().mockResolvedValue(['roles:update']),
    };
    mockFilesService = {
      upload: jest.fn(),
      linkFiles: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: PermissionsService, useValue: mockPermissionsService },
        { provide: FilesService, useValue: mockFilesService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUsers', () => {
    it('returns a paginated list without a keyword filter', async () => {
      await service.getUsers(buildReqDto());

      const callArgs = mockDb.query.users.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeUndefined();
      expect(callArgs.with).toEqual({
        department: true,
        position: true,
        credential: { with: { role: true } },
        avatarFile: true,
      });
    });

    it('builds a keyword filter when q is provided', async () => {
      await service.getUsers(buildReqDto({ q: 'nguyen' }));

      const callArgs = mockDb.query.users.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });
  });

  describe('getCurrentUser', () => {
    const buildRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'cred-1',
      username: 'superadmin',
      email: 'admin@example.com',
      fullName: 'Nguyen Van A',
      avatarFile: {
        id: 'file-1',
        originalName: 'avatar.png',
        mimetype: 'image/png',
        size: 1024,
        type: 'USER_AVATAR',
        kind: 'IMAGE',
        createdAt: new Date('2026-01-01'),
      },
      role: { id: 'role-1', code: 'ADMIN', name: 'Administrator' },
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    });

    it('returns the mapped credential with fullName, avatar and role from the joined row', async () => {
      mockDb.select.mockReturnValueOnce(chainable([buildRow()]));
      mockPermissionsService.getPermissionCodes.mockResolvedValue([]);

      const result = await service.getCurrentUser('cred-1');

      expect(result.fullName).toBe('Nguyen Van A');
      expect(result.role).toMatchObject({ code: 'ADMIN' });
      expect(result.avatar).toMatchObject({ id: 'file-1' });
      expect(result.avatar?.url).toContain('file-1');
    });

    it('leaves fullName null when the credential has no linked user', async () => {
      mockDb.select.mockReturnValueOnce(
        chainable([buildRow({ fullName: null })]),
      );
      mockPermissionsService.getPermissionCodes.mockResolvedValue([]);

      const result = await service.getCurrentUser('cred-1');

      expect(result.fullName).toBeNull();
    });

    it('collapses an all-null joined role into null', async () => {
      mockDb.select.mockReturnValueOnce(
        chainable([buildRow({ role: { id: null, code: null, name: null } })]),
      );
      mockPermissionsService.getPermissionCodes.mockResolvedValue([]);

      const result = await service.getCurrentUser('cred-1');

      expect(result.role).toBeNull();
    });

    it('collapses an all-null joined avatar file into null', async () => {
      mockDb.select.mockReturnValueOnce(
        chainable([
          buildRow({
            avatarFile: {
              id: null,
              originalName: null,
              mimetype: null,
              size: null,
              type: null,
              kind: null,
              createdAt: null,
            },
          }),
        ]),
      );
      mockPermissionsService.getPermissionCodes.mockResolvedValue([]);

      const result = await service.getCurrentUser('cred-1');

      expect(result.avatar).toBeNull();
    });

    it('throws E002 not found when the credential does not exist', async () => {
      mockDb.select.mockReturnValueOnce(chainable([]));

      await expect(service.getCurrentUser('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E002 },
      });
    });
  });

  describe('createUser', () => {
    const reqDto: CreateUserReqDto = Object.assign(new CreateUserReqDto(), {
      fullName: 'Nguyễn Văn A',
      gender: 'MALE',
      departmentId: 'dept-1',
      positionId: 'pos-1',
      hireDate: new Date('2026-01-01'),
    });

    it('creates a user without a credential', async () => {
      mockDb.query.departments.findFirst.mockResolvedValue({ id: 'dept-1' });
      mockDb.query.positions.findFirst.mockResolvedValue({
        id: 'pos-1',
        departmentId: 'dept-1',
      });
      mockDb.query.users.findFirst.mockResolvedValue({ id: 'new-user-id' });

      const result = await service.createUser(reqDto, 'creator-1');

      expect(mockDb.insert).toHaveBeenCalledTimes(1); // user only, no credential
      expect(result).toBeDefined();
    });

    it('creates the ERP credential first when requested', async () => {
      mockDb.query.departments.findFirst.mockResolvedValue({ id: 'dept-1' });
      mockDb.query.positions.findFirst.mockResolvedValue({
        id: 'pos-1',
        departmentId: 'dept-1',
      });
      mockDb.query.credentials.findFirst.mockResolvedValue(undefined);
      mockDb.query.users.findFirst.mockResolvedValue({ id: 'new-user-id' });

      await service.createUser(
        Object.assign(new CreateUserReqDto(), reqDto, {
          credential: {
            username: 'nguyenvana',
            email: 'a@example.com',
            password: 'Passw0rd!',
          },
        }),
        'creator-1',
      );

      expect(mockDb.insert).toHaveBeenCalledTimes(2); // credential + user
    });

    it('throws E001 when the credential username is already taken', async () => {
      mockDb.query.departments.findFirst.mockResolvedValue({ id: 'dept-1' });
      mockDb.query.positions.findFirst.mockResolvedValue({
        id: 'pos-1',
        departmentId: 'dept-1',
      });
      // Username and email uniqueness are checked concurrently via Promise.all, in this call
      // order — resolve email's check clean so only the username conflict (E001) can surface.
      mockDb.query.credentials.findFirst
        .mockResolvedValueOnce({ id: 'other-cred' }) // validateCredentialUsernameUniqueness
        .mockResolvedValueOnce(undefined); // validateCredentialEmailUniqueness

      await expect(
        service.createUser(
          Object.assign(new CreateUserReqDto(), reqDto, {
            credential: {
              username: 'taken',
              email: 'a@example.com',
              password: 'Passw0rd!',
            },
          }),
          'creator-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E001 },
      });
    });

    it('throws E013 when idNumber is already taken', async () => {
      mockDb.query.departments.findFirst.mockResolvedValue({ id: 'dept-1' });
      mockDb.query.positions.findFirst.mockResolvedValue({
        id: 'pos-1',
        departmentId: 'dept-1',
      });
      mockDb.query.users.findFirst.mockResolvedValue({ id: 'other-user' });

      await expect(
        service.createUser(
          Object.assign(new CreateUserReqDto(), reqDto, {
            idNumber: '001234567890',
          }),
          'creator-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E013 },
      });
    });

    it('throws E014 when departmentId does not reference an existing department', async () => {
      // ensureDepartmentExists/ensurePositionInDepartment run concurrently via Promise.all —
      // position must resolve successfully (and match) so E014 (not a race with E015/E064) is
      // the one that surfaces.
      mockDb.query.departments.findFirst.mockResolvedValue(undefined);
      mockDb.query.positions.findFirst.mockResolvedValue({
        id: 'pos-1',
        departmentId: 'dept-1',
      });

      await expect(
        service.createUser(reqDto, 'creator-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E014 },
      });
    });

    it('throws E015 when positionId does not reference an existing position', async () => {
      mockDb.query.departments.findFirst.mockResolvedValue({ id: 'dept-1' });
      mockDb.query.positions.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createUser(reqDto, 'creator-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E015 },
      });
    });

    it('throws E064 when positionId does not belong to departmentId', async () => {
      mockDb.query.departments.findFirst.mockResolvedValue({ id: 'dept-1' });
      mockDb.query.positions.findFirst.mockResolvedValue({
        id: 'pos-1',
        departmentId: 'other-dept',
      });

      await expect(
        service.createUser(reqDto, 'creator-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: { errorCode: ErrorCode.E064 },
      });
    });

    it('validates avatarFileId via FilesService when provided', async () => {
      mockDb.query.departments.findFirst.mockResolvedValue({ id: 'dept-1' });
      mockDb.query.positions.findFirst.mockResolvedValue({
        id: 'pos-1',
        departmentId: 'dept-1',
      });
      mockDb.query.users.findFirst.mockResolvedValue({ id: 'new-user-id' });

      await service.createUser(
        Object.assign(new CreateUserReqDto(), reqDto, {
          avatarFileId: 'file-1',
        }),
        'creator-1',
      );

      expect(mockFilesService.linkFiles).toHaveBeenCalledWith(['file-1']);
    });

    it('propagates E042 when avatarFileId does not reference an existing file', async () => {
      mockDb.query.departments.findFirst.mockResolvedValue({ id: 'dept-1' });
      mockDb.query.positions.findFirst.mockResolvedValue({
        id: 'pos-1',
        departmentId: 'dept-1',
      });
      mockFilesService.linkFiles.mockRejectedValue(
        Object.assign(new Error(), {
          status: HttpStatus.NOT_FOUND,
          response: { errorCode: ErrorCode.E042 },
        }),
      );

      await expect(
        service.createUser(
          Object.assign(new CreateUserReqDto(), reqDto, {
            avatarFileId: 'missing-file',
          }),
          'creator-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E042 },
      });
    });
  });

  describe('createUser role assignment', () => {
    const baseDto: CreateUserReqDto = Object.assign(new CreateUserReqDto(), {
      fullName: 'Nguyễn Văn A',
      gender: 'MALE',
      departmentId: 'dept-1',
      positionId: 'pos-1',
      hireDate: new Date('2026-01-01'),
    });

    const withCredential = (roleId?: string) =>
      Object.assign(new CreateUserReqDto(), baseDto, {
        credential: {
          username: 'nguyenvana',
          email: 'a@example.com',
          password: 'Passw0rd!',
          roleId,
        },
      });

    const arrangeHappyPath = () => {
      mockDb.query.departments.findFirst.mockResolvedValue({ id: 'dept-1' });
      mockDb.query.positions.findFirst.mockResolvedValue({
        id: 'pos-1',
        departmentId: 'dept-1',
      });
      mockDb.query.credentials.findFirst.mockResolvedValue(undefined);
      mockDb.query.users.findFirst.mockResolvedValue({ id: 'new-user-id' });
    };

    it('writes roleId onto the credential it provisions', async () => {
      arrangeHappyPath();
      mockDb.query.roles.findFirst.mockResolvedValue({
        id: 'role-1',
        permissions: ['products:read'],
      });

      await service.createUser(withCredential('role-1'), 'actor-cred');

      // insert order is credential first, then the user row.
      expect(insertedRow(0)).toMatchObject({
        username: 'nguyenvana',
        roleId: 'role-1',
      });
      // The nested `credential` object must never reach the `users` insert.
      expect(insertedRow(1)).not.toHaveProperty('credential');
      expect(insertedRow(1)).toMatchObject({ createdBy: 'actor-cred' });
    });

    it('leaves roleId undefined on the credential when none is sent', async () => {
      arrangeHappyPath();

      await service.createUser(withCredential(), 'actor-cred');

      expect(insertedRow(0)).toMatchObject({ roleId: undefined });
      expect(mockDb.query.roles.findFirst).not.toHaveBeenCalled();
      expect(mockPermissionsService.getPermissionCodes).not.toHaveBeenCalled();
    });

    it('throws E033 when the actor lacks roles:update', async () => {
      arrangeHappyPath();
      mockPermissionsService.getPermissionCodes.mockResolvedValue([
        'users:create',
      ]);

      await expect(
        service.createUser(withCredential('role-1'), 'actor-cred'),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: { errorCode: ErrorCode.E033 },
      });
      // Nothing may be written once the permission check fails.
      expect(insertedValues).toHaveLength(0);
    });

    it('accepts an actor holding system:manage instead of roles:update', async () => {
      arrangeHappyPath();
      mockPermissionsService.getPermissionCodes.mockResolvedValue([
        'system:manage',
      ]);
      mockDb.query.roles.findFirst.mockResolvedValue({
        id: 'role-1',
        permissions: ['system:manage'],
      });

      await service.createUser(withCredential('role-1'), 'actor-cred');

      expect(insertedRow(0)).toMatchObject({ roleId: 'role-1' });
    });

    it('throws E027 when the role does not exist', async () => {
      arrangeHappyPath();
      mockDb.query.roles.findFirst.mockResolvedValue(undefined);

      await expect(
        service.createUser(withCredential('ghost-role'), 'actor-cred'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E027 },
      });
      expect(insertedValues).toHaveLength(0);
    });

    it('throws E034 when a non-super actor grants a role carrying system:manage', async () => {
      arrangeHappyPath();
      mockDb.query.roles.findFirst.mockResolvedValue({
        id: 'role-1',
        permissions: ['system:manage'],
      });

      await expect(
        service.createUser(withCredential('role-1'), 'actor-cred'),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: { errorCode: ErrorCode.E034 },
      });
      expect(insertedValues).toHaveLength(0);
    });
  });

  describe('updateUser role assignment', () => {
    const roleDto = () =>
      Object.assign(new UpdateUserReqDto(), { roleId: 'role-1' });

    const arrangeUser = (credentialId: string | null) => {
      mockDb.query.users.findFirst
        .mockResolvedValueOnce({
          id: 'user-1',
          departmentId: 'dept-1',
          positionId: 'pos-1',
          credentialId,
        }) // ensureUserExists
        .mockResolvedValueOnce({ id: 'user-1' }); // getUserDetail
    };

    it('writes the role onto the credential and invalidates its cache', async () => {
      arrangeUser('cred-1');
      mockDb.query.roles.findFirst.mockResolvedValue({
        id: 'role-1',
        permissions: ['products:read'],
      });

      await service.updateUser('user-1', roleDto(), 'actor-cred');

      // Two updates: the users row, then the credentials row.
      expect(mockDb.update).toHaveBeenCalledTimes(2);
      expect(updatedRow(1)).toEqual({ roleId: 'role-1' });
      expect(mockPermissionsService.invalidateCredential).toHaveBeenCalledWith(
        'cred-1',
      );
    });

    // `roleId` has no column on `users`; it must be peeled off before the spread, and the
    // always-present `updatedAt` is what keeps that now-empty `.set()` from throwing a 500.
    it('keeps the users UPDATE valid and roleId-free when roleId is the only field sent', async () => {
      arrangeUser('cred-1');
      mockDb.query.roles.findFirst.mockResolvedValue({
        id: 'role-1',
        permissions: [],
      });

      await expect(
        service.updateUser('user-1', roleDto(), 'actor-cred'),
      ).resolves.toBeDefined();

      // `roleId` must not reach the users UPDATE, and `updatedAt` must — it is the only defined
      // value left, and what keeps drizzle from throwing "No values to set" (a 500).
      // Every other DTO key is present-but-`undefined` (class fields are defined on construction)
      // and drizzle drops those, so assert on values rather than on `Object.keys`.
      expect(updatedRow(0).roleId).toBeUndefined();
      expect(updatedRow(0).updatedAt).toBeInstanceOf(Date);
    });

    it('throws E032 when the user has no linked credential', async () => {
      arrangeUser(null);

      await expect(
        service.updateUser('user-1', roleDto(), 'actor-cred'),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: { errorCode: ErrorCode.E032 },
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('throws E033 when the actor lacks roles:update', async () => {
      arrangeUser('cred-1');
      mockPermissionsService.getPermissionCodes.mockResolvedValue([
        'users:update',
      ]);

      await expect(
        service.updateUser('user-1', roleDto(), 'actor-cred'),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: { errorCode: ErrorCode.E033 },
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('throws E027 when the role does not exist', async () => {
      arrangeUser('cred-1');
      mockDb.query.roles.findFirst.mockResolvedValue(undefined);

      await expect(
        service.updateUser('user-1', roleDto(), 'actor-cred'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E027 },
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('throws E034 when a non-super actor grants a role carrying system:manage', async () => {
      arrangeUser('cred-1');
      mockDb.query.roles.findFirst.mockResolvedValue({
        id: 'role-1',
        permissions: ['system:manage'],
      });

      await expect(
        service.updateUser('user-1', roleDto(), 'actor-cred'),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: { errorCode: ErrorCode.E034 },
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    // The whole point of the conditional check: a plain profile PATCH must not require
    // `roles:update`, nor touch the credential at all.
    it('never checks role permissions when roleId is omitted', async () => {
      arrangeUser('cred-1');

      await service.updateUser(
        'user-1',
        Object.assign(new UpdateUserReqDto(), { fullName: 'Tên mới' }),
        'actor-cred',
      );

      expect(mockPermissionsService.getPermissionCodes).not.toHaveBeenCalled();
      expect(mockDb.query.roles.findFirst).not.toHaveBeenCalled();
      expect(
        mockPermissionsService.invalidateCredential,
      ).not.toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateUser', () => {
    it('throws E012 when the user does not exist', async () => {
      mockDb.query.users.findFirst.mockResolvedValue(undefined);

      await expect(
        service.updateUser('missing', new UpdateUserReqDto(), 'actor-cred'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E012 },
      });
    });

    it('updates the user profile', async () => {
      mockDb.query.users.findFirst.mockResolvedValue({ id: 'user-1' });

      await service.updateUser(
        'user-1',
        Object.assign(new UpdateUserReqDto(), { fullName: 'Tên mới' }),
        'actor-cred',
      );

      expect(mockDb.update).toHaveBeenCalled();
    });

    it("throws E064 when a new positionId does not belong to the user's current department", async () => {
      mockDb.query.users.findFirst.mockResolvedValue({
        id: 'user-1',
        departmentId: 'dept-1',
        positionId: 'pos-old',
      });
      mockDb.query.positions.findFirst.mockResolvedValue({
        id: 'pos-new',
        departmentId: 'other-dept',
      });

      await expect(
        service.updateUser(
          'user-1',
          Object.assign(new UpdateUserReqDto(), { positionId: 'pos-new' }),
          'actor-cred',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: { errorCode: ErrorCode.E064 },
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("throws E064 when only departmentId changes and the user's current position does not belong to it", async () => {
      mockDb.query.users.findFirst.mockResolvedValue({
        id: 'user-1',
        departmentId: 'dept-1',
        positionId: 'pos-1',
      });
      mockDb.query.departments.findFirst.mockResolvedValue({ id: 'dept-2' });
      // pos-1 still belongs to the OLD department (dept-1) — mismatched against the new dept-2.
      mockDb.query.positions.findFirst.mockResolvedValue({
        id: 'pos-1',
        departmentId: 'dept-1',
      });

      await expect(
        service.updateUser(
          'user-1',
          Object.assign(new UpdateUserReqDto(), { departmentId: 'dept-2' }),
          'actor-cred',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: { errorCode: ErrorCode.E064 },
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('succeeds when departmentId and positionId are sent together and match', async () => {
      mockDb.query.users.findFirst
        .mockResolvedValueOnce({
          id: 'user-1',
          departmentId: 'dept-1',
          positionId: 'pos-1',
        }) // ensureUserExists
        .mockResolvedValueOnce({ id: 'user-1' }); // getUserDetail
      mockDb.query.departments.findFirst.mockResolvedValue({ id: 'dept-2' });
      mockDb.query.positions.findFirst.mockResolvedValue({
        id: 'pos-2',
        departmentId: 'dept-2',
      });

      await service.updateUser(
        'user-1',
        Object.assign(new UpdateUserReqDto(), {
          departmentId: 'dept-2',
          positionId: 'pos-2',
        }),
        'actor-cred',
      );

      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('assignRole', () => {
    const reqDto: AssignRoleReqDto = Object.assign(new AssignRoleReqDto(), {
      roleId: 'role-1',
    });

    it('assigns the role to the user credential and invalidates its cache', async () => {
      mockDb.query.users.findFirst
        .mockResolvedValueOnce({ id: 'user-1', credentialId: 'cred-1' }) // lookup
        .mockResolvedValueOnce({ id: 'user-1' }); // getUserDetail
      mockDb.query.roles.findFirst.mockResolvedValue({
        id: 'role-1',
        permissions: [],
      });

      await service.assignRole('user-1', reqDto, 'actor-cred');

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockPermissionsService.invalidateCredential).toHaveBeenCalledWith(
        'cred-1',
      );
    });

    it('throws E012 when the user does not exist', async () => {
      mockDb.query.users.findFirst.mockResolvedValue(undefined);

      await expect(
        service.assignRole('missing', reqDto, 'actor-cred'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E012 },
      });
    });

    it('throws E032 when the user has no linked credential', async () => {
      mockDb.query.users.findFirst.mockResolvedValue({
        id: 'user-1',
        credentialId: null,
      });

      await expect(
        service.assignRole('user-1', reqDto, 'actor-cred'),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: { errorCode: ErrorCode.E032 },
      });
    });

    it('throws E027 when the role does not exist', async () => {
      mockDb.query.users.findFirst.mockResolvedValue({
        id: 'user-1',
        credentialId: 'cred-1',
      });
      mockDb.query.roles.findFirst.mockResolvedValue(undefined);

      await expect(
        service.assignRole('user-1', reqDto, 'actor-cred'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E027 },
      });
    });

    it('throws E034 when a non-super actor assigns a role granting system:manage', async () => {
      mockDb.query.users.findFirst.mockResolvedValue({
        id: 'user-1',
        credentialId: 'cred-1',
      });
      mockDb.query.roles.findFirst.mockResolvedValue({
        id: 'role-1',
        permissions: ['system:manage'],
      });
      mockPermissionsService.getPermissionCodes.mockResolvedValue([
        'roles:update',
      ]);

      await expect(
        service.assignRole('user-1', reqDto, 'actor-cred'),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: { errorCode: ErrorCode.E034 },
      });
    });

    // Redundant in production — the route already carries `@Permissions('roles:update')` — but
    // asserted so all three assignment paths stay identical if the decorator ever moves.
    it('throws E033 when the actor lacks roles:update', async () => {
      mockDb.query.users.findFirst.mockResolvedValue({
        id: 'user-1',
        credentialId: 'cred-1',
      });
      mockPermissionsService.getPermissionCodes.mockResolvedValue([
        'users:update',
      ]);

      await expect(
        service.assignRole('user-1', reqDto, 'actor-cred'),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: { errorCode: ErrorCode.E033 },
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe('updateUser', () => {
    // Was a 500: `.set()` with every value `undefined` throws a bare "No values to set". The
    // always-written `updated_at` is what makes an empty PATCH a harmless no-op instead.
    it('handles an empty PATCH body without throwing', async () => {
      mockDb.query.users.findFirst
        .mockResolvedValueOnce({ id: 'user-1' }) // ensureUserExists
        .mockResolvedValueOnce({ id: 'user-1' }); // getUserDetail

      await expect(
        service.updateUser('user-1', new UpdateUserReqDto(), 'actor-cred'),
      ).resolves.toBeDefined();
      expect(mockDb.update).toHaveBeenCalled();
    });

    // Guards the `if (reqDto.departmentId || reqDto.positionId)` short-circuit: a PATCH touching
    // neither field must skip the department/position re-validation entirely, not just no-op it.
    it('skips department/position re-validation when neither field is sent', async () => {
      mockDb.query.users.findFirst
        .mockResolvedValueOnce({ id: 'user-1' }) // ensureUserExists
        .mockResolvedValueOnce({ id: 'user-1' }); // getUserDetail

      await service.updateUser(
        'user-1',
        Object.assign(new UpdateUserReqDto(), { fullName: 'Tên mới' }),
        'actor-cred',
      );

      expect(mockDb.query.departments.findFirst).not.toHaveBeenCalled();
      expect(mockDb.query.positions.findFirst).not.toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('updateUser avatar linking', () => {
    it('validates avatarFileId through the files registry before writing', async () => {
      mockDb.query.users.findFirst
        .mockResolvedValueOnce({ id: 'user-1' }) // ensureUserExists
        .mockResolvedValueOnce({ id: 'user-1' }); // getUserDetail

      await service.updateUser(
        'user-1',
        Object.assign(new UpdateUserReqDto(), { avatarFileId: 'file-1' }),
        'actor-cred',
      );

      expect(mockFilesService.linkFiles).toHaveBeenCalledWith(['file-1']);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('propagates E042 and never writes when the avatar file is unknown', async () => {
      mockDb.query.users.findFirst.mockResolvedValue({ id: 'user-1' });
      mockFilesService.linkFiles.mockRejectedValue(
        new AppException(ErrorCode.E042, HttpStatus.NOT_FOUND),
      );

      await expect(
        service.updateUser(
          'user-1',
          Object.assign(new UpdateUserReqDto(), { avatarFileId: 'ghost' }),
          'actor-cred',
        ),
      ).rejects.toMatchObject({ response: { errorCode: ErrorCode.E042 } });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('does not touch the files registry when avatarFileId is omitted', async () => {
      mockDb.query.users.findFirst
        .mockResolvedValueOnce({ id: 'user-1' })
        .mockResolvedValueOnce({ id: 'user-1' });

      await service.updateUser(
        'user-1',
        Object.assign(new UpdateUserReqDto(), { fullName: 'A' }),
        'actor-cred',
      );

      expect(mockFilesService.linkFiles).not.toHaveBeenCalled();
    });
  });
});
