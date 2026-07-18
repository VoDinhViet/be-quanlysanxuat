import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AllConfigType } from '../../config/config.type';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { PermissionsService } from './permissions.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AllConfigType>) => ({
        secret: configService.getOrThrow('auth.jwtSecret', { infer: true }),
        signOptions: {
          expiresIn: configService.getOrThrow('auth.jwtTokenExpiresIn', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PermissionsService, JwtAuthGuard, PermissionsGuard],
  exports: [AuthService, PermissionsService, JwtAuthGuard, PermissionsGuard],
})
export class AuthModule {}
