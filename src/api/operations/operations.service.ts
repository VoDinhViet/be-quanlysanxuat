import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNull,
  ne,
  or,
} from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { hasFields } from '../../common/utils/object.util';
import { extractPostgresError } from '../../common/utils/postgres-error.util';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  bomOperations,
  credentials,
  departments,
  files,
  operationAssignments,
  operations,
  positions,
  roles,
  users,
  UserStatus,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { PageUserResDto } from '../users/dto/page-user.res.dto';
import { CreateOperationReqDto } from './dto/create-operation.req.dto';
import { GetOperationAssignmentsReqDto } from './dto/get-operation-assignments.req.dto';
import { GetOperationOptionsReqDto } from './dto/get-operation-options.req.dto';
import { GetOperationsReqDto } from './dto/get-operations.req.dto';
import { OperationRefResDto } from './dto/operation-ref.res.dto';
import { OperationResDto } from './dto/operation.res.dto';
import { UpdateOperationAssignmentsReqDto } from './dto/update-operation-assignments.req.dto';
import { UpdateOperationReqDto } from './dto/update-operation.req.dto';

const OPERATION_OPTIONS_LIMIT = 100;

@Injectable()
export class OperationsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getOperations(
    reqDto: GetOperationsReqDto,
  ): Promise<OffsetPaginatedDto<OperationResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const filter = and(
      isNull(operations.deletedAt),
      keyword ? unaccentILike(operations.name, keyword) : undefined,
      reqDto.type ? eq(operations.type, reqDto.type) : undefined,
      reqDto.status ? eq(operations.status, reqDto.status) : undefined,
    );

    const [entities, [{ total }]] = await Promise.all([
      this.db.query.operations.findMany({
        where: filter,
        // Alphabetical, because this list is rendered straight into a table.
        orderBy: asc(operations.name),
        limit: reqDto.limit,
        offset: reqDto.offset,
        with: { creatorBy: true },
      }),
      this.db.select({ total: count() }).from(operations).where(filter),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(OperationResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** Unpaginated picker source (BOM step / outsourcing combobox) — capped, alphabetical. */
  async getOperationOptions(
    reqDto: GetOperationOptionsReqDto,
  ): Promise<OperationRefResDto[]> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const entities = await this.db.query.operations.findMany({
      where: and(
        isNull(operations.deletedAt),
        keyword ? unaccentILike(operations.name, keyword) : undefined,
        reqDto.type ? eq(operations.type, reqDto.type) : undefined,
        reqDto.status ? eq(operations.status, reqDto.status) : undefined,
      ),
      orderBy: asc(operations.name),
      limit: OPERATION_OPTIONS_LIMIT,
    });

    return plainToInstance(OperationRefResDto, entities, {
      excludeExtraneousValues: true,
    });
  }

  async getOperation(operationId: string): Promise<OperationResDto> {
    const operation = await this.db.query.operations.findFirst({
      where: and(eq(operations.id, operationId), isNull(operations.deletedAt)),
      with: { creatorBy: true },
    });

    if (!operation) {
      throw new AppException(ErrorCode.E046, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(OperationResDto, operation, {
      excludeExtraneousValues: true,
    });
  }

  async getOperationAssignments(
    operationId: string,
    reqDto: GetOperationAssignmentsReqDto,
  ): Promise<OffsetPaginatedDto<PageUserResDto>> {
    await this.ensureOperationExists(operationId);

    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    // Same row shape and hidden-account rule as the staff list (`UsersService.getUsers`), so the
    // operation detail table can show the full profile columns.
    const filter = and(
      eq(operationAssignments.operationId, operationId),
      isNull(users.deletedAt),
      or(isNull(credentials.isProtected), eq(credentials.isProtected, false)),
      reqDto.departmentId
        ? eq(users.departmentId, reqDto.departmentId)
        : undefined,
      reqDto.positionId ? eq(users.positionId, reqDto.positionId) : undefined,
      keyword
        ? or(unaccentILike(users.fullName, keyword), ilike(users.code, keyword))
        : undefined,
    );

    const [entities, [{ total }]] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(users),
          department: getTableColumns(departments),
          position: getTableColumns(positions),
          avatarFile: getTableColumns(files),
          email: credentials.email,
          role: getTableColumns(roles),
        })
        .from(operationAssignments)
        .innerJoin(users, eq(users.id, operationAssignments.userId))
        .innerJoin(departments, eq(departments.id, users.departmentId))
        .innerJoin(positions, eq(positions.id, users.positionId))
        .leftJoin(files, eq(files.id, users.avatarFileId))
        .leftJoin(credentials, eq(credentials.userId, users.id))
        .leftJoin(roles, eq(roles.id, credentials.roleId))
        .where(filter)
        .orderBy(asc(users.fullName))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(operationAssignments)
        .innerJoin(users, eq(users.id, operationAssignments.userId))
        .leftJoin(credentials, eq(credentials.userId, users.id))
        .where(filter),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageUserResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** Every assigned user id, unpaginated and unfiltered — the current selection the bulk-assign
   * dialog starts from (and what `PUT .../assignments` replaces), so it must not miss anyone the
   * paged list hides (e.g. a protected account). */
  async getOperationAssignmentIds(operationId: string): Promise<string[]> {
    await this.ensureOperationExists(operationId);

    const rows = await this.db
      .select({ userId: operationAssignments.userId })
      .from(operationAssignments)
      .where(eq(operationAssignments.operationId, operationId));

    return rows.map((row) => row.userId);
  }

  async createOperation(
    reqDto: CreateOperationReqDto,
    userId: string,
  ): Promise<void> {
    await this.validateCodeUniqueness(reqDto.code);

    try {
      await this.db.insert(operations).values({ ...reqDto, createdBy: userId });
    } catch (error) {
      // Chốt chặn unique constraint cho race giữa 2 request cùng lúc cấp trùng số.
      if (extractPostgresError(error)?.code === '23505') {
        throw new AppException(ErrorCode.E047, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async updateOperation(
    operationId: string,
    reqDto: UpdateOperationReqDto,
  ): Promise<void> {
    await this.ensureOperationExists(operationId);

    if (reqDto.code) {
      await this.validateCodeUniqueness(reqDto.code, operationId);
    }

    if (hasFields(reqDto)) {
      await this.db
        .update(operations)
        .set(reqDto)
        .where(eq(operations.id, operationId));
    }
  }

  async setOperationAssignments(
    operationId: string,
    reqDto: UpdateOperationAssignmentsReqDto,
  ): Promise<void> {
    await this.ensureOperationExists(operationId);
    const userIds = [...new Set(reqDto.userIds)];
    await this.ensureUsersAssignable(userIds);

    await this.db.transaction(async (tx) => {
      await tx
        .delete(operationAssignments)
        .where(eq(operationAssignments.operationId, operationId));

      if (userIds.length > 0) {
        await tx
          .insert(operationAssignments)
          .values(userIds.map((userId) => ({ operationId, userId })));
      }
    });
  }

  async deleteOperation(operationId: string): Promise<void> {
    await this.ensureOperationExists(operationId);
    await this.ensureOperationIsDeletable(operationId);

    await this.db
      .update(operations)
      .set({ deletedAt: new Date() })
      .where(eq(operations.id, operationId));
  }

  private async ensureOperationExists(operationId: string): Promise<void> {
    const [existing] = await this.db
      .select({ id: operations.id })
      .from(operations)
      .where(and(eq(operations.id, operationId), isNull(operations.deletedAt)))
      .limit(1);

    if (!existing) {
      throw new AppException(ErrorCode.E046, HttpStatus.NOT_FOUND);
    }
  }

  private async validateCodeUniqueness(
    code: string,
    ignoredOperationId?: string,
  ): Promise<void> {
    // Không lọc `isNull(deletedAt)` — `code` là `unique()` trần trên cả bảng
    // (`.claude/rules/database.md`, Soft delete), một dòng đã xoá mềm vẫn giữ mã đó.
    const [existing] = await this.db
      .select({ id: operations.id })
      .from(operations)
      .where(
        and(
          eq(operations.code, code),
          ignoredOperationId
            ? ne(operations.id, ignoredOperationId)
            : undefined,
        ),
      )
      .limit(1);

    if (existing) {
      throw new AppException(ErrorCode.E047, HttpStatus.CONFLICT);
    }
  }

  /** Chặn xoá khi còn `bom_operations` trỏ tới (kể cả bước của node ROOT, "Cấp 0" — từ
   * `docs/decisions/root-bom-item.md` không còn bảng `routing_operations` riêng) — FK là
   * `restrict`, xoá mềm không tự kích hoạt ràng buộc đó nên phải tự kiểm ở tầng service. */
  private async ensureOperationIsDeletable(operationId: string): Promise<void> {
    const [bomOperation] = await this.db
      .select({ id: bomOperations.id })
      .from(bomOperations)
      .where(eq(bomOperations.operationId, operationId))
      .limit(1);

    if (bomOperation) {
      throw new AppException(ErrorCode.E248, HttpStatus.CONFLICT);
    }
  }

  /** Mọi `userIds` phải là người đang làm việc (chưa nghỉ việc, chưa xoá mềm). */
  private async ensureUsersAssignable(userIds: string[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }

    const workingUsers = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          inArray(users.id, userIds),
          eq(users.status, UserStatus.WORKING),
          isNull(users.deletedAt),
        ),
      );

    if (workingUsers.length !== userIds.length) {
      throw new AppException(ErrorCode.E278, HttpStatus.BAD_REQUEST);
    }
  }
}
