import { Test, TestingModule } from '@nestjs/testing';

import { GetUnitsReqDto } from './dto/get-units.req.dto';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

describe('UnitsController', () => {
  let controller: UnitsController;
  let mockService: { getUnits: jest.Mock };

  beforeEach(async () => {
    mockService = { getUnits: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UnitsController],
      providers: [{ provide: UnitsService, useValue: mockService }],
    }).compile();

    controller = module.get<UnitsController>(UnitsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUnits', () => {
    it('delegates to UnitsService.getUnits', async () => {
      const reqDto = new GetUnitsReqDto();
      const expected = [{ id: '1', code: 'KG', name: 'Kilogram' }];
      mockService.getUnits.mockResolvedValue(expected);

      const result = await controller.getUnits(reqDto);

      expect(mockService.getUnits).toHaveBeenCalledWith(reqDto);
      expect(result).toBe(expected);
    });
  });
});
