import {
  Controller,
  Get,
  Headers,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiProperty, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import { ApiPublic } from '../../decorators/http.decorators';
import { AuthService } from '../auth/auth.service';
import { PermissionsService } from '../auth/permissions.service';
import { IntegrationApiKeyGuard } from './guards/integration-api-key.guard';

class IntegrationIdentityResDto {
  @ApiProperty() readonly credentialId!: string;
  @ApiProperty() readonly userId!: string;
  @ApiProperty() readonly username!: string;
  @ApiProperty() readonly displayName!: string;
  @ApiProperty({ type: [String] }) readonly permissions!: string[];
}

/**
 * Cho AI platform đổi access token của người dùng ERP lấy danh tính và quyền. Xác minh đầy đủ
 * như một request thường (chữ ký, phiên chưa đăng xuất, tài khoản còn hoạt động); token không
 * được lưu hay trả lại.
 */
@ApiTags('Integration')
@ApiSecurity('Api-Key')
@UseGuards(IntegrationApiKeyGuard, ThrottlerGuard)
@Controller({ path: 'integration/auth', version: '1' })
export class IntegrationIdentityController {
  constructor(
    private readonly authService: AuthService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get('whoami')
  @ApiPublic({
    type: IntegrationIdentityResDto,
    summary: 'Danh tính và quyền của người dùng theo access token ERP',
  })
  async whoami(
    @Headers('x-user-token') userToken?: string,
  ): Promise<IntegrationIdentityResDto> {
    if (!userToken) {
      throw new UnauthorizedException();
    }
    const identity = await this.authService.getActiveIdentity(userToken);
    const permissions = await this.permissionsService.getPermissionCodes(
      identity.credentialId,
    );

    return { ...identity, permissions };
  }
}
