import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schemas';
import { AllConfigType } from '../config/config.type';

export const DRIZZLE = 'DRIZZLE';

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AllConfigType>) => {
        const databaseUrl = configService.getOrThrow('database.url', {
          infer: true,
        });
        const max = configService.get('database.maxConnections', {
          infer: true,
        });
        const ssl = configService.get('database.ssl', {
          infer: true,
        });

        // Phiên UTC để `DEFAULT now()` ghi UTC dù máy chủ Postgres đặt múi giờ nào; đặt ở kết nối
        // của app vì refresh staging tạo lại database nên `ALTER DATABASE ... SET timezone` mất.
        const queryClient = postgres(databaseUrl, {
          ssl,
          max,
          connection: { TimeZone: 'UTC' },
        });
        return drizzle(queryClient, { schema });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
