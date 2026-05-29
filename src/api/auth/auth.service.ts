import { HttpStatus, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { plainToInstance } from 'class-transformer';
import { eq } from 'drizzle-orm';
import ms from 'ms';

import { AllConfigType } from '../../config/config.type';
import { ErrorCode } from '../../constants/error-code.constant';
import { Role } from '../../constants/role.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { UserStatus, users } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { LoginReqDto } from './dto/login.req.dto';
import { LoginResDto } from './dto/login.res.dto';
import { CurrentUserResDto } from './dto/current-user.res.dto';
import { JwtPayloadType } from './types/jwt-payload.type';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private static readonly INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    private readonly jwtService: JwtService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async login(dto: LoginReqDto): Promise<LoginResDto> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, dto.email),
      with: {
        role: {
          with: {
            rolePermissions: {
              with: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      this.throwInvalidCredentials();
    }

    const isPasswordValid = await compare(dto.password, user.password);

    if (!isPasswordValid || user.role?.isActive === false) {
      this.throwInvalidCredentials();
    }

    const payload: JwtPayloadType = {
      sub: user.id,
      email: user.email,
      role: user.role?.code as Role | undefined,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(payload),
      this.signRefreshToken(payload),
    ]);

    return plainToInstance(
      LoginResDto,
      {
        userId: user.id,
        roleCode: user.role?.code,
        permissions:
          user.role?.rolePermissions
            .map((rolePermission) => rolePermission.permission)
            .map((permission) => permission.code) ?? [],
        accessToken,
        refreshToken,
        tokenExpires: this.getAccessTokenExpiresAt(),
      },
      { excludeExtraneousValues: true },
    );
  }

  async getCurrentUser(userId: string): Promise<CurrentUserResDto> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
      with: {
        role: {
          with: {
            rolePermissions: {
              with: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(
      CurrentUserResDto,
      {
        ...user,
        permissions:
          user.role?.rolePermissions
            .map((rolePermission) => rolePermission.permission)
            .map((permission) => permission.code) ?? [],
      },
      { excludeExtraneousValues: true },
    );
  }

  private throwInvalidCredentials(): never {
    throw new AppException(
      ErrorCode.E004,
      HttpStatus.UNAUTHORIZED,
      AuthService.INVALID_CREDENTIALS_MESSAGE,
    );
  }

  async signAccessToken(payload: JwtPayloadType): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow('auth.secret', { infer: true }),
      expiresIn: this.configService.getOrThrow('auth.expires', { infer: true }),
    });
  }

  async signRefreshToken(payload: JwtPayloadType): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow('auth.refreshSecret', {
        infer: true,
      }),
      expiresIn: this.configService.getOrThrow('auth.refreshExpires', {
        infer: true,
      }),
    });
  }

  async verifyAccessToken(token: string): Promise<JwtPayloadType> {
    try {
      return await this.jwtService.verifyAsync<JwtPayloadType>(token, {
        secret: this.configService.getOrThrow('auth.secret', { infer: true }),
      });
    } catch (error) {
      this.logger.warn(`[Auth] Invalid access token: ${this.getTokenErrorMessage(error)}`);
      throw new UnauthorizedException();
    }
  }

  async verifyRefreshToken(token: string): Promise<JwtPayloadType> {
    try {
      return await this.jwtService.verifyAsync<JwtPayloadType>(token, {
        secret: this.configService.getOrThrow('auth.refreshSecret', {
          infer: true,
        }),
      });
    } catch (error) {
      this.logger.warn(`[Auth] Invalid refresh token: ${this.getTokenErrorMessage(error)}`);
      throw new UnauthorizedException();
    }
  }

  private getTokenErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }

    return 'Unknown token verification error';
  }

  private getAccessTokenExpiresAt(): number {
    const expiresIn = this.configService.getOrThrow('auth.expires', {
      infer: true,
    });

    return Date.now() + ms(expiresIn);
  }
}
