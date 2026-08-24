import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateRoleReqDto } from './dto/create-role.req.dto';
import { GetRolesReqDto } from './dto/get-roles.req.dto';
import { UpdateRoleReqDto } from './dto/update-role.req.dto';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

describe('RolesController', () => {
  let controller: RolesController;
  let mockService: {
    getRoles: jest.Mock;
    getRole: jest.Mock;
    createRole: jest.Mock;
    updateRole: jest.Mock;
    deleteRole: jest.Mock;
  };

  const payload = { sub: 'actor-cred-1' } as JwtPayloadType;

  beforeEach(async () => {
    mockService = {
      getRoles: jest.fn(),
      getRole: jest.fn(),
      createRole: jest.fn(),
      updateRole: jest.fn(),
      deleteRole: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [{ provide: RolesService, useValue: mockService }],
    }).compile();

    controller = module.get<RolesController>(RolesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getRoles delegates to RolesService.getRoles', async () => {
    const reqDto = new GetRolesReqDto();
    const expected = [{ id: 'role-1' }];
    mockService.getRoles.mockResolvedValue(expected);

    const result = await controller.getRoles(reqDto);

    expect(mockService.getRoles).toHaveBeenCalledWith(reqDto);
    expect(result).toBe(expected);
  });

  it('getRole delegates to RolesService.getRole', async () => {
    const expected = { id: 'role-1' };
    mockService.getRole.mockResolvedValue(expected);

    const result = await controller.getRole('role-1');

    expect(mockService.getRole).toHaveBeenCalledWith('role-1');
    expect(result).toBe(expected);
  });

  it('createRole delegates to RolesService.createRole with the actor credential id', async () => {
    const reqDto = new CreateRoleReqDto();

    await controller.createRole(reqDto, payload);

    expect(mockService.createRole).toHaveBeenCalledWith(reqDto, 'actor-cred-1');
  });

  it('updateRole delegates to RolesService.updateRole with the actor credential id', async () => {
    const reqDto = new UpdateRoleReqDto();

    await controller.updateRole('role-1', reqDto, payload);

    expect(mockService.updateRole).toHaveBeenCalledWith(
      'role-1',
      reqDto,
      'actor-cred-1',
    );
  });

  it('deleteRole delegates to RolesService.deleteRole', async () => {
    await controller.deleteRole('role-1');

    expect(mockService.deleteRole).toHaveBeenCalledWith('role-1');
  });
});
