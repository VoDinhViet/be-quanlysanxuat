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
import { GetUserOptionsReqDto } from './dto/get-user-options.req.dto';
import { GetUsersReqDto } from './dto/get-users.req.dto';
import { PageUserResDto } from './dto/page-user.res.dto';
import { UpdateUserReqDto } from './dto/update-user.req.dto';
import { UserRefResDto } from './dto/user-ref.res.dto';
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
    type: PageUserResDto,
    summary: 'List users',
    isPaginated: true,
  })
  getUsers(
    @Query() reqDto: GetUsersReqDto,
  ): Promise<OffsetPaginatedDto<PageUserResDto>> {
    return this.usersService.getUsers(reqDto);
  }

  @Get('options')
  @ApiAuth({
    type: UserRefResDto,
    summary:
      'List users for dropdown (max 100, đang làm việc, search theo code/tên) — không đòi permission quản lý nhân sự, chỉ cần đăng nhập, để nhân viên các phòng ban khác chọn được đồng nghiệp (vd. người phụ trách một đơn mua hàng)',
    isArray: true,
  })
  getUserOptions(
    @Query() reqDto: GetUserOptionsReqDto,
  ): Promise<UserRefResDto[]> {
    return this.usersService.getUserOptions(reqDto);
  }

  @Get(':userId')
  @Permissions('users:update')
  @ApiAuth({
    type: UserResDto,
    summary: 'Get user detail',
  })
  getUser(@UUIDParam('userId') userId: string): Promise<UserResDto> {
    return this.usersService.getUser(userId);
  }

  @Post()
  @Permissions('users:create')
  @ApiAuth({
    summary: 'Create user (user + optional ERP credential, with optional role)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  createUser(
    @Body() reqDto: CreateUserReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.usersService.createUser(reqDto, payload.sub, payload.userId);
  }

  @Patch(':userId')
  @Permissions('users:update')
  @ApiAuth({
    summary: 'Update user profile (and optionally their role)',
    statusCode: HttpStatus.NO_CONTENT,
  })
  updateUser(
    @UUIDParam('userId') userId: string,
    @Body() reqDto: UpdateUserReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.usersService.updateUser(userId, reqDto, payload.sub);
  }

  @Patch(':userId/role')
  @Permissions('roles:update')
  @ApiAuth({
    summary: 'Assign a role to a user',
    statusCode: HttpStatus.NO_CONTENT,
  })
  assignRole(
    @UUIDParam('userId') userId: string,
    @Body() reqDto: AssignRoleReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<void> {
    return this.usersService.assignRole(userId, reqDto, payload.sub);
  }

  // `POST /users/:userId/avatar` was removed on 2026-07-20: it duplicated `POST /files` and was
  // the only unprotected mutation on this controller. Set the avatar by uploading through
  // `POST /files?type=USER_AVATAR` and sending the returned id as `avatarFileId` on PATCH above.
}
