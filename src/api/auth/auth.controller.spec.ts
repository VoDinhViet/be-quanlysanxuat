import { Test, TestingModule } from '@nestjs/testing';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginReqDto } from './dto/login.req.dto';
import { RefreshTokenReqDto } from './dto/refresh-token.req.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { JwtPayloadType } from './types/jwt-payload.type';

describe('AuthController', () => {
  let controller: AuthController;
  let mockService: { login: jest.Mock; refresh: jest.Mock; logout: jest.Mock };

  const payload = { sub: 'cred-1', sessionId: 'session-1' } as JwtPayloadType;

  beforeEach(async () => {
    mockService = { login: jest.fn(), refresh: jest.fn(), logout: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('login delegates to AuthService.login', async () => {
    const reqDto = new LoginReqDto();
    const expected = { accessToken: 'a', refreshToken: 'b' };
    mockService.login.mockResolvedValue(expected);

    const result = await controller.login(reqDto);

    expect(mockService.login).toHaveBeenCalledWith(reqDto);
    expect(result).toBe(expected);
  });

  it('refresh delegates to AuthService.refresh', async () => {
    const reqDto = new RefreshTokenReqDto();
    const expected = { accessToken: 'a', refreshToken: 'b' };
    mockService.refresh.mockResolvedValue(expected);

    const result = await controller.refresh(reqDto);

    expect(mockService.refresh).toHaveBeenCalledWith(reqDto);
    expect(result).toBe(expected);
  });

  it('logout delegates to AuthService.logout with the current user payload', async () => {
    mockService.logout.mockResolvedValue(undefined);

    const result = await controller.logout(payload);

    expect(mockService.logout).toHaveBeenCalledWith(payload);
    expect(result).toBeUndefined();
  });
});
