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
import { CreatePositionReqDto } from './dto/create-position.req.dto';
import { PositionResDto } from './dto/position.res.dto';
import { GetPositionsReqDto } from './dto/get-positions.req.dto';
import { UpdatePositionReqDto } from './dto/update-position.req.dto';

@Injectable()
export class PositionsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Nhân sự theo chức vụ, gộp nhóm — LEFT JOIN vào `positions` để `employeeCount` ra ngay trong
  // cùng một `.select()`, cùng khuôn với `DepartmentsService`'s `employeeCountSubquery`.
  private employeeCountSubquery() {
    return this.db
      .select({ positionId: users.positionId, total: count().as('total') })
      .from(users)
      .groupBy(users.positionId)
      .as('position_employee_count');
  }

  async getPositions(
    reqDto: GetPositionsReqDto,
  ): Promise<OffsetPaginatedDto<PositionResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      keyword
        ? or(
            unaccentILike(positions.code, keyword),
            unaccentILike(positions.name, keyword),
          )
        : undefined,
      reqDto.departmentId
        ? eq(positions.departmentId, reqDto.departmentId)
        : undefined,
    );
    const orderBy = desc(positions.createdAt);

    const employeeCounts = this.employeeCountSubquery();

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(positions),
          department: getTableColumns(departments),
          employeeCount:
            sql<number>`coalesce(${employeeCounts.total}, 0)`.mapWith(Number),
        })
        .from(positions)
        .innerJoin(departments, eq(departments.id, positions.departmentId))
        .leftJoin(employeeCounts, eq(employeeCounts.positionId, positions.id))
        .where(where)
        .orderBy(orderBy)
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db.select({ total: count() }).from(positions).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PositionResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  private async ensureDepartmentExists(departmentId: string): Promise<void> {
    const department = await this.db.query.departments.findFirst({
      where: eq(departments.id, departmentId),
    });
    if (!department) {
      throw new AppException(ErrorCode.E014, HttpStatus.NOT_FOUND);
    }
  }

  private async validatePositionCodeUniqueness(
    code: string,
    excludePositionId?: string,
  ): Promise<void> {
    const existing = await this.db.query.positions.findFirst({
      where: eq(positions.code, code),
    });
    if (existing && existing.id !== excludePositionId) {
      throw new AppException(ErrorCode.E268, HttpStatus.CONFLICT);
    }
  }

  async createPosition(reqDto: CreatePositionReqDto): Promise<void> {
    await this.ensureDepartmentExists(reqDto.departmentId);
    await this.validatePositionCodeUniqueness(reqDto.code);

    await this.db.insert(positions).values({
      departmentId: reqDto.departmentId,
      code: reqDto.code,
      name: reqDto.name,
      description: reqDto.description,
    });
  }

  async updatePosition(
    id: string,
    reqDto: UpdatePositionReqDto,
  ): Promise<void> {
    const existing = await this.db.query.positions.findFirst({
      where: eq(positions.id, id),
    });
    if (!existing) {
      throw new AppException(ErrorCode.E015, HttpStatus.NOT_FOUND);
    }

    if (reqDto.departmentId) {
      await this.ensureDepartmentExists(reqDto.departmentId);
    }
    if (reqDto.code && reqDto.code !== existing.code) {
      await this.validatePositionCodeUniqueness(reqDto.code, id);
    }

    await this.db
      .update(positions)
      .set({
        departmentId: reqDto.departmentId ?? existing.departmentId,
        code: reqDto.code ?? existing.code,
        name: reqDto.name ?? existing.name,
        description:
          reqDto.description !== undefined
            ? reqDto.description
            : existing.description,
        updatedAt: new Date(),
      })
      .where(eq(positions.id, id));
  }

  async deletePosition(id: string): Promise<void> {
    const existing = await this.db.query.positions.findFirst({
      where: eq(positions.id, id),
    });
    if (!existing) {
      throw new AppException(ErrorCode.E015, HttpStatus.NOT_FOUND);
    }

    const userInUse = await this.db.query.users.findFirst({
      where: eq(users.positionId, id),
    });
    if (userInUse) {
      throw new AppException(ErrorCode.E269, HttpStatus.CONFLICT);
    }

    await this.db.delete(positions).where(eq(positions.id, id));
  }
}
