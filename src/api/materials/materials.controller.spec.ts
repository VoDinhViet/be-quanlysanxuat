import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateMaterialReqDto } from './dto/create-material.req.dto';
import { GetMaterialsReqDto } from './dto/get-materials.req.dto';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

describe('MaterialsController', () => {
  let controller: MaterialsController;
  let mockService: { getMaterials: jest.Mock; createMaterial: jest.Mock };

  const payload = { sub: 'credential-id' } as JwtPayloadType;

  beforeEach(async () => {
    mockService = { getMaterials: jest.fn(), createMaterial: jest.fn() };

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

  describe('getMaterials', () => {
    it('delegates to MaterialsService.getMaterials', async () => {
      const reqDto = new GetMaterialsReqDto();
      const expected = { data: [], pagination: {} };
      mockService.getMaterials.mockResolvedValue(expected);

      const result = await controller.getMaterials(reqDto);

      expect(mockService.getMaterials).toHaveBeenCalledWith(reqDto);
      expect(result).toBe(expected);
    });
  });

  describe('createMaterial', () => {
    it('passes the current credential id through as the creator', async () => {
      const reqDto = new CreateMaterialReqDto();
      const expected = { id: 'material-id' };
      mockService.createMaterial.mockResolvedValue(expected);

      const result = await controller.createMaterial(reqDto, payload);

      expect(mockService.createMaterial).toHaveBeenCalledWith(
        reqDto,
        'credential-id',
      );
      expect(result).toBe(expected);
    });
  });
});
