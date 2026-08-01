import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtAuthGuard } from './api/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './api/auth/guards/permissions.guard';
import { RolesModule } from './api/roles/roles.module';
import appConfig from './config/app.config';
import uploadConfig from './config/upload.config';
import authConfig from './api/auth/config/auth.config';
import databaseConfig from './database/config/database.config';
import redisConfig from './redis/redis.config';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './api/auth/auth.module';
import { DepartmentsModule } from './api/departments/departments.module';
import { FilesModule } from './api/files/files.module';
import { HealthModule } from './api/health/health.module';
import { PositionsModule } from './api/positions/positions.module';
import { UsersModule } from './api/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [appConfig, authConfig, databaseConfig, redisConfig, uploadConfig],
      isGlobal: true,
    }),

    // Drives FilesCleanupService. In-memory timers, so this only ticks when the app runs as a
    // long-lived process (`main.ts`'s `instance.listen`), not under the serverless handler export.
    ScheduleModule.forRoot(),

    DatabaseModule,
    RedisModule,
    StorageModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    FilesModule,
    PositionsModule,
    HealthModule,
    RolesModule,
  ],

  controllers: [AppController],
  providers: [
    AppService,
    // Global secure-by-default: every route requires a valid session (JwtAuthGuard) and, when
    // it declares @Permissions(...), the matching permission (PermissionsGuard). @Public() /
    // @ApiPublic() opts a route out. Order matters — auth runs before authorization.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
