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
import {
  boms,
  ItemType,
  operations,
  routingOperations,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateRoutingOperationReqDto } from './dto/create-routing-operation.req.dto';
import { GetRoutingOperationsReqDto } from './dto/get-routing-operations.req.dto';
import { RoutingOperationResDto } from './dto/routing-operation.res.dto';
import { UpdateRoutingOperationReqDto } from './dto/update-routing-operation.req.dto';

/**
 * Công đoạn Cấp 0 (as-used của chính item FG gốc, không phải một node `bom_items`) — bảng riêng
 * `routing_operations`, neo `boms.id`. Xem `docs/decisions/routing-operations-table.md`.
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
      keyword
        ? or(
            unaccentILike(operations.code, keyword),
            unaccentILike(operations.name, keyword),
          )
        : undefined,
    );

    const [rows, countRows] = await Promise.all([
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
      plainToInstance(RoutingOperationResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async createOperation(
    itemId: string,
    reqDto: CreateRoutingOperationReqDto,
    userId: string,
  ): Promise<RoutingOperationResDto> {
    const item = await this.bomsService.ensureItemExists(itemId);
    if (item.type === ItemType.CONSUMABLE) {
      throw new AppException(ErrorCode.E111, HttpStatus.BAD_REQUEST);
    }
    await this.ensureOperationExists(reqDto.operationId);

    const [existingBom] = await this.db
      .select({ id: boms.id })
      .from(boms)
      .where(eq(boms.itemId, itemId))
      .limit(1);

    const rowId = await this.db.transaction(async (tx) => {
      const { bomId } = await this.bomsService.getOrCreateBomId(
        tx,
        itemId,
        existingBom?.id,
        userId,
      );

      const [row] = await tx
        .insert(routingOperations)
        .values({
          bomId,
          operationId: reqDto.operationId,
          type: reqDto.type,
          sortOrder: reqDto.sortOrder ?? 0,
          note: reqDto.note,
          createdBy: userId,
        })
        .returning({ id: routingOperations.id });

      return row.id;
    });

    return this.getOperation(rowId);
  }

  /** Chỉ sửa STT/note — `operationId` bất biến, đổi thì xoá + thêm lại. */
  async updateOperation(
    itemId: string,
    stepId: string,
    reqDto: UpdateRoutingOperationReqDto,
  ): Promise<RoutingOperationResDto> {
    await this.bomsService.ensureItemExists(itemId);
    const bom = await this.ensureRoutingOperationExists(itemId, stepId);

    await this.db
      .update(routingOperations)
      .set(reqDto)
      .where(
        and(
          eq(routingOperations.id, stepId),
          eq(routingOperations.bomId, bom.id),
        ),
      );

    return this.getOperation(stepId);
  }

  async deleteOperation(itemId: string, stepId: string): Promise<void> {
    await this.bomsService.ensureItemExists(itemId);
    const bom = await this.ensureRoutingOperationExists(itemId, stepId);

    await this.db
      .delete(routingOperations)
      .where(
        and(
          eq(routingOperations.id, stepId),
          eq(routingOperations.bomId, bom.id),
        ),
      );
  }

  private async getOperation(id: string): Promise<RoutingOperationResDto> {
    const row = await this.db.query.routingOperations.findFirst({
      where: eq(routingOperations.id, id),
      with: { operation: true },
    });

    if (!row) {
      throw new AppException(ErrorCode.E109, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(RoutingOperationResDto, row, {
      excludeExtraneousValues: true,
    });
  }

  /** Trùng check tồn tại với `OperationsService.ensureOperationExists` — cố ý không inject qua DI
   * để module này đứng độc lập, giống cách `BomOperationsService` tự query. */
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

  /** Chưa có `boms` header nghĩa là chưa từng có `routing_operations` nào — `E109` thẳng, không
   * cần phân biệt "item chưa có BOM" khỏi "step không tồn tại". */
  private async ensureRoutingOperationExists(
    itemId: string,
    stepId: string,
  ): Promise<{ id: string }> {
    const [bom] = await this.db
      .select({ id: boms.id })
      .from(boms)
      .where(eq(boms.itemId, itemId))
      .limit(1);

    if (!bom) {
      throw new AppException(ErrorCode.E109, HttpStatus.NOT_FOUND);
    }

    const [existing] = await this.db
      .select({ id: routingOperations.id })
      .from(routingOperations)
      .where(
        and(
          eq(routingOperations.id, stepId),
          eq(routingOperations.bomId, bom.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppException(ErrorCode.E109, HttpStatus.NOT_FOUND);
    }

    return bom;
  }
}
