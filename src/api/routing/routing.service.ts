import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  BomItemType,
  bomItems,
  operations,
  products,
  routingSteps,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateRoutingStepReqDto } from './dto/create-routing-step.req.dto';
import { RoutingStepResDto } from './dto/routing-step.res.dto';
import { UpdateRoutingStepReqDto } from './dto/update-routing-step.req.dto';

/**
 * Which routing a call is about: the Cấp 0 root product's own routing (`bomItemId` omitted), or
 * one specific BOM node's as-used routing (`bomItemId` set). `productId` is always present — for
 * the node case it's the URL's owning product, used to scope the node so a `bomItemId` from a
 * different product's tree can't be reached through this product's URL.
 */
type RoutingTarget = { productId: string; bomItemId?: string };

@Injectable()
export class RoutingService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getRouting(target: RoutingTarget): Promise<RoutingStepResDto[]> {
    await this.ensureTargetExists(target);

    const rows = await this.db.query.routingSteps.findMany({
      where: this.targetWhere(target),
      with: { operation: true },
      orderBy: [asc(routingSteps.sortOrder), asc(routingSteps.createdAt)],
    });

    return rows.map((row) =>
      plainToInstance(RoutingStepResDto, row, {
        excludeExtraneousValues: true,
      }),
    );
  }

  /**
   * Adds one step ("[+]" in the Routing popup). Every read-only check runs before the single
   * insert — no transaction needed.
   */
  async addStep(
    target: RoutingTarget,
    reqDto: CreateRoutingStepReqDto,
    userId: string,
  ): Promise<RoutingStepResDto> {
    await this.ensureTargetExists(target);
    await this.ensureOperationExists(reqDto.operationId);

    const [step] = await this.db
      .insert(routingSteps)
      .values({
        productId: target.bomItemId ? null : target.productId,
        bomItemId: target.bomItemId ?? null,
        operationId: reqDto.operationId,
        sortOrder: reqDto.sortOrder ?? 0,
        note: reqDto.note,
        createdBy: userId,
      })
      .returning({ id: routingSteps.id });

    return this.getStepDetail(target, step.id);
  }

  /** Edits an existing step's STT chạy / note. `operationId` is immutable. */
  async updateStep(
    target: RoutingTarget,
    stepId: string,
    reqDto: UpdateRoutingStepReqDto,
  ): Promise<RoutingStepResDto> {
    await this.ensureTargetExists(target);
    await this.ensureStepExists(target, stepId);

    await this.db
      .update(routingSteps)
      .set({ ...reqDto, updatedAt: new Date() })
      .where(and(eq(routingSteps.id, stepId), this.targetWhere(target)));

    return this.getStepDetail(target, stepId);
  }

  /** Deletes one step ("[X]" in the Routing popup). */
  async deleteStep(target: RoutingTarget, stepId: string): Promise<void> {
    await this.ensureTargetExists(target);
    await this.ensureStepExists(target, stepId);

    await this.db
      .delete(routingSteps)
      .where(and(eq(routingSteps.id, stepId), this.targetWhere(target)));
  }

  /** `bomItemId` set → scope by node; otherwise scope by the Cấp 0 root product. */
  private targetWhere(target: RoutingTarget) {
    return target.bomItemId
      ? eq(routingSteps.bomItemId, target.bomItemId)
      : eq(routingSteps.productId, target.productId);
  }

  private async ensureTargetExists(target: RoutingTarget): Promise<void> {
    await this.ensureProductExists(target.productId);
    if (target.bomItemId) {
      await this.ensureBomItemRoutable(target.productId, target.bomItemId);
    }
  }

  private async ensureProductExists(productId: string): Promise<void> {
    const existing = await this.db.query.products.findFirst({
      columns: { id: true },
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }
  }

  /** A routable node must (a) exist within `productId`'s own BOM — a `bomItemId` belonging to a
   * different product's tree can't be reached through this product's URL — and (b) be a PRODUCT
   * node; a MATERIAL leaf (vật tư) never carries its own routing. */
  private async ensureBomItemRoutable(
    productId: string,
    bomItemId: string,
  ): Promise<void> {
    const item = await this.db.query.bomItems.findFirst({
      columns: { id: true, itemType: true },
      with: { bom: { columns: { productId: true } } },
      where: eq(bomItems.id, bomItemId),
    });

    if (!item || item.bom.productId !== productId) {
      throw new AppException(ErrorCode.E062, HttpStatus.NOT_FOUND);
    }
    if (item.itemType === BomItemType.MATERIAL) {
      throw new AppException(ErrorCode.E063, HttpStatus.BAD_REQUEST);
    }
  }

  /** Same existence check as `OperationsService.ensureOperationExists` — not reused via DI
   * (the service isn't imported here) to keep this module standalone, same reasoning as
   * `BomsService.ensureMaterialExists` querying `materials` directly. */
  private async ensureOperationExists(operationId: string): Promise<void> {
    const existing = await this.db.query.operations.findFirst({
      columns: { id: true },
      where: and(eq(operations.id, operationId), isNull(operations.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E046, HttpStatus.NOT_FOUND);
    }
  }

  /** Scoped to `target` so a step id belonging to a different routing can't be edited/deleted
   * through this one's URL. */
  private async ensureStepExists(
    target: RoutingTarget,
    stepId: string,
  ): Promise<void> {
    const existing = await this.db.query.routingSteps.findFirst({
      columns: { id: true },
      where: and(eq(routingSteps.id, stepId), this.targetWhere(target)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E056, HttpStatus.NOT_FOUND);
    }
  }

  /** Re-fetches a single step after a write — never build the response DTO from a `.returning()`
   * result directly, per `.claude/rules/api-module.md`. */
  private async getStepDetail(
    target: RoutingTarget,
    stepId: string,
  ): Promise<RoutingStepResDto> {
    const row = await this.db.query.routingSteps.findFirst({
      where: and(eq(routingSteps.id, stepId), this.targetWhere(target)),
      with: { operation: true },
    });

    if (!row) {
      throw new AppException(ErrorCode.E056, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(RoutingStepResDto, row, {
      excludeExtraneousValues: true,
    });
  }
}
