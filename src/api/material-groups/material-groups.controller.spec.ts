import { Test, TestingModule } from '@nestjs/testing';

import { CreateMaterialGroupReqDto } from './dto/create-material-group.req.dto';
import { GetMaterialGroupsReqDto } from './dto/get-material-groups.req.dto';
import { UpdateMaterialGroupReqDto } from './dto/update-material-group.req.dto';
import { MaterialGroupsController } from './material-groups.controller';
import { MaterialGroupsService } from './material-groups.service';

describe('MaterialGroupsController', () => {
  let controller: MaterialGroupsController;
  let mockService: {
    getMaterialGroups: jest.Mock;
    getMaterialGroupDetail: jest.Mock;
    createMaterialGroup: jest.Mock;
    updateMaterialGroup: jest.Mock;
    deleteMaterialGroup: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      getMaterialGroups: jest.fn(),
      getMaterialGroupDetail: jest.fn(),
      createMaterialGroup: jest.fn(),
      updateMaterialGroup: jest.fn(),
      deleteMaterialGroup: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaterialGroupsController],
      providers: [{ provide: MaterialGroupsService, useValue: mockService }],
    }).compile();

    controller = module.get<MaterialGroupsController>(MaterialGroupsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getMaterialGroups delegates to the service', async () => {
    const reqDto = new GetMaterialGroupsReqDto();
    const expected = { data: [], pagination: {} };
    mockService.getMaterialGroups.mockResolvedValue(expected);

    const result = await controller.getMaterialGroups(reqDto);

    expect(mockService.getMaterialGroups).toHaveBeenCalledWith(reqDto);
    expect(result).toBe(expected);
  });

  it('getMaterialGroupDetail delegates to the service', async () => {
    const expected = { id: '1' };
    mockService.getMaterialGroupDetail.mockResolvedValue(expected);

    const result = await controller.getMaterialGroupDetail('1');

    expect(mockService.getMaterialGroupDetail).toHaveBeenCalledWith('1');
    expect(result).toBe(expected);
  });

  it('createMaterialGroup delegates to the service', async () => {
    const reqDto = new CreateMaterialGroupReqDto();
    const expected = { id: '1' };
    mockService.createMaterialGroup.mockResolvedValue(expected);

    const result = await controller.createMaterialGroup(reqDto);

    expect(mockService.createMaterialGroup).toHaveBeenCalledWith(reqDto);
    expect(result).toBe(expected);
  });

  it('updateMaterialGroup delegates to the service', async () => {
    const reqDto = new UpdateMaterialGroupReqDto();
    const expected = { id: '1' };
    mockService.updateMaterialGroup.mockResolvedValue(expected);

    const result = await controller.updateMaterialGroup('1', reqDto);

    expect(mockService.updateMaterialGroup).toHaveBeenCalledWith('1', reqDto);
    expect(result).toBe(expected);
  });

  it('deleteMaterialGroup delegates to the service', async () => {
    mockService.deleteMaterialGroup.mockResolvedValue(undefined);

    await controller.deleteMaterialGroup('1');

    expect(mockService.deleteMaterialGroup).toHaveBeenCalledWith('1');
  });
});
