import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bullmq';
import KeyvRedis from '@keyv/redis';
import { AllConfigType } from '../config/config.type';
import redisConfig from './redis.config';

@Global()
@Module({
  imports: [
    ConfigModule.forFeature(redisConfig),

    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AllConfigType>) => {
        const redisUrl = configService.getOrThrow('redis.url', { infer: true });
        return {
          stores: [new KeyvRedis(redisUrl)],
          ttl: 60 * 60 * 24 * 7, // 1 week
          max: 100000, // Max items
        };
      },
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AllConfigType>) => {
        const redisUrl = configService.getOrThrow('redis.url', { infer: true });
        return {
          connection: {
            url: redisUrl,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
          },
        };
      },
    }),
  ],
  exports: [CacheModule, BullModule],
})
export class RedisModule {}
