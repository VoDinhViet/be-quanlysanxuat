import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';

import { hasFields } from '../../common/utils/object.util';
import { extractPostgresError } from '../../common/utils/postgres-error.util';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  bomOperations,
  operations,
  routingOperations,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateOperationReqDto } from './dto/create-operation.req.dto';
import { GetOperationsReqDto } from './dto/get-operations.req.dto';
import { OperationResDto } from './dto/operation.res.dto';
import { UpdateOperationReqDto } from './dto/update-operation.req.dto';

@Injectable()
export class OperationsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getOperations(reqDto: GetOperationsReqDto): Promise<OperationResDto[]> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const entities = await this.db.query.operations.findMany({
      where: and(
        isNull(operations.deletedAt),
        keyword ? unaccentILike(operations.name, keyword) : undefined,
        reqDto.type ? eq(operations.type, reqDto.type) : undefined,
        reqDto.status ? eq(operations.status, reqDto.status) : undefined,
      ),
      // Alphabetical, because this list is rendered straight into a dropdown/table.
      orderBy: asc(operations.name),
      with: { creatorBy: true },
    });

    return plainToInstance(OperationResDto, entities, {
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

  async createOperation(
    reqDto: CreateOperationReqDto,
    userId: string,
  ): Promise<void> {
    await this.validateCodeUniqueness(reqDto.code);

    try {
      await this.db.insert(operations).values({ ...reqDto, createdBy: userId });
    } catch (error) {
      // Mã client tự gửi vẫn còn TOCTOU giữa `validateCodeUniqueness` và `INSERT` — bắt ở đây thay
      // vì để lỗi Postgres thô 500 lọt ra ngoài.
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

  async deleteOperation(operationId: string): Promise<void> {
    await this.ensureOperationExists(operationId);
    await this.ensureOperationNotInUse(operationId);

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

  /** Chặn xoá khi còn `routing_operations`/`bom_operations` trỏ tới — cả hai FK là `restrict`, xoá
   * mềm không tự kích hoạt ràng buộc đó nên phải tự kiểm ở tầng service. */
  private async ensureOperationNotInUse(operationId: string): Promise<void> {
    const [[usedInRouting], [usedInBom]] = await Promise.all([
      this.db
        .select({ id: routingOperations.id })
        .from(routingOperations)
        .where(eq(routingOperations.operationId, operationId))
        .limit(1),
      this.db
        .select({ id: bomOperations.id })
        .from(bomOperations)
        .where(eq(bomOperations.operationId, operationId))
        .limit(1),
    ]);

    if (usedInRouting || usedInBom) {
      throw new AppException(ErrorCode.E248, HttpStatus.CONFLICT);
    }
  }
}
