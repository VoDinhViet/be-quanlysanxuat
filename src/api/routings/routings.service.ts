import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  items,
  ItemType,
  operations,
  routingOperations,
  routings,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateRoutingOperationReqDto } from './dto/create-routing-operation.req.dto';
import { RoutingOperationResDto } from './dto/routing-operation.res.dto';
import { UpdateRoutingOperationReqDto } from './dto/update-routing-operation.req.dto';

/** Cấp 0 routing của một item (FG/WIP) — header `routings` sinh lười lúc ghi dòng đầu tiên, cùng
 * khuôn `BomsService.getOrCreateBomId`. Body rows sống ở `routing_operations`. */
@Injectable()
export class RoutingsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getRoutingOperations(
    itemId: string,
  ): Promise<RoutingOperationResDto[]> {
    await this.ensureItemExists(itemId);

    const routing = await this.db.query.routings.findFirst({
      columns: { id: true },
      where: eq(routings.itemId, itemId),
    });

    if (!routing) {
      return [];
    }

    const rows = await this.db.query.routingOperations.findMany({
      where: eq(routingOperations.routingId, routing.id),
      with: { operation: true },
      orderBy: [
        asc(routingOperations.sortOrder),
        asc(routingOperations.createdAt),
      ],
    });

    return rows.map((row) =>
      plainToInstance(RoutingOperationResDto, row, {
        excludeExtraneousValues: true,
      }),
    );
  }

  async createRoutingOperation(
    itemId: string,
    reqDto: CreateRoutingOperationReqDto,
    userId: string,
  ): Promise<void> {
    await this.ensureItemExists(itemId);
    await this.ensureOperationExists(reqDto.operationId);

    await this.db.transaction(async (tx) => {
      const routingId = await this.getOrCreateRoutingId(tx, itemId, userId);

      await tx.insert(routingOperations).values({
        routingId,
        operationId: reqDto.operationId,
        sortOrder: reqDto.sortOrder ?? 0,
        note: reqDto.note,
        createdBy: userId,
      });
    });
  }

  /** `operationId` bất biến — đổi công đoạn của một bước nghĩa là xoá + thêm lại. */
  async updateRoutingOperation(
    itemId: string,
    stepId: string,
    reqDto: UpdateRoutingOperationReqDto,
  ): Promise<void> {
    await this.ensureItemExists(itemId);
    const routing = await this.getRoutingOrThrow(itemId);
    await this.ensureRoutingOperationExists(routing.id, stepId);

    await this.db
      .update(routingOperations)
      .set(reqDto)
      .where(
        and(
          eq(routingOperations.id, stepId),
          eq(routingOperations.routingId, routing.id),
        ),
      );
  }

  async deleteRoutingOperation(itemId: string, stepId: string): Promise<void> {
    await this.ensureItemExists(itemId);
    const routing = await this.getRoutingOrThrow(itemId);
    await this.ensureRoutingOperationExists(routing.id, stepId);

    await this.db
      .delete(routingOperations)
      .where(
        and(
          eq(routingOperations.id, stepId),
          eq(routingOperations.routingId, routing.id),
        ),
      );
  }

  /** Header `routings` sinh lười — get-or-create trong transaction ghi bước đầu tiên của item.
   * `onConflictDoNothing` là chốt chặn race thật; đọc trước transaction chỉ để tránh round-trip
   * insert thừa khi header đã chắc chắn có sẵn. */
  private async getOrCreateRoutingId(
    tx: DbTransaction,
    itemId: string,
    userId: string,
  ): Promise<string> {
    const existing = await tx.query.routings.findFirst({
      columns: { id: true },
      where: eq(routings.itemId, itemId),
    });
    if (existing) {
      return existing.id;
    }

    const [created] = await tx
      .insert(routings)
      .values({ itemId, createdBy: userId })
      .onConflictDoNothing({ target: routings.itemId })
      .returning({ id: routings.id });

    return (
      created?.id ??
      (await tx.query.routings.findFirst({
        columns: { id: true },
        where: eq(routings.itemId, itemId),
      }))!.id
    );
  }

  private async getRoutingOrThrow(itemId: string): Promise<{ id: string }> {
    const routing = await this.db.query.routings.findFirst({
      columns: { id: true },
      where: eq(routings.itemId, itemId),
    });

    if (!routing) {
      throw new AppException(ErrorCode.E056, HttpStatus.NOT_FOUND);
    }

    return routing;
  }

  private async ensureRoutingOperationExists(
    routingId: string,
    stepId: string,
  ): Promise<void> {
    const existing = await this.db.query.routingOperations.findFirst({
      columns: { id: true },
      where: and(
        eq(routingOperations.id, stepId),
        eq(routingOperations.routingId, routingId),
      ),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E056, HttpStatus.NOT_FOUND);
    }
  }

  /** RM không có routing Cấp 0 — chỉ FG/WIP mới có cấu trúc/công đoạn của chính nó. */
  private async ensureItemExists(itemId: string): Promise<void> {
    const existing = await this.db.query.items.findFirst({
      columns: { id: true, type: true },
      where: and(eq(items.id, itemId), isNull(items.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }
    if (existing.type === ItemType.RM) {
      throw new AppException(ErrorCode.E111, HttpStatus.BAD_REQUEST);
    }
  }

  /** Trùng check tồn tại với `OperationsService.ensureOperationExists` — cố ý không inject qua DI
   * để module này đứng độc lập, giống cách `BomsService.ensureBomNodeItemValid` tự query. */
  private async ensureOperationExists(operationId: string): Promise<void> {
    const existing = await this.db.query.operations.findFirst({
      columns: { id: true },
      where: and(eq(operations.id, operationId), isNull(operations.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E046, HttpStatus.NOT_FOUND);
    }
  }
}
