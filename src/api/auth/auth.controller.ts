import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiAuth, ApiPublic } from '../../decorators/http.decorators';
import { User } from '../../decorators/user.decorator';
import { AuthService } from './auth.service';
import { LoginReqDto } from './dto/login.req.dto';
import { LoginResDto } from './dto/login.res.dto';
import { MeResDto } from './dto/me.res.dto';
import type { JwtPayloadType } from './types/jwt-payload.type';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiPublic({
    type: LoginResDto,
    summary: 'Login by email and password',
  })
  login(@Body() dto: LoginReqDto): Promise<LoginResDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiAuth({
    type: MeResDto,
    summary: 'Get current account detail',
  })
  getMe(@User() user: JwtPayloadType): Promise<MeResDto> {
    return this.authService.getMe(user.sub);
  }
}
