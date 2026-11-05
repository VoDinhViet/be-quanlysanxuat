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
  boms,
  ItemOperationLogAction,
  itemOperationLogs,
  ItemType,
  operations,
  OperationType,
  routingOperations,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateRoutingOperationReqDto } from './dto/create-routing-operation.req.dto';
import { GetRoutingOperationsReqDto } from './dto/get-routing-operations.req.dto';
import { RoutingOperationResDto } from './dto/routing-operation.res.dto';
import { UpdateRoutingOperationReqDto } from './dto/update-routing-operation.req.dto';

/**
 * Công đoạn Cấp 0 (as-used của chính item FG gốc, không phải một node `bom_items`) — bảng riêng
 * `routing_operations`, neo `boms.id`.
 */
@Injectable()
export class RoutingsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly bomsService: BomsService,
  ) {}

  async getOperations(
    itemId: string,
    reqDto: GetRoutingOperationsReqDto,
  ): Promise<OffsetPaginatedDto<RoutingOperationResDto>> {
    await this.bomsService.ensureItemExists(itemId);

    const [bom] = await this.db
      .select({ id: boms.id })
      .from(boms)
      .where(eq(boms.itemId, itemId))
      .limit(1);

    // Chưa có `boms` header → chưa từng ghi gì (BOM lẫn routing) — mảng rỗng, không phải lỗi.
    if (!bom) {
      return new OffsetPaginatedDto([], new OffsetPaginationDto(0, reqDto));
    }

    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      eq(routingOperations.bomId, bom.id),
      isNull(routingOperations.deletedAt),
      keyword
        ? or(
            unaccentILike(operations.code, keyword),
            unaccentILike(operations.name, keyword),
          )
        : undefined,
    );

    const [routingSteps, [{ total }]] = await Promise.all([
      this.db.query.routingOperations.findMany({
        where,
        with: { operation: true },
        orderBy: [
          asc(routingOperations.sortOrder),
          asc(routingOperations.createdAt),
        ],
        limit: reqDto.limit,
        offset: reqDto.offset,
      }),
      this.db
        .select({ total: count() })
        .from(routingOperations)
        .innerJoin(operations, eq(routingOperations.operationId, operations.id))
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(RoutingOperationResDto, routingSteps, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  async createOperation(
    itemId: string,
    reqDto: CreateRoutingOperationReqDto,
    userId: string,
  ): Promise<RoutingOperationResDto> {
    const item = await this.bomsService.ensureItemExists(itemId);
    if (item.type === ItemType.DIRECT) {
      throw new AppException(ErrorCode.E111, HttpStatus.BAD_REQUEST);
    }
    const operation = await this.ensureOperationExists(reqDto.operationId);

    const [existingBom] = await this.db
      .select({ id: boms.id })
      .from(boms)
      .where(eq(boms.itemId, itemId))
      .limit(1);

    const createdStepId = await this.db.transaction(async (tx) => {
      const { bomId } = await this.bomsService.getOrCreateBomId(
        tx,
        itemId,
        existingBom?.id,
        userId,
      );

      const [createdStep] = await tx
        .insert(routingOperations)
        .values({
          bomId,
          operationId: reqDto.operationId,
          type: operation.type,
          sortOrder: reqDto.sortOrder ?? 0,
          note: reqDto.note,
          createdBy: userId,
        })
        .returning({
          id: routingOperations.id,
          operationId: routingOperations.operationId,
          type: routingOperations.type,
          sortOrder: routingOperations.sortOrder,
          note: routingOperations.note,
        });

      await tx.insert(itemOperationLogs).values(
        buildItemOperationLog({
          itemId,
          action: ItemOperationLogAction.CREATED,
          step: {
            ...createdStep,
            operationCode: operation.code,
            operationName: operation.name,
          },
          performedBy: userId,
        }),
      );

      return createdStep.id;
    });

    return this.getOperation(createdStepId);
  }

  /** Chỉ sửa STT/note — `operationId` bất biến, đổi thì xoá + thêm lại. */
  async updateOperation(
    itemId: string,
    stepId: string,
    reqDto: UpdateRoutingOperationReqDto,
    userId: string,
  ): Promise<RoutingOperationResDto> {
    await this.bomsService.ensureItemExists(itemId);

    await this.db.transaction(async (tx) => {
      const step = await this.lockActiveStep(tx, itemId, stepId);

      await tx
        .update(routingOperations)
        .set(reqDto)
        .where(eq(routingOperations.id, stepId));

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

    return this.getOperation(stepId);
  }

  async deleteOperation(
    itemId: string,
    stepId: string,
    userId: string,
  ): Promise<void> {
    await this.bomsService.ensureItemExists(itemId);

    await this.db.transaction(async (tx) => {
      const step = await this.lockActiveStep(tx, itemId, stepId);

      await tx.insert(itemOperationLogs).values(
        buildItemOperationLog({
          itemId,
          action: ItemOperationLogAction.DELETED,
          step,
          performedBy: userId,
        }),
      );

      await tx
        .update(routingOperations)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(eq(routingOperations.id, stepId));
    });
  }

  /** Khoá dòng để hai request đồng thời không cùng ghi log cho một lần sửa/xoá: request đến sau đọc
   * lại thấy `deletedAt` đã có và nhận `E109`. */
  private async lockActiveStep(
    tx: DbTransaction,
    itemId: string,
    stepId: string,
  ) {
    const [step] = await tx
      .select({
        id: routingOperations.id,
        operationId: routingOperations.operationId,
        operationCode: operations.code,
        operationName: operations.name,
        type: routingOperations.type,
        sortOrder: routingOperations.sortOrder,
        note: routingOperations.note,
      })
      .from(routingOperations)
      .innerJoin(operations, eq(operations.id, routingOperations.operationId))
      .innerJoin(boms, eq(boms.id, routingOperations.bomId))
      .where(
        and(
          eq(routingOperations.id, stepId),
          eq(boms.itemId, itemId),
          isNull(routingOperations.deletedAt),
        ),
      )
      .limit(1)
      .for('update', { of: routingOperations });

    if (!step) {
      throw new AppException(ErrorCode.E109, HttpStatus.NOT_FOUND);
    }

    return step;
  }

  private async getOperation(stepId: string): Promise<RoutingOperationResDto> {
    const routingStep = await this.db.query.routingOperations.findFirst({
      where: and(
        eq(routingOperations.id, stepId),
        isNull(routingOperations.deletedAt),
      ),
      with: { operation: true },
    });

    if (!routingStep) {
      throw new AppException(ErrorCode.E109, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(RoutingOperationResDto, routingStep, {
      excludeExtraneousValues: true,
    });
  }

  /** Trùng check tồn tại với `OperationsService.ensureOperationExists` — cố ý không inject qua DI
   * để module này đứng độc lập, giống cách `BomOperationsService` tự query. */
  private async ensureOperationExists(
    operationId: string,
  ): Promise<{ id: string; code: string; name: string; type: OperationType }> {
    const [existing] = await this.db
      .select({
        id: operations.id,
        code: operations.code,
        name: operations.name,
        type: operations.type,
      })
      .from(operations)
      .where(and(eq(operations.id, operationId), isNull(operations.deletedAt)))
      .limit(1);

    if (!existing) {
      throw new AppException(ErrorCode.E046, HttpStatus.NOT_FOUND);
    }

    return existing;
  }
}
