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
    getPermissionCatalog: jest.Mock;
    getRoleDetail: jest.Mock;
    createRole: jest.Mock;
    updateRole: jest.Mock;
    deleteRole: jest.Mock;
  };

  const payload = { sub: 'actor-cred' } as JwtPayloadType;

  beforeEach(async () => {
    mockService = {
      getRoles: jest.fn(),
      getPermissionCatalog: jest.fn(),
      getRoleDetail: jest.fn(),
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
    const expected = { data: [], pagination: {} };
    mockService.getRoles.mockResolvedValue(expected);

    const result = await controller.getRoles(reqDto);

    expect(mockService.getRoles).toHaveBeenCalledWith(reqDto);
    expect(result).toBe(expected);
  });

  it('getPermissionCatalog delegates to RolesService.getPermissionCatalog', () => {
    const expected = [{ resource: 'clients', permissions: [] }];
    mockService.getPermissionCatalog.mockReturnValue(expected);

    const result = controller.getPermissionCatalog();

    expect(mockService.getPermissionCatalog).toHaveBeenCalled();
    expect(result).toBe(expected);
  });

  it('getRoleDetail delegates to RolesService.getRoleDetail', async () => {
    const expected = { id: 'role-1' };
    mockService.getRoleDetail.mockResolvedValue(expected);

    const result = await controller.getRoleDetail('role-1');

    expect(mockService.getRoleDetail).toHaveBeenCalledWith('role-1');
    expect(result).toBe(expected);
  });

  it('createRole delegates to RolesService.createRole', async () => {
    const reqDto = new CreateRoleReqDto();
    const expected = { id: 'role-1' };
    mockService.createRole.mockResolvedValue(expected);

    const result = await controller.createRole(reqDto, payload);

    expect(mockService.createRole).toHaveBeenCalledWith(reqDto, payload.sub);
    expect(result).toBe(expected);
  });

  it('updateRole delegates to RolesService.updateRole', async () => {
    const reqDto = new UpdateRoleReqDto();
    const expected = { id: 'role-1' };
    mockService.updateRole.mockResolvedValue(expected);

    const result = await controller.updateRole('role-1', reqDto, payload);

    expect(mockService.updateRole).toHaveBeenCalledWith('role-1', reqDto, payload.sub);
    expect(result).toBe(expected);
  });

  it('deleteRole delegates to RolesService.deleteRole', async () => {
    mockService.deleteRole.mockResolvedValue(undefined);

    await controller.deleteRole('role-1');

    expect(mockService.deleteRole).toHaveBeenCalledWith('role-1');
  });
});
