import { Test, TestingModule } from '@nestjs/testing';

import { PageOptionsDto } from '../../common/dto/offset-pagination/page-options.dto';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateMaterialReqDto } from './dto/create-material.req.dto';
import { GetMaterialsReqDto } from './dto/get-materials.req.dto';
import { UpdateMaterialReqDto } from './dto/update-material.req.dto';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

describe('MaterialsController', () => {
  let controller: MaterialsController;
  let mockService: {
    getMaterials: jest.Mock;
    getMaterialDetail: jest.Mock;
    getMaterialLogs: jest.Mock;
    createMaterial: jest.Mock;
    updateMaterial: jest.Mock;
    deleteMaterial: jest.Mock;
  };

  const payload = { sub: 'user-1' } as JwtPayloadType;

  beforeEach(async () => {
    mockService = {
      getMaterials: jest.fn(),
      getMaterialDetail: jest.fn(),
      getMaterialLogs: jest.fn(),
      createMaterial: jest.fn(),
      updateMaterial: jest.fn(),
      deleteMaterial: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaterialsController],
      providers: [{ provide: MaterialsService, useValue: mockService }],
    }).compile();

    controller = module.get<MaterialsController>(MaterialsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getMaterials delegates to the service', async () => {
    const reqDto = new GetMaterialsReqDto();
    const expected = { data: [], pagination: {} };
    mockService.getMaterials.mockResolvedValue(expected);

    const result = await controller.getMaterials(reqDto);

    expect(mockService.getMaterials).toHaveBeenCalledWith(reqDto);
    expect(result).toBe(expected);
  });

  it('getMaterialDetail delegates to the service', async () => {
    const expected = { id: 'mat-1' };
    mockService.getMaterialDetail.mockResolvedValue(expected);

    const result = await controller.getMaterialDetail('mat-1');

    expect(mockService.getMaterialDetail).toHaveBeenCalledWith('mat-1');
    expect(result).toBe(expected);
  });

  it('getMaterialLogs delegates to the service', async () => {
    const reqDto = new PageOptionsDto();
    const expected = { data: [], pagination: {} };
    mockService.getMaterialLogs.mockResolvedValue(expected);

    const result = await controller.getMaterialLogs('mat-1', reqDto);

    expect(mockService.getMaterialLogs).toHaveBeenCalledWith('mat-1', reqDto);
    expect(result).toBe(expected);
  });

  it('createMaterial delegates with the current user id', async () => {
    const reqDto = new CreateMaterialReqDto();
    const expected = { id: 'mat-1' };
    mockService.createMaterial.mockResolvedValue(expected);

    const result = await controller.createMaterial(reqDto, payload);

    expect(mockService.createMaterial).toHaveBeenCalledWith(reqDto, payload.sub);
    expect(result).toBe(expected);
  });

  it('updateMaterial delegates with the current user id', async () => {
    const reqDto = new UpdateMaterialReqDto();
    const expected = { id: 'mat-1' };
    mockService.updateMaterial.mockResolvedValue(expected);

    const result = await controller.updateMaterial('mat-1', reqDto, payload);

    expect(mockService.updateMaterial).toHaveBeenCalledWith('mat-1', reqDto, payload.sub);
    expect(result).toBe(expected);
  });

  it('deleteMaterial delegates to the service', async () => {
    mockService.deleteMaterial.mockResolvedValue(undefined);

    await controller.deleteMaterial('mat-1');

    expect(mockService.deleteMaterial).toHaveBeenCalledWith('mat-1');
  });
});
