import { Test, TestingModule } from '@nestjs/testing';

import { ClientGroupsController } from './client-groups.controller';
import { ClientGroupsService } from './client-groups.service';
import { GetClientGroupsReqDto } from './dto/get-client-groups.req.dto';

describe('ClientGroupsController', () => {
  let controller: ClientGroupsController;
  let mockService: { getClientGroups: jest.Mock };

  beforeEach(async () => {
    mockService = { getClientGroups: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientGroupsController],
      providers: [{ provide: ClientGroupsService, useValue: mockService }],
    }).compile();

    controller = module.get<ClientGroupsController>(ClientGroupsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getClientGroups', () => {
    it('delegates to ClientGroupsService.getClientGroups', async () => {
      const reqDto = new GetClientGroupsReqDto();
      const expected = { data: [], pagination: {} };
      mockService.getClientGroups.mockResolvedValue(expected);

      const result = await controller.getClientGroups(reqDto);

      expect(mockService.getClientGroups).toHaveBeenCalledWith(reqDto);
      expect(result).toBe(expected);
    });
  });
});
