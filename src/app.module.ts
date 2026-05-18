import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import appConfig from './config/app.config';
import databaseConfig from './database/config/database.config';
import authConfig from './api/auth/config/auth.config';
import redisConfig from './redis/redis.config';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { RolesGuard } from './guards/roles.guard';
import { AuthModule } from './api/auth/auth.module';
import { UsersModule } from './api/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [appConfig, databaseConfig, authConfig, redisConfig],
      isGlobal: true,
    }),

    DatabaseModule,
    RedisModule,
    AuthModule,
    UsersModule,
  ],

  controllers: [AppController],
  providers: [AppService, RolesGuard],
})
export class AppModule {}
