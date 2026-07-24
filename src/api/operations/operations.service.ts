import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, eq, isNull, ne } from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { operations } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateOperationReqDto } from './dto/create-operation.req.dto';
import { GetOperationsReqDto } from './dto/get-operations.req.dto';
import { OperationResDto } from './dto/operation.res.dto';
import { UpdateOperationReqDto } from './dto/update-operation.req.dto';

@Injectable()
export class OperationsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getOperations(
    reqDto: GetOperationsReqDto,
  ): Promise<OffsetPaginatedDto<OperationResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      isNull(operations.deletedAt),
      keyword ? unaccentILike(operations.name, keyword) : undefined,
      reqDto.type ? eq(operations.type, reqDto.type) : undefined,
      reqDto.status ? eq(operations.status, reqDto.status) : undefined,
    );
    const orderBy = desc(operations.createdAt);

    const [entities, countRows] = await Promise.all([
      this.db.query.operations.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
        with: { creator: true },
      }),
      this.db.select({ total: count() }).from(operations).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(OperationResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getOperationDetail(operationId: string): Promise<OperationResDto> {
    const operation = await this.db.query.operations.findFirst({
      where: and(eq(operations.id, operationId), isNull(operations.deletedAt)),
      with: { creator: true },
    });

    if (!operation) {
      throw new AppException(ErrorCode.E046, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(OperationResDto, operation, {
      excludeExtraneousValues: true,
    });
  }

  async createOperation(
    reqDto: CreateOperationReqDto,
    userId: string,
  ): Promise<OperationResDto> {
    let code = reqDto.code;
    if (code) {
      await this.validateCodeUniqueness(code);
    } else {
      code = await this.generateOperationCode();
    }

    const [operation] = await this.db
      .insert(operations)
      .values({ ...reqDto, code, createdBy: userId })
      .returning();

    return this.getOperationDetail(operation.id);
  }

  async updateOperation(
    operationId: string,
    reqDto: UpdateOperationReqDto,
  ): Promise<OperationResDto> {
    await this.ensureOperationExists(operationId);

    if (reqDto.code) {
      await this.validateCodeUniqueness(reqDto.code, operationId);
    }

    await this.db
      .update(operations)
      .set({ ...reqDto, updatedAt: new Date() })
      .where(eq(operations.id, operationId));

    return this.getOperationDetail(operationId);
  }

  async deleteOperation(operationId: string): Promise<void> {
    await this.ensureOperationExists(operationId);

    await this.db
      .update(operations)
      .set({ deletedAt: new Date() })
      .where(eq(operations.id, operationId));
  }

  private async ensureOperationExists(operationId: string) {
    const existing = await this.db.query.operations.findFirst({
      where: and(eq(operations.id, operationId), isNull(operations.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E046, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private async validateCodeUniqueness(
    code: string,
    ignoredOperationId?: string,
  ): Promise<void> {
    const where = ignoredOperationId
      ? and(eq(operations.code, code), ne(operations.id, ignoredOperationId))
      : eq(operations.code, code);

    const existing = await this.db.query.operations.findFirst({
      columns: { id: true },
      where,
    });

    if (existing) {
      throw new AppException(ErrorCode.E047, HttpStatus.CONFLICT);
    }
  }

  private async generateOperationCode(): Promise<string> {
    const [totalRows] = await this.db
      .select({ total: count() })
      .from(operations);
    return `CD${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }
}
