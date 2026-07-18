import { Body, Controller, Delete, Get, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CreateRoleReqDto } from './dto/create-role.req.dto';
import { GetRolesReqDto } from './dto/get-roles.req.dto';
import { PermissionGroupResDto } from './dto/permission-catalog.res.dto';
import { RoleResDto } from './dto/role.res.dto';
import { UpdateRoleReqDto } from './dto/update-role.req.dto';
import { RolesService } from './roles.service';

@ApiTags('Roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions('roles:manage')
  @ApiAuth({
    type: RoleResDto,
    summary: 'List roles',
    isPaginated: true,
  })
  getRoles(@Query() reqDto: GetRolesReqDto): Promise<OffsetPaginatedDto<RoleResDto>> {
    return this.rolesService.getRoles(reqDto);
  }

  // Declared before `:id` so the literal path wins over the UUID param route.
  @Get('permissions')
  @Permissions('roles:manage')
  @ApiAuth({
    type: PermissionGroupResDto,
    summary: 'List the permission catalogue (grouped by resource)',
    isArray: true,
  })
  getPermissionCatalog(): PermissionGroupResDto[] {
    return this.rolesService.getPermissionCatalog();
  }

  @Get(':id')
  @Permissions('roles:manage')
  @ApiAuth({
    type: RoleResDto,
    summary: 'Get role detail',
  })
  getRoleDetail(@UUIDParam('id') id: string): Promise<RoleResDto> {
    return this.rolesService.getRoleDetail(id);
  }

  @Post()
  @Permissions('roles:manage')
  @ApiAuth({
    type: RoleResDto,
    summary: 'Create role',
    statusCode: HttpStatus.CREATED,
  })
  createRole(
    @Body() reqDto: CreateRoleReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<RoleResDto> {
    return this.rolesService.createRole(reqDto, payload.sub);
  }

  @Patch(':id')
  @Permissions('roles:manage')
  @ApiAuth({
    type: RoleResDto,
    summary: 'Update role (system roles are read-only)',
  })
  updateRole(
    @UUIDParam('id') id: string,
    @Body() reqDto: UpdateRoleReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<RoleResDto> {
    return this.rolesService.updateRole(id, reqDto, payload.sub);
  }

  @Delete(':id')
  @Permissions('roles:manage')
  @ApiAuth({
    summary: 'Delete role (soft delete; blocked if system or in use)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteRole(@UUIDParam('id') id: string): Promise<void> {
    return this.rolesService.deleteRole(id);
  }
}
