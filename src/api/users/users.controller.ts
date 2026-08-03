import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { AssignRoleReqDto } from './dto/assign-role.req.dto';
import { CreateUserReqDto } from './dto/create-user.req.dto';
import { CurrentUserResDto } from './dto/current-user.res.dto';
import { GetUsersReqDto } from './dto/get-users.req.dto';
import { UpdateUserReqDto } from './dto/update-user.req.dto';
import { UserDetailResDto } from './dto/user-detail.res.dto';
import { UserResDto } from './dto/user.res.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiAuth({
    type: CurrentUserResDto,
    summary: 'Get my profile',
  })
  getCurrentUser(
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<CurrentUserResDto> {
    return this.usersService.getCurrentUser(payload.sub);
  }

  @Get()
  @Permissions('users:update')
  @ApiAuth({
    type: UserResDto,
    summary: 'List users',
    isPaginated: true,
  })
  getUsers(
    @Query() reqDto: GetUsersReqDto,
  ): Promise<OffsetPaginatedDto<UserResDto>> {
    return this.usersService.getUsers(reqDto);
  }

  @Get(':userId')
  @Permissions('users:update')
  @ApiAuth({
    type: UserDetailResDto,
    summary: 'Get user detail',
  })
  getUserDetail(
    @UUIDParam('userId') userId: string,
  ): Promise<UserDetailResDto> {
    return this.usersService.getUserDetail(userId);
  }

  @Post()
  @Permissions('users:create')
  @ApiAuth({
    type: UserDetailResDto,
    summary: 'Create user (user + optional ERP credential, with optional role)',
    statusCode: HttpStatus.CREATED,
  })
  createUser(
    @Body() reqDto: CreateUserReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<UserDetailResDto> {
    return this.usersService.createUser(reqDto, payload.sub, payload.userId);
  }

  @Patch(':userId')
  @Permissions('users:update')
  @ApiAuth({
    type: UserDetailResDto,
    summary: 'Update user profile (and optionally their role)',
  })
  updateUser(
    @UUIDParam('userId') userId: string,
    @Body() reqDto: UpdateUserReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<UserDetailResDto> {
    return this.usersService.updateUser(userId, reqDto, payload.sub);
  }

  @Patch(':userId/role')
  @Permissions('roles:update')
  @ApiAuth({
    type: UserDetailResDto,
    summary: 'Assign a role to a user',
  })
  assignRole(
    @UUIDParam('userId') userId: string,
    @Body() reqDto: AssignRoleReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<UserDetailResDto> {
    return this.usersService.assignRole(userId, reqDto, payload.sub);
  }

  // `POST /users/:userId/avatar` was removed on 2026-07-20: it duplicated `POST /files` and was
  // the only unprotected mutation on this controller. Set the avatar by uploading through
  // `POST /files?type=USER_AVATAR` and sending the returned id as `avatarFileId` on PATCH above.
}
