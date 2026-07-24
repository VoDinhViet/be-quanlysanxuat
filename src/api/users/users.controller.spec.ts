import { Test, TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { AssignRoleReqDto } from './dto/assign-role.req.dto';
import { CreateUserReqDto } from './dto/create-user.req.dto';
import { GetUsersReqDto } from './dto/get-users.req.dto';
import { UpdateUserReqDto } from './dto/update-user.req.dto';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let mockService: {
    getCurrentUser: jest.Mock;
    getUsers: jest.Mock;
    getUserDetail: jest.Mock;
    createUser: jest.Mock;
    updateUser: jest.Mock;
    assignRole: jest.Mock;
  };

  const payload = { sub: 'user-1' } as JwtPayloadType;

  beforeEach(async () => {
    mockService = {
      getCurrentUser: jest.fn(),
      getUsers: jest.fn(),
      getUserDetail: jest.fn(),
      createUser: jest.fn(),
      updateUser: jest.fn(),
      assignRole: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getCurrentUser delegates to UsersService.getCurrentUser with the current user id', async () => {
    const expected = { id: 'cred-1' };
    mockService.getCurrentUser.mockResolvedValue(expected);

    const result = await controller.getCurrentUser(payload);

    expect(mockService.getCurrentUser).toHaveBeenCalledWith(payload.sub);
    expect(result).toBe(expected);
  });

  it('getUsers delegates to UsersService.getUsers', async () => {
    const reqDto = new GetUsersReqDto();
    const expected = { data: [], pagination: {} };
    mockService.getUsers.mockResolvedValue(expected);

    const result = await controller.getUsers(reqDto);

    expect(mockService.getUsers).toHaveBeenCalledWith(reqDto);
    expect(result).toBe(expected);
  });

  it('getUserDetail delegates to UsersService.getUserDetail', async () => {
    const expected = { id: 'user-1' };
    mockService.getUserDetail.mockResolvedValue(expected);

    const result = await controller.getUserDetail('user-1');

    expect(mockService.getUserDetail).toHaveBeenCalledWith('user-1');
    expect(result).toBe(expected);
  });

  it('createUser delegates to UsersService.createUser with the current user id', async () => {
    const reqDto = new CreateUserReqDto();
    const expected = { id: 'user-1' };
    mockService.createUser.mockResolvedValue(expected);

    const result = await controller.createUser(reqDto, payload);

    expect(mockService.createUser).toHaveBeenCalledWith(reqDto, payload.sub);
    expect(result).toBe(expected);
  });

  it('updateUser delegates to UsersService.updateUser with the current user id', async () => {
    const reqDto = new UpdateUserReqDto();
    const expected = { id: 'user-1' };
    mockService.updateUser.mockResolvedValue(expected);

    const result = await controller.updateUser('user-1', reqDto, payload);

    expect(mockService.updateUser).toHaveBeenCalledWith(
      'user-1',
      reqDto,
      payload.sub,
    );
    expect(result).toBe(expected);
  });

  it('assignRole delegates to UsersService.assignRole', async () => {
    const reqDto = Object.assign(new AssignRoleReqDto(), { roleId: 'role-1' });
    const expected = { id: 'user-1' };
    mockService.assignRole.mockResolvedValue(expected);

    const result = await controller.assignRole('user-1', reqDto, payload);

    expect(mockService.assignRole).toHaveBeenCalledWith(
      'user-1',
      reqDto,
      payload.sub,
    );
    expect(result).toBe(expected);
  });
});
