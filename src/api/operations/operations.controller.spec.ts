import { Test, TestingModule } from '@nestjs/testing';

import { GetOperationsReqDto } from './dto/get-operations.req.dto';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

describe('OperationsController', () => {
  let controller: OperationsController;
  let mockService: { getOperations: jest.Mock };

  beforeEach(async () => {
    mockService = { getOperations: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OperationsController],
      providers: [{ provide: OperationsService, useValue: mockService }],
    }).compile();

    controller = module.get<OperationsController>(OperationsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getOperations delegates to OperationsService.getOperations', async () => {
    const reqDto = new GetOperationsReqDto();
    const expected = [{ id: 'op1' }];
    mockService.getOperations.mockResolvedValue(expected);

    const result = await controller.getOperations(reqDto);

    expect(mockService.getOperations).toHaveBeenCalledWith(reqDto);
    expect(result).toBe(expected);
  });
});
