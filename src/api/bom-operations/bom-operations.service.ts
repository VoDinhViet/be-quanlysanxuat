import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, count, eq, isNull, or } from 'drizzle-orm';

import { BomsService } from '../boms/boms.service';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { bomOperations, operations } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { BomOperationResDto } from './dto/bom-operation.res.dto';
import { CreateBomOperationReqDto } from './dto/create-bom-operation.req.dto';
import { GetBomOperationsReqDto } from './dto/get-bom-operations.req.dto';
import { UpdateBomOperationReqDto } from './dto/update-bom-operation.req.dto';

@Injectable()
export class BomOperationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly bomsService: BomsService,
  ) {}

  async getBomOperations(
    itemId: string,
    bomItemId: string,
    reqDto: GetBomOperationsReqDto,
  ): Promise<OffsetPaginatedDto<BomOperationResDto>> {
    await this.bomsService.ensureItemExists(itemId);
    await this.bomsService.ensureBomItemInBom(itemId, bomItemId);

    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      eq(bomOperations.bomItemId, bomItemId),
      keyword
        ? or(
            unaccentILike(operations.code, keyword),
            unaccentILike(operations.name, keyword),
          )
        : undefined,
    );

    const [rows, countRows] = await Promise.all([
      this.db.query.bomOperations.findMany({
        where,
        with: { operation: true },
        orderBy: [asc(bomOperations.sortOrder), asc(bomOperations.createdAt)],
        limit: reqDto.limit,
        offset: reqDto.offset,
      }),
      this.db
        .select({ total: count() })
        .from(bomOperations)
        .innerJoin(operations, eq(bomOperations.operationId, operations.id))
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(BomOperationResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async createBomOperation(
    itemId: string,
    bomItemId: string,
    reqDto: CreateBomOperationReqDto,
    userId: string,
  ): Promise<BomOperationResDto> {
    await this.bomsService.ensureItemExists(itemId);
    await this.bomsService.ensureBomItemInBom(itemId, bomItemId);
    await this.bomsService.ensureBomItemCanHaveOperations(bomItemId);
    await this.ensureOperationExists(reqDto.operationId);

    const [row] = await this.db
      .insert(bomOperations)
      .values({
        bomItemId,
        operationId: reqDto.operationId,
        sortOrder: reqDto.sortOrder ?? 0,
        note: reqDto.note,
        createdBy: userId,
      })
      .returning({ id: bomOperations.id });

    return this.getBomOperation(row.id);
  }

  /** Chỉ sửa STT/note — `operationId` bất biến, đổi thì xoá + thêm lại. */
  async updateBomOperation(
    itemId: string,
    bomItemId: string,
    stepId: string,
    reqDto: UpdateBomOperationReqDto,
  ): Promise<BomOperationResDto> {
    await this.bomsService.ensureItemExists(itemId);
    await this.bomsService.ensureBomItemInBom(itemId, bomItemId);
    await this.ensureBomOperationExists(bomItemId, stepId);

    await this.db
      .update(bomOperations)
      .set(reqDto)
      .where(
        and(
          eq(bomOperations.id, stepId),
          eq(bomOperations.bomItemId, bomItemId),
        ),
      );

    return this.getBomOperation(stepId);
  }

  async deleteBomOperation(
    itemId: string,
    bomItemId: string,
    stepId: string,
  ): Promise<void> {
    await this.bomsService.ensureItemExists(itemId);
    await this.bomsService.ensureBomItemInBom(itemId, bomItemId);
    await this.ensureBomOperationExists(bomItemId, stepId);

    await this.db
      .delete(bomOperations)
      .where(
        and(
          eq(bomOperations.id, stepId),
          eq(bomOperations.bomItemId, bomItemId),
        ),
      );
  }

  private async getBomOperation(id: string): Promise<BomOperationResDto> {
    const row = await this.db.query.bomOperations.findFirst({
      where: eq(bomOperations.id, id),
      with: { operation: true },
    });

    if (!row) {
      throw new AppException(ErrorCode.E109, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(BomOperationResDto, row, {
      excludeExtraneousValues: true,
    });
  }

  /** Trùng check tồn tại với `OperationsService.ensureOperationExists` — cố ý không inject qua DI
   * để module này đứng độc lập, giống cách `ItemsService` tự query. */
  private async ensureOperationExists(operationId: string): Promise<void> {
    const existing = await this.db.query.operations.findFirst({
      columns: { id: true },
      where: and(eq(operations.id, operationId), isNull(operations.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E046, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureBomOperationExists(
    bomItemId: string,
    stepId: string,
  ): Promise<void> {
    const existing = await this.db.query.bomOperations.findFirst({
      columns: { id: true },
      where: and(
        eq(bomOperations.id, stepId),
        eq(bomOperations.bomItemId, bomItemId),
      ),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E109, HttpStatus.NOT_FOUND);
    }
  }
}
