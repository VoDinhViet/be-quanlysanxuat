import { Test, TestingModule } from '@nestjs/testing';

import { GetRolesReqDto } from './dto/get-roles.req.dto';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

describe('RolesController', () => {
  let controller: RolesController;
  let mockService: {
    getRoles: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      getRoles: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [{ provide: RolesService, useValue: mockService }],
    }).compile();

    controller = module.get<RolesController>(RolesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getRoles delegates to RolesService.getRoles', async () => {
    const reqDto = new GetRolesReqDto();
    const expected = [{ id: 'role-1' }];
    mockService.getRoles.mockResolvedValue(expected);

    const result = await controller.getRoles(reqDto);

    expect(mockService.getRoles).toHaveBeenCalledWith(reqDto);
    expect(result).toBe(expected);
  });
});
