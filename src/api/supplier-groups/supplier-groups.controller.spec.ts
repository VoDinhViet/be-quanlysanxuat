import { Test, TestingModule } from '@nestjs/testing';

import { GetSupplierGroupsReqDto } from './dto/get-supplier-groups.req.dto';
import { SupplierGroupsController } from './supplier-groups.controller';
import { SupplierGroupsService } from './supplier-groups.service';

describe('SupplierGroupsController', () => {
  let controller: SupplierGroupsController;
  let mockService: { getSupplierGroups: jest.Mock };

  beforeEach(async () => {
    mockService = { getSupplierGroups: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SupplierGroupsController],
      providers: [{ provide: SupplierGroupsService, useValue: mockService }],
    }).compile();

    controller = module.get<SupplierGroupsController>(SupplierGroupsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSupplierGroups', () => {
    it('delegates to SupplierGroupsService.getSupplierGroups', async () => {
      const reqDto = new GetSupplierGroupsReqDto();
      const expected = { data: [], pagination: {} };
      mockService.getSupplierGroups.mockResolvedValue(expected);

      const result = await controller.getSupplierGroups(reqDto);

      expect(mockService.getSupplierGroups).toHaveBeenCalledWith(reqDto);
      expect(result).toBe(expected);
    });
  });
});
