import { Test, TestingModule } from '@nestjs/testing';

import { BomsController } from './boms.controller';
import { BomsService } from './boms.service';

describe('BomsController', () => {
  let controller: BomsController;
  let mockService: {
    getBomTree: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      getBomTree: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BomsController],
      providers: [{ provide: BomsService, useValue: mockService }],
    }).compile();

    controller = module.get<BomsController>(BomsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getBom delegates to BomsService.getBomTree', async () => {
    const expected = [{ id: 'a' }];
    mockService.getBomTree.mockResolvedValue(expected);

    const result = await controller.getBom('p1', 'rev-1');

    expect(mockService.getBomTree).toHaveBeenCalledWith('p1', 'rev-1');
    expect(result).toBe(expected);
  });
});
