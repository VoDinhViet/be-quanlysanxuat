import { Test, TestingModule } from '@nestjs/testing';

import { CountriesController } from './countries.controller';
import { CountriesService } from './countries.service';
import { GetCountriesReqDto } from './dto/get-countries.req.dto';

describe('CountriesController', () => {
  let controller: CountriesController;
  let mockService: { getCountries: jest.Mock };

  beforeEach(async () => {
    mockService = { getCountries: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CountriesController],
      providers: [{ provide: CountriesService, useValue: mockService }],
    }).compile();

    controller = module.get<CountriesController>(CountriesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCountries', () => {
    it('delegates to CountriesService.getCountries', async () => {
      const reqDto = new GetCountriesReqDto();
      const expected = { data: [], pagination: {} };
      mockService.getCountries.mockResolvedValue(expected);

      const result = await controller.getCountries(reqDto);

      expect(mockService.getCountries).toHaveBeenCalledWith(reqDto);
      expect(result).toBe(expected);
    });
  });
});
