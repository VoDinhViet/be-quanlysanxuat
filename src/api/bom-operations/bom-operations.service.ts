import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, count, eq, isNull, or } from 'drizzle-orm';

import { BomsService } from '../boms/boms.service';
import {
  buildItemOperationLog,
  describeStepChanges,
} from '../boms/item-operation-log';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  bomItems,
  bomOperations,
  ItemOperationLogAction,
  itemOperationLogs,
  operations,
  OperationType,
} from '../../database/schemas';
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
      isNull(bomOperations.deletedAt),
      keyword
        ? or(
            unaccentILike(operations.code, keyword),
            unaccentILike(operations.name, keyword),
          )
        : undefined,
    );

    const [bomSteps, [{ total }]] = await Promise.all([
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
      plainToInstance(BomOperationResDto, bomSteps, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
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
    const operation = await this.ensureOperationExists(reqDto.operationId);

    const createdStepId = await this.db.transaction(async (tx) => {
      const part = await this.bomsService.lockActiveBomItem(tx, bomItemId);

      const [createdStep] = await tx
        .insert(bomOperations)
        .values({
          bomItemId,
          operationId: reqDto.operationId,
          type: operation.type,
          sortOrder: reqDto.sortOrder ?? 0,
          note: reqDto.note,
          createdBy: userId,
        })
        .returning({
          id: bomOperations.id,
          bomItemId: bomOperations.bomItemId,
          operationId: bomOperations.operationId,
          type: bomOperations.type,
          sortOrder: bomOperations.sortOrder,
          note: bomOperations.note,
        });

      await tx.insert(itemOperationLogs).values(
        buildItemOperationLog({
          itemId,
          action: ItemOperationLogAction.CREATED,
          step: {
            ...createdStep,
            operationCode: operation.code,
            operationName: operation.name,
            partCode: part.code,
          },
          performedBy: userId,
        }),
      );

      return createdStep.id;
    });

    return this.getBomOperation(createdStepId);
  }

  /** Chỉ sửa STT/note — `operationId` bất biến, đổi thì xoá + thêm lại. */
  async updateBomOperation(
    itemId: string,
    bomItemId: string,
    stepId: string,
    reqDto: UpdateBomOperationReqDto,
    userId: string,
  ): Promise<BomOperationResDto> {
    await this.bomsService.ensureItemExists(itemId);
    await this.bomsService.ensureBomItemInBom(itemId, bomItemId);

    await this.db.transaction(async (tx) => {
      const step = await this.lockActiveStep(tx, bomItemId, stepId);

      await tx
        .update(bomOperations)
        .set(reqDto)
        .where(eq(bomOperations.id, stepId));

      const changes = describeStepChanges(step, reqDto);
      if (changes) {
        await tx.insert(itemOperationLogs).values(
          buildItemOperationLog({
            itemId,
            action: ItemOperationLogAction.UPDATED,
            changes,
            step,
            performedBy: userId,
          }),
        );
      }
    });

    return this.getBomOperation(stepId);
  }

  async deleteBomOperation(
    itemId: string,
    bomItemId: string,
    stepId: string,
    userId: string,
  ): Promise<void> {
    await this.bomsService.ensureItemExists(itemId);
    await this.bomsService.ensureBomItemInBom(itemId, bomItemId);

    await this.db.transaction(async (tx) => {
      const step = await this.lockActiveStep(tx, bomItemId, stepId);

      await tx.insert(itemOperationLogs).values(
        buildItemOperationLog({
          itemId,
          action: ItemOperationLogAction.DELETED,
          step,
          performedBy: userId,
        }),
      );

      await tx
        .update(bomOperations)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(eq(bomOperations.id, stepId));
    });
  }

  /** Khoá dòng để hai request đồng thời không cùng ghi log cho một lần sửa/xoá: request đến sau đọc
   * lại thấy `deletedAt` đã có và nhận `E109`. */
  private async lockActiveStep(
    tx: DbTransaction,
    bomItemId: string,
    stepId: string,
  ) {
    const [step] = await tx
      .select({
        id: bomOperations.id,
        bomItemId: bomOperations.bomItemId,
        operationId: bomOperations.operationId,
        operationCode: operations.code,
        operationName: operations.name,
        type: bomOperations.type,
        sortOrder: bomOperations.sortOrder,
        note: bomOperations.note,
        partCode: bomItems.code,
      })
      .from(bomOperations)
      .innerJoin(operations, eq(operations.id, bomOperations.operationId))
      .innerJoin(bomItems, eq(bomItems.id, bomOperations.bomItemId))
      .where(
        and(
          eq(bomOperations.id, stepId),
          eq(bomOperations.bomItemId, bomItemId),
          isNull(bomOperations.deletedAt),
        ),
      )
      .limit(1)
      .for('update', { of: bomOperations });

    if (!step) {
      throw new AppException(ErrorCode.E109, HttpStatus.NOT_FOUND);
    }

    return step;
  }

  private async getBomOperation(stepId: string): Promise<BomOperationResDto> {
    const bomStep = await this.db.query.bomOperations.findFirst({
      where: and(eq(bomOperations.id, stepId), isNull(bomOperations.deletedAt)),
      with: { operation: true },
    });

    if (!bomStep) {
      throw new AppException(ErrorCode.E109, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(BomOperationResDto, bomStep, {
      excludeExtraneousValues: true,
    });
  }

  /** Trùng check tồn tại với `OperationsService.ensureOperationExists` — cố ý không inject qua DI
   * để module này đứng độc lập, giống cách `ItemsService` tự query. */
  private async ensureOperationExists(
    operationId: string,
  ): Promise<{ id: string; code: string; name: string; type: OperationType }> {
    const existing = await this.db.query.operations.findFirst({
      columns: { id: true, code: true, name: true, type: true },
      where: and(eq(operations.id, operationId), isNull(operations.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E046, HttpStatus.NOT_FOUND);
    }

    return existing;
  }
}
