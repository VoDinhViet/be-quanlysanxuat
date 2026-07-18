import { Test, TestingModule } from '@nestjs/testing';

import { GetProductGroupsReqDto } from './dto/get-product-groups.req.dto';
import { ProductGroupsController } from './product-groups.controller';
import { ProductGroupsService } from './product-groups.service';

describe('ProductGroupsController', () => {
  let controller: ProductGroupsController;
  let mockService: { getProductGroups: jest.Mock };

  beforeEach(async () => {
    mockService = { getProductGroups: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductGroupsController],
      providers: [{ provide: ProductGroupsService, useValue: mockService }],
    }).compile();

    controller = module.get<ProductGroupsController>(ProductGroupsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProductGroups', () => {
    it('delegates to ProductGroupsService.getProductGroups', async () => {
      const reqDto = new GetProductGroupsReqDto();
      const expected = { data: [], pagination: {} };
      mockService.getProductGroups.mockResolvedValue(expected);

      const result = await controller.getProductGroups(reqDto);

      expect(mockService.getProductGroups).toHaveBeenCalledWith(reqDto);
      expect(result).toBe(expected);
    });
  });
});
