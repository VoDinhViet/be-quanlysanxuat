import { Test, TestingModule } from '@nestjs/testing';

import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { GetDepartmentsReqDto } from './dto/get-departments.req.dto';

describe('DepartmentsController', () => {
  let controller: DepartmentsController;
  let mockService: { getDepartments: jest.Mock };

  beforeEach(async () => {
    mockService = { getDepartments: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DepartmentsController],
      providers: [{ provide: DepartmentsService, useValue: mockService }],
    }).compile();

    controller = module.get<DepartmentsController>(DepartmentsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getDepartments', () => {
    it('delegates to DepartmentsService.getDepartments', async () => {
      const reqDto = new GetDepartmentsReqDto();
      const expected = { data: [], pagination: {} };
      mockService.getDepartments.mockResolvedValue(expected);

      const result = await controller.getDepartments(reqDto);

      expect(mockService.getDepartments).toHaveBeenCalledWith(reqDto);
      expect(result).toBe(expected);
    });
  });
});
