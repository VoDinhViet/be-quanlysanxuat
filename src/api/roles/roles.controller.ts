import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { CreateRoleReqDto } from './dto/create-role.req.dto';
import { GetRolesReqDto } from './dto/get-roles.req.dto';
import { RoleResDto } from './dto/role.res.dto';
import { UpdateRoleReqDto } from './dto/update-role.req.dto';
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

  @Get(':roleId')
  @Permissions('roles:read')
  @ApiAuth({
    type: RoleResDto,
    summary: 'Get role detail',
  })
  getRole(@UUIDParam('roleId') roleId: string): Promise<RoleResDto> {
    return this.rolesService.getRole(roleId);
  }

  @Post()
  @Permissions('roles:create')
  @ApiAuth({
    summary: 'Create role',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createRole(
    @Body() reqDto: CreateRoleReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.rolesService.createRole(reqDto, payload.sub);
  }

  @Patch(':roleId')
  @Permissions('roles:update')
  @ApiAuth({
    summary: 'Update role',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateRole(
    @UUIDParam('roleId') roleId: string,
    @Body() reqDto: UpdateRoleReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.rolesService.updateRole(roleId, reqDto, payload.sub);
  }

  @Delete(':roleId')
  @Permissions('roles:delete')
  @ApiAuth({
    summary: 'Delete role (soft delete)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  deleteRole(@UUIDParam('roleId') roleId: string): Promise<void> {
    return this.rolesService.deleteRole(roleId);
  }
}
