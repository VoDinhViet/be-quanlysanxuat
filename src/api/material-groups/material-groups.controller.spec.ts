import { Test, TestingModule } from '@nestjs/testing';

import { GetMaterialGroupsReqDto } from './dto/get-material-groups.req.dto';
import { MaterialGroupsController } from './material-groups.controller';
import { MaterialGroupsService } from './material-groups.service';

describe('MaterialGroupsController', () => {
  let controller: MaterialGroupsController;
  let mockService: { getMaterialGroups: jest.Mock };

  beforeEach(async () => {
    mockService = { getMaterialGroups: jest.fn() };

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

  describe('getMaterialGroups', () => {
    it('delegates to MaterialGroupsService.getMaterialGroups', async () => {
      const reqDto = new GetMaterialGroupsReqDto();
      const expected = { data: [], pagination: {} };
      mockService.getMaterialGroups.mockResolvedValue(expected);

      const result = await controller.getMaterialGroups(reqDto);

      expect(mockService.getMaterialGroups).toHaveBeenCalledWith(reqDto);
      expect(result).toBe(expected);
    });
  });
});
