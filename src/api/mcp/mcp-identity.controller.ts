import {
  Controller,
  Get,
  Headers,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';

import { ApiPublic } from '../../decorators/http.decorators';
import { Public } from '../../decorators/public.decorator';
import { AuthService } from '../auth/auth.service';
import { PermissionsService } from '../auth/permissions.service';
import { McpIdentityResDto } from './dto/mcp-identity.res.dto';
import { McpApiKeyGuard } from './guards/mcp-api-key.guard';
import { McpThrottlerGuard } from './guards/mcp-throttler.guard';

/**
 * Cho nền tảng AI đổi access token ERP của người dùng lấy `credentialId` và quyền, để điền
 * `X-On-Behalf-Of` khi gọi `/mcp`. Xác minh đầy đủ như một request thường (chữ ký, phiên chưa
 * đăng xuất, tài khoản còn hoạt động); token không được lưu hay trả lại.
 */
@ApiTags('MCP')
@ApiSecurity('Api-Key')
@Public()
@UseGuards(McpApiKeyGuard, McpThrottlerGuard)
@Controller('auth')
export class McpIdentityController {
  constructor(
    private readonly authService: AuthService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get('whoami')
  @ApiPublic({
    type: McpIdentityResDto,
    summary:
      'Get identity and permissions of the user behind an ERP access token',
  })
  async getWhoami(
    @Headers('x-user-token') userToken?: string,
  ): Promise<McpIdentityResDto> {
    if (!userToken) {
      throw new UnauthorizedException();
    }

    const identity = await this.authService.getActiveIdentity(userToken);
    const permissions = await this.permissionsService.getPermissionCodes(
      identity.credentialId,
    );

    return plainToInstance(
      McpIdentityResDto,
      { ...identity, permissions },
      { excludeExtraneousValues: true },
    );
  }
}
