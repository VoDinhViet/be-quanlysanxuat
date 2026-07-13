import { Body, Controller, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiAuth, ApiPublic } from '../../decorators/http.decorators';
import { User } from '../../decorators/user.decorator';
import { AuthService } from './auth.service';
import { LoginReqDto } from './dto/login.req.dto';
import { LoginResDto } from './dto/login.res.dto';
import { RefreshTokenReqDto } from './dto/refresh-token.req.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { JwtPayloadType } from './types/jwt-payload.type';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiPublic({
    type: LoginResDto,
    summary: 'Đăng nhập bằng username hoặc email',
    statusCode: HttpStatus.OK,
  })
  login(@Body() reqDto: LoginReqDto): Promise<LoginResDto> {
    return this.authService.login(reqDto);
  }

  @Post('refresh')
  @ApiPublic({
    type: LoginResDto,
    summary: 'Làm mới access token bằng refresh token',
    statusCode: HttpStatus.OK,
  })
  refresh(@Body() reqDto: RefreshTokenReqDto): Promise<LoginResDto> {
    return this.authService.refresh(reqDto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiAuth({
    summary: 'Đăng xuất (blacklist token hiện tại)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  logout(@User() payload: JwtPayloadType): Promise<void> {
    return this.authService.logout(payload);
  }
}
