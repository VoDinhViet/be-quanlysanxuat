import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { RoleOptionResDto } from './dto/role-option.res.dto';
import { RolesService } from './roles.service';

@ApiTags('Roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions('user.update')
  @ApiAuth({
    type: RoleOptionResDto,
    summary: 'List role options',
    isArray: true,
  })
  getRoles(): Promise<RoleOptionResDto[]> {
    return this.rolesService.getRoles();
  }
}
