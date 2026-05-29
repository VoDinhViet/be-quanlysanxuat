import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { plainToInstance } from 'class-transformer';
import { and, count as drizzleCount, desc, eq, ilike, ne, or } from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { roles, users, UserStatus } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { ChangeUserPasswordReqDto } from './dto/change-password.req.dto';
import { CreateUserReqDto } from './dto/create-user.req.dto';
import { GetUsersReqDto } from './dto/get-users.req.dto';
import { UpdateUserReqDto } from './dto/update-user.req.dto';
import { UserResDto } from './dto/user.res.dto';

@Injectable()
export class UsersService {
  private static readonly PASSWORD_SALT_ROUNDS = 10;

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getUsers(reqDto: GetUsersReqDto): Promise<OffsetPaginatedDto<UserResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      keyword ? or(ilike(users.email, keyword), ilike(users.fullName, keyword)) : undefined,
      reqDto.status ? eq(users.status, reqDto.status) : undefined,
      reqDto.roleId ? eq(users.roleId, reqDto.roleId) : undefined,
    );
    const orderBy = desc(users.createdAt);

    const [entities, count] = await Promise.all([
      this.db.query.users.findMany({
        where,
        with: {
          role: true,
        },
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
      }),
      this.db.select({ total: drizzleCount() }).from(users).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(UserResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(count[0]?.total ?? 0, reqDto),
    );
  }

  async getUserDetail(userId: string): Promise<UserResDto> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
      with: {
        role: true,
      },
    });

    if (!user) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(UserResDto, user, {
      excludeExtraneousValues: true,
    });
  }

  async createUser(reqDto: CreateUserReqDto): Promise<UserResDto> {
    await this.ensureEmailAvailable(reqDto.email);
    await this.ensureActiveRole(reqDto.roleId);

    let code = reqDto.code;
    if (code) {
      await this.ensureCodeAvailable(code);
    } else {
      code = await this.generateUserCode();
    }

    const password = await hash(reqDto.password, UsersService.PASSWORD_SALT_ROUNDS);

    const [user] = await this.db
      .insert(users)
      .values({
        email: reqDto.email,
        code,
        password,
        fullName: reqDto.fullName,
        phoneNumber: reqDto.phoneNumber,
        dateOfBirth: reqDto.dateOfBirth,
        gender: reqDto.gender,
        roleId: reqDto.roleId,
        status: reqDto.status ?? UserStatus.ACTIVE,
      })
      .returning();

    return this.getUserDetail(user.id);
  }

  async updateUser(userId: string, reqDto: UpdateUserReqDto): Promise<UserResDto> {
    await this.ensureUserExists(userId);

    if (reqDto.email) {
      await this.ensureEmailAvailable(reqDto.email, userId);
    }

    if (reqDto.code) {
      await this.ensureCodeAvailable(reqDto.code, userId);
    }

    if (reqDto.roleId !== undefined) {
      await this.ensureActiveRole(reqDto.roleId);
    }

    const [user] = await this.db
      .update(users)
      .set({
        email: reqDto.email,
        code: reqDto.code,
        fullName: reqDto.fullName,
        phoneNumber: reqDto.phoneNumber,
        dateOfBirth: reqDto.dateOfBirth,
        gender: reqDto.gender,
        roleId: reqDto.roleId,
        status: reqDto.status,
      })
      .where(eq(users.id, userId))
      .returning();

    return this.getUserDetail(user.id);
  }

  async changeUserPassword(userId: string, reqDto: ChangeUserPasswordReqDto): Promise<UserResDto> {
    await this.ensureUserExists(userId);

    const password = await hash(reqDto.password, UsersService.PASSWORD_SALT_ROUNDS);

    const [user] = await this.db
      .update(users)
      .set({
        password,
      })
      .where(eq(users.id, userId))
      .returning();

    return this.getUserDetail(user.id);
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const existingUser = await this.db.query.users.findFirst({
      columns: {
        id: true,
      },
      where: eq(users.id, userId),
    });

    if (!existingUser) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureEmailAvailable(email: string, ignoredUserId?: string): Promise<void> {
    const where = ignoredUserId
      ? and(eq(users.email, email), ne(users.id, ignoredUserId))
      : eq(users.email, email);

    const existingUser = await this.db.query.users.findFirst({
      columns: {
        id: true,
      },
      where,
    });

    if (existingUser) {
      throw new AppException(ErrorCode.E003, HttpStatus.CONFLICT);
    }
  }

  private async ensureCodeAvailable(code: string, ignoredUserId?: string): Promise<void> {
    const where = ignoredUserId
      ? and(eq(users.code, code), ne(users.id, ignoredUserId))
      : eq(users.code, code);

    const existingUser = await this.db.query.users.findFirst({
      columns: {
        id: true,
      },
      where,
    });

    if (existingUser) {
      throw new AppException(ErrorCode.E005, HttpStatus.CONFLICT);
    }
  }

  private async generateUserCode(): Promise<string> {
    const [totalRows] = await this.db.select({ total: drizzleCount() }).from(users);
    return `US${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }

  private async ensureActiveRole(roleId?: string | null): Promise<void> {
    if (!roleId) {
      return;
    }

    const role = await this.db.query.roles.findFirst({
      columns: {
        id: true,
        isActive: true,
      },
      where: eq(roles.id, roleId),
    });

    if (!role || !role.isActive) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }
  }
}
