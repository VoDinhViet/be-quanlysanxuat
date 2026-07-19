import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';

import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { multerOptions } from '../uploads/config/multer.config';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import { UUIDParam } from '../../decorators/param.decorators';
import { Permissions } from '../../decorators/permissions.decorator';
import { AssignRoleReqDto } from './dto/assign-role.req.dto';
import { CreateUserReqDto } from './dto/create-user.req.dto';
import { CredentialResDto } from './dto/credential.res.dto';
import { GetUsersReqDto } from './dto/get-users.req.dto';
import { UpdateUserReqDto } from './dto/update-user.req.dto';
import { UserResDto } from './dto/user.res.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiAuth({
    type: CredentialResDto,
    summary: 'Get my profile',
  })
  getCurrentUser(@CurrentUser() payload: JwtPayloadType): Promise<CredentialResDto> {
    return this.usersService.getCredentialDetail(payload.sub);
  }

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
    summary: 'Create user (user + optional ERP credential)',
    statusCode: HttpStatus.CREATED,
  })
  createUser(
    @Body() reqDto: CreateUserReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<UserResDto> {
    return this.usersService.createUser(reqDto, payload.sub);
  }

  @Patch(':userId')
  @Permissions('users:update')
  @ApiAuth({
    type: UserResDto,
    summary: 'Update user profile',
  })
  updateUser(
    @UUIDParam('userId') userId: string,
    @Body() reqDto: UpdateUserReqDto,
  ): Promise<UserResDto> {
    return this.usersService.updateUser(userId, reqDto);
  }

  @Patch(':userId/role')
  @Permissions('roles:update')
  @ApiAuth({
    type: UserResDto,
    summary: 'Assign a role to a user',
  })
  assignRole(
    @UUIDParam('userId') userId: string,
    @Body() reqDto: AssignRoleReqDto,
    @CurrentUser() payload: JwtPayloadType,
  ): Promise<UserResDto> {
    return this.usersService.assignRole(userId, reqDto, payload.sub);
  }

  @Post(':userId/avatar')
  @UseInterceptors(FileInterceptor('file', multerOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiAuth({
    type: UserResDto,
    summary: 'Upload a user avatar (max 5MB, jpeg/png/webp/gif)',
  })
  uploadUserAvatar(
    @UUIDParam('userId') userId: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<UserResDto> {
    return this.usersService.uploadUserAvatar(userId, file);
  }
}
