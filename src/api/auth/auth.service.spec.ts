import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { compare } from 'bcryptjs';

import { DRIZZLE } from '../../database/database.module';
import { UserStatus } from '../../database/schemas';
import { AuthService } from './auth.service';
import { LoginReqDto } from './dto/login.req.dto';
import { RefreshTokenReqDto } from './dto/refresh-token.req.dto';

jest.mock('bcryptjs', () => ({ compare: jest.fn() }));

describe('AuthService', () => {
  let service: AuthService;
  let mockDb: {
    query: {
      credentials: { findFirst: jest.Mock };
      users: { findFirst: jest.Mock };
    };
  };
  let mockCacheManager: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let mockJwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let mockConfigService: { getOrThrow: jest.Mock };

  const CONFIG_VALUES: Record<string, string> = {
    'auth.refreshSecret': 'refresh-secret',
    'auth.refreshTokenExpiresIn': '7d',
    'auth.jwtTokenExpiresIn': '15m',
  };

  beforeEach(async () => {
    mockDb = {
      query: {
        credentials: { findFirst: jest.fn() },
        users: { findFirst: jest.fn() },
      },
    };
    mockCacheManager = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    mockJwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
      verifyAsync: jest.fn(),
    };
    mockConfigService = {
      getOrThrow: jest.fn((key: string) => CONFIG_VALUES[key]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    const reqDto: LoginReqDto = Object.assign(new LoginReqDto(), {
      identifier: 'superadmin',
      password: 'Admin@123',
    });

    it('returns tokens on valid credentials', async () => {
      mockDb.query.credentials.findFirst.mockResolvedValue({
        id: 'cred-1',
        username: 'superadmin',
        email: 'admin@example.com',
        password: 'hashed-password',
      });
      (compare as jest.Mock).mockResolvedValue(true);
      mockDb.query.users.findFirst.mockResolvedValue(undefined); // no linked user row

      const result = await service.login(reqDto);

      expect(result.accessToken).toBe('signed-token');
      expect(result.tokenType).toBe('Bearer');
      expect(mockCacheManager.set).toHaveBeenCalled();
    });

    it('throws E004 unauthorized when the identifier does not match any credential', async () => {
      mockDb.query.credentials.findFirst.mockResolvedValue(undefined);

      await expect(service.login(reqDto)).rejects.toMatchObject({
        response: { errorCode: 'credential.error.invalid_credentials' },
      });
    });

    it('throws E004 unauthorized when the password does not match', async () => {
      mockDb.query.credentials.findFirst.mockResolvedValue({
        id: 'cred-1',
        password: 'hashed-password',
      });
      (compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(reqDto)).rejects.toMatchObject({
        response: { errorCode: 'credential.error.invalid_credentials' },
      });
    });

    it('throws E018 forbidden when the linked user has resigned', async () => {
      mockDb.query.credentials.findFirst.mockResolvedValue({
        id: 'cred-1',
        password: 'hashed-password',
      });
      (compare as jest.Mock).mockResolvedValue(true);
      mockDb.query.users.findFirst.mockResolvedValue({
        status: UserStatus.RESIGNED,
      });

      await expect(service.login(reqDto)).rejects.toMatchObject({
        response: { errorCode: 'user.error.resigned' },
      });
    });
  });

  describe('refresh', () => {
    const reqDto: RefreshTokenReqDto = Object.assign(new RefreshTokenReqDto(), {
      refreshToken: 'refresh-token',
    });

    it('returns new tokens when the refresh token and session hash match', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sessionId: 'session-1',
        hash: 'hash-1',
      });
      mockCacheManager.get.mockResolvedValue({
        credentialId: 'cred-1',
        hash: 'hash-1',
      });
      mockDb.query.credentials.findFirst.mockResolvedValue({
        id: 'cred-1',
        username: 'superadmin',
        email: 'admin@example.com',
      });
      mockDb.query.users.findFirst.mockResolvedValue(undefined);

      const result = await service.refresh(reqDto);

      expect(result.accessToken).toBe('signed-token');
    });

    it('throws Unauthorized when the refresh token fails verification', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('invalid token'));

      await expect(service.refresh(reqDto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws Unauthorized when the stored session hash does not match', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sessionId: 'session-1',
        hash: 'hash-1',
      });
      mockCacheManager.get.mockResolvedValue({
        credentialId: 'cred-1',
        hash: 'different-hash',
      });

      await expect(service.refresh(reqDto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws Unauthorized when no session is cached', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sessionId: 'session-1',
        hash: 'hash-1',
      });
      mockCacheManager.get.mockResolvedValue(undefined);

      await expect(service.refresh(reqDto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('blacklists the session and clears the cached session hash', async () => {
      await service.logout({ sub: 'cred-1', sessionId: 'session-1' } as never);

      expect(mockCacheManager.set).toHaveBeenCalled();
      expect(mockCacheManager.del).toHaveBeenCalled();
    });
  });

  describe('verifyAccessToken', () => {
    it('returns the decoded payload when the token is valid and not blacklisted', async () => {
      const payload = { sub: 'cred-1', sessionId: 'session-1' };
      mockJwtService.verifyAsync.mockResolvedValue(payload);
      mockCacheManager.get.mockResolvedValue(undefined);

      const result = await service.verifyAccessToken('valid-token');

      expect(result).toBe(payload);
    });

    it('throws Unauthorized when the token fails verification', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('invalid token'));

      await expect(
        service.verifyAccessToken('bad-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws Unauthorized when the session is blacklisted', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'cred-1',
        sessionId: 'session-1',
      });
      mockCacheManager.get.mockResolvedValue(true);

      await expect(
        service.verifyAccessToken('valid-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
