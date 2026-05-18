import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { plainToInstance } from 'class-transformer';
import { and, asc, count as drizzleCount, desc, eq, ilike, ne, or } from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { PageOptionsDto } from '../../common/dto/offset-pagination/page-options.dto';
import { OrderBy } from '../../constants/app.constant';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { roles, users, UserStatus } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { ChangeUserPasswordReqDto } from './dto/change-password.req.dto';
import { CreateUserReqDto } from './dto/create-user.req.dto';
import { UpdateUserReqDto } from './dto/update-user.req.dto';
import { UserResDto } from './dto/user.res.dto';

@Injectable()
export class UsersService {
  private static readonly PASSWORD_SALT_ROUNDS = 10;

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getUsers(pageOptions: PageOptionsDto): Promise<OffsetPaginatedDto<UserResDto>> {
    const keyword = pageOptions.q ? `%${pageOptions.q}%` : undefined;
    const where = keyword
      ? or(ilike(users.email, keyword), ilike(users.fullName, keyword))
      : undefined;
    const orderBy =
      pageOptions.order === OrderBy.DESC ? desc(users.createdAt) : asc(users.createdAt);

    const [entities, count] = await Promise.all([
      this.db.query.users.findMany({
        where,
        with: {
          role: true,
        },
        limit: pageOptions.limit,
        offset: pageOptions.offset,
        orderBy,
      }),
      this.db.select({ total: drizzleCount() }).from(users).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(UserResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(count[0]?.total ?? 0, pageOptions),
    );
  }

  async getUserDetail(userId: string): Promise<UserResDto> {
    const user = await this.findUserById(userId);

    return plainToInstance(UserResDto, user, {
      excludeExtraneousValues: true,
    });
  }

  async createUser(reqDto: CreateUserReqDto): Promise<UserResDto> {
    await this.ensureEmailAvailable(reqDto.email);
    await this.ensureActiveRole(reqDto.roleId);

    const password = await hash(reqDto.password, UsersService.PASSWORD_SALT_ROUNDS);

    const [user] = await this.db
      .insert(users)
      .values({
        email: reqDto.email,
        password,
        fullName: reqDto.fullName,
        roleId: reqDto.roleId,
        status: reqDto.status ?? UserStatus.Active,
      })
      .returning();

    return this.getUserDetail(user.id);
  }

  async updateUser(userId: string, reqDto: UpdateUserReqDto): Promise<UserResDto> {
    await this.ensureUserExists(userId);

    if (reqDto.email) {
      await this.ensureEmailAvailable(reqDto.email, userId);
    }

    if (reqDto.roleId !== undefined) {
      await this.ensureActiveRole(reqDto.roleId);
    }

    const [user] = await this.db
      .update(users)
      .set({
        ...(reqDto.email !== undefined ? { email: reqDto.email } : {}),
        ...(reqDto.fullName !== undefined ? { fullName: reqDto.fullName } : {}),
        ...(reqDto.roleId !== undefined ? { roleId: reqDto.roleId } : {}),
        ...(reqDto.status !== undefined ? { status: reqDto.status } : {}),
        updatedAt: new Date(),
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
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    return this.getUserDetail(user.id);
  }

  private async findUserById(userId: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
      with: {
        role: true,
      },
    });

    if (!user) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }

    return user;
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await this.db.query.users.findFirst({
      columns: {
        id: true,
      },
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureEmailAvailable(email: string, ignoredUserId?: string): Promise<void> {
    const where = ignoredUserId
      ? and(eq(users.email, email), ne(users.id, ignoredUserId))
      : eq(users.email, email);

    const user = await this.db.query.users.findFirst({
      columns: {
        id: true,
      },
      where,
    });

    if (user) {
      throw new AppException(ErrorCode.E003, HttpStatus.CONFLICT);
    }
  }

  private async ensureActiveRole(roleId?: string | null): Promise<void> {
    if (!roleId) {
      return;
    }

    const role = await this.db.query.roles.findFirst({
      columns: {
        id: true,
        status: true,
      },
      where: eq(roles.id, roleId),
    });

    if (!role || role.status !== 'active') {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }
  }
}
