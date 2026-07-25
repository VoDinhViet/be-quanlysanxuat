import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiAuth } from '../../decorators/http.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { GetRolesReqDto } from './dto/get-roles.req.dto';
import { RoleResDto } from './dto/role.res.dto';
import { RolesService } from './roles.service';

@ApiTags('Roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions('roles:read')
  @ApiAuth({
    type: RoleResDto,
    summary: 'List roles',
    isArray: true,
  })
  getRoles(@Query() reqDto: GetRolesReqDto): Promise<RoleResDto[]> {
    return this.rolesService.getRoles(reqDto);
  }
}
