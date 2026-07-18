import { Test, TestingModule } from '@nestjs/testing';

import { GetPositionsReqDto } from './dto/get-positions.req.dto';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';

describe('PositionsController', () => {
  let controller: PositionsController;
  let mockService: { getPositions: jest.Mock };

  beforeEach(async () => {
    mockService = { getPositions: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PositionsController],
      providers: [{ provide: PositionsService, useValue: mockService }],
    }).compile();

    controller = module.get<PositionsController>(PositionsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPositions', () => {
    it('delegates to PositionsService.getPositions', async () => {
      const reqDto = new GetPositionsReqDto();
      const expected = { data: [], pagination: {} };
      mockService.getPositions.mockResolvedValue(expected);

      const result = await controller.getPositions(reqDto);

      expect(mockService.getPositions).toHaveBeenCalledWith(reqDto);
      expect(result).toBe(expected);
    });
  });
});
