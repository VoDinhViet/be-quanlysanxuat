import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, eq, getTableColumns, or, sql } from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { departments, positions, users } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateDepartmentReqDto } from './dto/create-department.req.dto';
import { DepartmentDetailResDto } from './dto/department-detail.res.dto';
import { DepartmentResDto } from './dto/department.res.dto';
import { GetDepartmentsReqDto } from './dto/get-departments.req.dto';
import { UpdateDepartmentReqDto } from './dto/update-department.req.dto';

@Injectable()
export class DepartmentsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Chức vụ theo phòng ban, gộp nhóm — LEFT JOIN vào `departments` để `positionCount` ra ngay
   * trong cùng một `.select()`, không cần round-trip riêng. Dựng lại mỗi lần gọi (như
   * `outboundHeldQuantityByItemSubquery`) — subquery Drizzle dùng một lần. */
  private positionCountSubquery() {
    return this.db
      .select({
        departmentId: positions.departmentId,
        positionTotal: count().as('position_total'),
      })
      .from(positions)
      .groupBy(positions.departmentId)
      .as('department_position_count');
  }

  /** Nhân sự theo phòng ban, cùng khuôn `positionCountSubquery`. */
  private employeeCountSubquery() {
    return this.db
      .select({
        departmentId: users.departmentId,
        employeeTotal: count().as('employee_total'),
      })
      .from(users)
      .groupBy(users.departmentId)
      .as('department_employee_count');
  }

  async getDepartments(
    reqDto: GetDepartmentsReqDto,
  ): Promise<OffsetPaginatedDto<DepartmentDetailResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      keyword
        ? or(
            unaccentILike(departments.code, keyword),
            unaccentILike(departments.name, keyword),
          )
        : undefined,
      reqDto.isActive !== undefined
        ? eq(departments.isActive, reqDto.isActive)
        : undefined,
    );
    const orderBy = desc(departments.createdAt);

    const positionCounts = this.positionCountSubquery();
    const employeeCounts = this.employeeCountSubquery();

    const [entities, countRows] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(departments),
          positionCount:
            sql<number>`coalesce(${positionCounts.positionTotal}, 0)`.mapWith(
              Number,
            ),
          employeeCount:
            sql<number>`coalesce(${employeeCounts.employeeTotal}, 0)`.mapWith(
              Number,
            ),
        })
        .from(departments)
        .leftJoin(
          positionCounts,
          eq(positionCounts.departmentId, departments.id),
        )
        .leftJoin(
          employeeCounts,
          eq(employeeCounts.departmentId, departments.id),
        )
        .where(where)
        .orderBy(orderBy)
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db.select({ total: count() }).from(departments).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(DepartmentDetailResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getDepartment(id: string): Promise<DepartmentDetailResDto> {
    const positionCounts = this.positionCountSubquery();
    const employeeCounts = this.employeeCountSubquery();

    const [department] = await this.db
      .select({
        ...getTableColumns(departments),
        positionCount:
          sql<number>`coalesce(${positionCounts.positionTotal}, 0)`.mapWith(
            Number,
          ),
        employeeCount:
          sql<number>`coalesce(${employeeCounts.employeeTotal}, 0)`.mapWith(
            Number,
          ),
      })
      .from(departments)
      .leftJoin(positionCounts, eq(positionCounts.departmentId, departments.id))
      .leftJoin(employeeCounts, eq(employeeCounts.departmentId, departments.id))
      .where(eq(departments.id, id));

    if (!department) {
      throw new AppException(ErrorCode.E014, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(DepartmentDetailResDto, department, {
      excludeExtraneousValues: true,
    });
  }

  async createDepartment(
    reqDto: CreateDepartmentReqDto,
  ): Promise<DepartmentResDto> {
    const existing = await this.db.query.departments.findFirst({
      where: eq(departments.code, reqDto.code),
    });
    if (existing) {
      throw new AppException(ErrorCode.E266, HttpStatus.CONFLICT);
    }

    const [created] = await this.db
      .insert(departments)
      .values({
        code: reqDto.code,
        name: reqDto.name,
        description: reqDto.description,
        isActive: reqDto.isActive ?? true,
      })
      .returning();

    return plainToInstance(DepartmentResDto, created, {
      excludeExtraneousValues: true,
    });
  }

  async updateDepartment(
    id: string,
    reqDto: UpdateDepartmentReqDto,
  ): Promise<DepartmentResDto> {
    const existing = await this.db.query.departments.findFirst({
      where: eq(departments.id, id),
    });
    if (!existing) {
      throw new AppException(ErrorCode.E014, HttpStatus.NOT_FOUND);
    }

    if (reqDto.code && reqDto.code !== existing.code) {
      const codeConflict = await this.db.query.departments.findFirst({
        where: eq(departments.code, reqDto.code),
      });
      if (codeConflict) {
        throw new AppException(ErrorCode.E266, HttpStatus.CONFLICT);
      }
    }

    const [updated] = await this.db
      .update(departments)
      .set({
        code: reqDto.code ?? existing.code,
        name: reqDto.name ?? existing.name,
        description:
          reqDto.description !== undefined
            ? reqDto.description
            : existing.description,
        isActive:
          reqDto.isActive !== undefined ? reqDto.isActive : existing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(departments.id, id))
      .returning();

    return plainToInstance(DepartmentResDto, updated, {
      excludeExtraneousValues: true,
    });
  }

  async deleteDepartment(id: string): Promise<void> {
    const existing = await this.db.query.departments.findFirst({
      where: eq(departments.id, id),
    });
    if (!existing) {
      throw new AppException(ErrorCode.E014, HttpStatus.NOT_FOUND);
    }

    const [posInUse, userInUse] = await Promise.all([
      this.db.query.positions.findFirst({
        where: eq(positions.departmentId, id),
      }),
      this.db.query.users.findFirst({
        where: eq(users.departmentId, id),
      }),
    ]);
    if (posInUse || userInUse) {
      throw new AppException(ErrorCode.E267, HttpStatus.CONFLICT);
    }

    await this.db.delete(departments).where(eq(departments.id, id));
  }
}
