import { HealthCheckService } from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';

import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';

describe('HealthController', () => {
  let controller: HealthController;
  let mockHealthCheckService: { check: jest.Mock };
  let mockDatabaseIndicator: { isHealthy: jest.Mock };
  let mockRedisIndicator: { isHealthy: jest.Mock };

  beforeEach(async () => {
    mockHealthCheckService = { check: jest.fn() };
    mockDatabaseIndicator = { isHealthy: jest.fn() };
    mockRedisIndicator = { isHealthy: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: mockHealthCheckService },
        { provide: DatabaseHealthIndicator, useValue: mockDatabaseIndicator },
        { provide: RedisHealthIndicator, useValue: mockRedisIndicator },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check', () => {
    it('delegates to HealthCheckService.check with the database and redis indicators', async () => {
      const expected = { status: 'ok', info: {}, error: {}, details: {} };
      mockHealthCheckService.check.mockImplementation(async (indicators: Array<() => unknown>) => {
        await Promise.all(indicators.map((indicator) => indicator()));
        return expected;
      });

      const result = await controller.check();

      expect(mockDatabaseIndicator.isHealthy).toHaveBeenCalledWith('database');
      expect(mockRedisIndicator.isHealthy).toHaveBeenCalledWith('redis');
      expect(result).toBe(expected);
    });
  });
});
