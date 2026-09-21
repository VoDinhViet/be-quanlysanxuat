import { randomUUID } from 'crypto';

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import type { Cache } from 'cache-manager';
import { plainToInstance } from 'class-transformer';
import { eq, or, sql } from 'drizzle-orm';
import ms from 'ms';

import { AllConfigType } from '../../config/config.type';
import { CacheKey } from '../../constants/cache.constant';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { credentials, users, UserStatus } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { createCacheKey } from '../../utils/cache.util';
import { LoginReqDto } from './dto/login.req.dto';
import { LoginResDto } from './dto/login.res.dto';
import { RefreshTokenReqDto } from './dto/refresh-token.req.dto';
import { JwtPayloadType } from './types/jwt-payload.type';
import { RefreshTokenPayloadType } from './types/refresh-token-payload.type';

type SessionCredential = {
  credentialId: string;
  userId: string;
  username: string;
  email: string;
};

type StoredSession = {
  credentialId: string;
  hash: string;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  async login(reqDto: LoginReqDto): Promise<LoginResDto> {
    const credential = await this.db.query.credentials.findFirst({
      where: or(
        eq(sql`lower(${credentials.username})`, reqDto.identifier),
        eq(credentials.email, reqDto.identifier),
      ),
    });

    if (!credential) {
      throw new AppException(ErrorCode.E004, HttpStatus.UNAUTHORIZED);
    }

    const isPasswordValid = await compare(reqDto.password, credential.password);

    if (!isPasswordValid) {
      throw new AppException(ErrorCode.E004, HttpStatus.UNAUTHORIZED);
    }

    await this.ensureCredentialEnabled(credential.id, credential.userId);

    const sessionId = randomUUID();
    const { accessToken, refreshToken } = await this.createTokenPair(
      {
        credentialId: credential.id,
        userId: credential.userId,
        username: credential.username,
        email: credential.email,
      },
      sessionId,
    );

    return plainToInstance(
      LoginResDto,
      {
        userId: credential.userId,
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
      },
      { excludeExtraneousValues: true },
    );
  }

  async refresh(reqDto: RefreshTokenReqDto): Promise<LoginResDto> {
    const refreshSecret = this.configService.getOrThrow('auth.refreshSecret', {
      infer: true,
    });

    let refreshPayload: RefreshTokenPayloadType;

    try {
      refreshPayload = await this.jwtService.verifyAsync(reqDto.refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException();
    }

    const storedSession = await this.cacheManager.get<StoredSession>(
      createCacheKey(CacheKey.SESSION_HASH, refreshPayload.sessionId),
    );

    if (!storedSession || storedSession.hash !== refreshPayload.hash) {
      throw new UnauthorizedException();
    }

    const credential = await this.db.query.credentials.findFirst({
      where: eq(credentials.id, storedSession.credentialId),
    });

    if (!credential) {
      throw new UnauthorizedException();
    }

    await this.ensureCredentialEnabled(credential.id, credential.userId);

    const { accessToken, refreshToken } = await this.createTokenPair(
      {
        credentialId: credential.id,
        userId: credential.userId,
        username: credential.username,
        email: credential.email,
      },
      refreshPayload.sessionId,
    );

    return plainToInstance(
      LoginResDto,
      {
        userId: credential.userId,
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
      },
      { excludeExtraneousValues: true },
    );
  }

  async logout(payload: JwtPayloadType): Promise<void> {
    const jwtTokenExpiresIn = this.configService.getOrThrow(
      'auth.jwtTokenExpiresIn',
      {
        infer: true,
      },
    );
    const expiresInMs = ms(jwtTokenExpiresIn);

    await Promise.all([
      this.cacheManager.set(
        createCacheKey(CacheKey.SESSION_BLACKLIST, payload.sessionId),
        true,
        expiresInMs,
      ),
      this.cacheManager.del(
        createCacheKey(CacheKey.SESSION_HASH, payload.sessionId),
      ),
    ]);
  }

  async verifyAccessToken(token: string): Promise<JwtPayloadType> {
    let payload: JwtPayloadType;

    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }

    const isSessionBlacklisted = await this.cacheManager.get<boolean>(
      createCacheKey(CacheKey.SESSION_BLACKLIST, payload.sessionId),
    );

    if (isSessionBlacklisted) {
      throw new UnauthorizedException();
    }

    return payload;
  }

  /**
   * Checks whether credential is enabled (`credentialEnabled === true`) and user status is active.
   * If `credentialEnabled` is false or `users.status` is `RESIGNED`, rejects login/refresh with E018 (FORBIDDEN).
   */
  private async ensureCredentialEnabled(
    credentialId: string,
    userId: string,
  ): Promise<void> {
    const credential = await this.db.query.credentials.findFirst({
      where: eq(credentials.id, credentialId),
      columns: { credentialEnabled: true },
    });

    if (!credential || !credential.credentialEnabled) {
      throw new AppException(ErrorCode.E018, HttpStatus.FORBIDDEN);
    }

    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { status: true },
    });

    if (user?.status === UserStatus.RESIGNED) {
      throw new AppException(ErrorCode.E018, HttpStatus.FORBIDDEN);
    }
  }

  private async createTokenPair(
    credential: SessionCredential,
    sessionId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const refreshSecret = this.configService.getOrThrow('auth.refreshSecret', {
      infer: true,
    });
    const refreshTokenExpiresIn = this.configService.getOrThrow(
      'auth.refreshTokenExpiresIn',
      {
        infer: true,
      },
    );
    const hash = randomUUID();

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync({
        sub: credential.credentialId,
        userId: credential.userId,
        username: credential.username,
        email: credential.email,
        sessionId,
      }),
      this.jwtService.signAsync(
        { sessionId, hash },
        { secret: refreshSecret, expiresIn: refreshTokenExpiresIn },
      ),
    ]);

    await this.cacheManager.set(
      createCacheKey(CacheKey.SESSION_HASH, sessionId),
      { credentialId: credential.credentialId, hash },
      ms(refreshTokenExpiresIn),
    );

    return { accessToken, refreshToken };
  }
}
