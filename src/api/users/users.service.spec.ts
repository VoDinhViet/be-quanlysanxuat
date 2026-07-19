import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import { chainableMock, QueryMockArgs } from '../../test-utils/chainable-mock.util';
import { PermissionsService } from '../auth/permissions.service';
import { AssignRoleReqDto } from './dto/assign-role.req.dto';
import { CreateUserReqDto } from './dto/create-user.req.dto';
import { GetUsersReqDto } from './dto/get-users.req.dto';
import { UpdateUserReqDto } from './dto/update-user.req.dto';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let mockDb: {
    query: {
      users: { findMany: jest.Mock<any, [QueryMockArgs]>; findFirst: jest.Mock };
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

  const buildReqDto = (overrides: Partial<GetUsersReqDto> = {}): GetUsersReqDto =>
    Object.assign(new GetUsersReqDto(), overrides);

  beforeEach(async () => {
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
      insert: chainableMock([{ id: 'new-user-id' }]),
      update: chainableMock(undefined),
    };
    mockPermissionsService = {
      invalidateCredential: jest.fn(),
      invalidateRole: jest.fn(),
      getPermissionCodes: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: PermissionsService, useValue: mockPermissionsService },
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
      expect(callArgs.with).toEqual({ department: true, position: true, credential: true });
    });

    it('builds a keyword filter when q is provided', async () => {
      await service.getUsers(buildReqDto({ q: 'nguyen' }));

      const callArgs = mockDb.query.users.findMany.mock.calls[0][0];
      expect(callArgs.where).toBeDefined();
    });
  });

  describe('getCredentialDetail', () => {
    it('returns the mapped credential when found', async () => {
      mockDb.query.credentials.findFirst.mockResolvedValue({
        id: 'cred-1',
        username: 'superadmin',
      });

      const result = await service.getCredentialDetail('cred-1');

      expect(result).toBeDefined();
    });

    it('throws E002 not found when the credential does not exist', async () => {
      mockDb.query.credentials.findFirst.mockResolvedValue(undefined);

      await expect(service.getCredentialDetail('missing')).rejects.toMatchObject({
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
      mockDb.query.positions.findFirst.mockResolvedValue({ id: 'pos-1' });
      mockDb.query.users.findFirst.mockResolvedValue({ id: 'new-user-id' });

      const result = await service.createUser(reqDto, 'creator-1');

      expect(mockDb.insert).toHaveBeenCalledTimes(1); // user only, no credential
      expect(result).toBeDefined();
    });

    it('creates the ERP credential first when requested', async () => {
      mockDb.query.departments.findFirst.mockResolvedValue({ id: 'dept-1' });
      mockDb.query.positions.findFirst.mockResolvedValue({ id: 'pos-1' });
      mockDb.query.credentials.findFirst.mockResolvedValue(undefined);
      mockDb.query.users.findFirst.mockResolvedValue({ id: 'new-user-id' });

      await service.createUser(
        Object.assign(new CreateUserReqDto(), reqDto, {
          credential: { username: 'nguyenvana', email: 'a@example.com', password: 'Passw0rd!' },
        }),
        'creator-1',
      );

      expect(mockDb.insert).toHaveBeenCalledTimes(2); // credential + user
    });

    it('throws E001 when the credential username is already taken', async () => {
      mockDb.query.departments.findFirst.mockResolvedValue({ id: 'dept-1' });
      mockDb.query.positions.findFirst.mockResolvedValue({ id: 'pos-1' });
      // Username and email uniqueness are checked concurrently via Promise.all, in this call
      // order — resolve email's check clean so only the username conflict (E001) can surface.
      mockDb.query.credentials.findFirst
        .mockResolvedValueOnce({ id: 'other-cred' }) // validateCredentialUsernameUniqueness
        .mockResolvedValueOnce(undefined); // validateCredentialEmailUniqueness

      await expect(
        service.createUser(
          Object.assign(new CreateUserReqDto(), reqDto, {
            credential: { username: 'taken', email: 'a@example.com', password: 'Passw0rd!' },
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
      mockDb.query.positions.findFirst.mockResolvedValue({ id: 'pos-1' });
      mockDb.query.users.findFirst.mockResolvedValue({ id: 'other-user' });

      await expect(
        service.createUser(
          Object.assign(new CreateUserReqDto(), reqDto, { idNumber: '001234567890' }),
          'creator-1',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: { errorCode: ErrorCode.E013 },
      });
    });

    it('throws E014 when departmentId does not reference an existing department', async () => {
      // ensureDepartmentExists/ensurePositionExists run concurrently via Promise.all — position
      // must resolve successfully so E014 (not a race with E015) is the one that surfaces.
      mockDb.query.departments.findFirst.mockResolvedValue(undefined);
      mockDb.query.positions.findFirst.mockResolvedValue({ id: 'pos-1' });

      await expect(service.createUser(reqDto, 'creator-1')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E014 },
      });
    });

    it('throws E015 when positionId does not reference an existing position', async () => {
      mockDb.query.departments.findFirst.mockResolvedValue({ id: 'dept-1' });
      mockDb.query.positions.findFirst.mockResolvedValue(undefined);

      await expect(service.createUser(reqDto, 'creator-1')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E015 },
      });
    });
  });

  describe('updateUser', () => {
    it('throws E012 when the user does not exist', async () => {
      mockDb.query.users.findFirst.mockResolvedValue(undefined);

      await expect(service.updateUser('missing', new UpdateUserReqDto())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E012 },
      });
    });

    it('updates the user profile', async () => {
      mockDb.query.users.findFirst.mockResolvedValue({ id: 'user-1' });

      await service.updateUser(
        'user-1',
        Object.assign(new UpdateUserReqDto(), { fullName: 'Tên mới' }),
      );

      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('assignRole', () => {
    const reqDto: AssignRoleReqDto = Object.assign(new AssignRoleReqDto(), { roleId: 'role-1' });

    it('assigns the role to the user credential and invalidates its cache', async () => {
      mockDb.query.users.findFirst
        .mockResolvedValueOnce({ id: 'user-1', credentialId: 'cred-1' }) // lookup
        .mockResolvedValueOnce({ id: 'user-1' }); // getUserDetail
      mockDb.query.roles.findFirst.mockResolvedValue({ id: 'role-1', permissions: [] });

      await service.assignRole('user-1', reqDto, 'actor-cred');

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockPermissionsService.invalidateCredential).toHaveBeenCalledWith('cred-1');
    });

    it('throws E012 when the user does not exist', async () => {
      mockDb.query.users.findFirst.mockResolvedValue(undefined);

      await expect(service.assignRole('missing', reqDto, 'actor-cred')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E012 },
      });
    });

    it('throws E032 when the user has no linked credential', async () => {
      mockDb.query.users.findFirst.mockResolvedValue({ id: 'user-1', credentialId: null });

      await expect(service.assignRole('user-1', reqDto, 'actor-cred')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: { errorCode: ErrorCode.E032 },
      });
    });

    it('throws E027 when the role does not exist', async () => {
      mockDb.query.users.findFirst.mockResolvedValue({ id: 'user-1', credentialId: 'cred-1' });
      mockDb.query.roles.findFirst.mockResolvedValue(undefined);

      await expect(service.assignRole('user-1', reqDto, 'actor-cred')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E027 },
      });
    });

    it('throws E034 when a non-super actor assigns a role granting system:manage', async () => {
      mockDb.query.users.findFirst.mockResolvedValue({ id: 'user-1', credentialId: 'cred-1' });
      mockDb.query.roles.findFirst.mockResolvedValue({
        id: 'role-1',
        permissions: ['system:manage'],
      });
      mockPermissionsService.getPermissionCodes.mockResolvedValue(['roles:update']);

      await expect(service.assignRole('user-1', reqDto, 'actor-cred')).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: { errorCode: ErrorCode.E034 },
      });
    });
  });

  describe('uploadUserAvatar', () => {
    it('throws E016 when no file is provided', async () => {
      mockDb.query.users.findFirst.mockResolvedValue({ id: 'user-1' });

      await expect(service.uploadUserAvatar('user-1', undefined)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: { errorCode: ErrorCode.E016 },
      });
    });

    it('throws E012 when the user does not exist', async () => {
      mockDb.query.users.findFirst.mockResolvedValue(undefined);

      await expect(
        service.uploadUserAvatar('missing', { filename: 'a.png' } as Express.Multer.File),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { errorCode: ErrorCode.E012 },
      });
    });

    it('updates avatarUrl when a file is provided', async () => {
      mockDb.query.users.findFirst.mockResolvedValue({ id: 'user-1' });

      await service.uploadUserAvatar('user-1', { filename: 'a.png' } as Express.Multer.File);

      expect(mockDb.update).toHaveBeenCalled();
    });
  });
});
