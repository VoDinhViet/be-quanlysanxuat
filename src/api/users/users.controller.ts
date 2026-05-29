import { Body, Controller, Get, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { ChangeUserPasswordReqDto } from './dto/change-password.req.dto';
import { CreateUserReqDto } from './dto/create-user.req.dto';
import { GetUsersReqDto } from './dto/get-users.req.dto';
import { UpdateUserReqDto } from './dto/update-user.req.dto';
import { UserResDto } from './dto/user.res.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('users:update')
  @ApiAuth({
    type: UserResDto,
    summary: 'List users',
    isPaginated: true,
  })
  getUsers(@Query() reqDto: GetUsersReqDto): Promise<OffsetPaginatedDto<UserResDto>> {
    return this.usersService.getUsers(reqDto);
  }

  @Get(':userId')
  @Permissions('users:update')
  @ApiAuth({
    type: UserResDto,
    summary: 'Get user detail',
  })
  getUserDetail(@UUIDParam('userId') userId: string): Promise<UserResDto> {
    return this.usersService.getUserDetail(userId);
  }

  @Post()
  @Permissions('users:create')
  @ApiAuth({
    type: UserResDto,
    summary: 'Create user',
    statusCode: HttpStatus.CREATED,
  })
  createUser(@Body() reqDto: CreateUserReqDto): Promise<UserResDto> {
    return this.usersService.createUser(reqDto);
  }

  @Patch(':userId')
  @Permissions('users:update')
  @ApiAuth({
    type: UserResDto,
    summary: 'Update user',
  })
  updateUser(
    @UUIDParam('userId') userId: string,
    @Body() reqDto: UpdateUserReqDto,
  ): Promise<UserResDto> {
    return this.usersService.updateUser(userId, reqDto);
  }

  @Patch(':userId/password')
  @Permissions('users:update')
  @ApiAuth({
    type: UserResDto,
    summary: 'Change user password',
  })
  changeUserPassword(
    @UUIDParam('userId') userId: string,
    @Body() reqDto: ChangeUserPasswordReqDto,
  ): Promise<UserResDto> {
    return this.usersService.changeUserPassword(userId, reqDto);
  }
}
