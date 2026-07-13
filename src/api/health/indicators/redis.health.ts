import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import type { Cache } from 'cache-manager';

const PING_KEY = 'health:ping';
const PING_VALUE = 'pong';
const PING_TTL_MS = 5000;

@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);

    try {
      await this.cacheManager.set(PING_KEY, PING_VALUE, PING_TTL_MS);
      const value = await this.cacheManager.get<string>(PING_KEY);

      if (value !== PING_VALUE) {
        return indicator.down({ message: 'Redis round-trip value mismatch' });
      }

      return indicator.up();
    } catch (error) {
      return indicator.down({ message: (error as Error).message });
    }
  }
}
