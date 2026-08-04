import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  bomItems,
  operations,
  products,
  routingSteps,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateRoutingStepReqDto } from './dto/create-routing-step.req.dto';
import { RoutingStepResDto } from './dto/routing-step.res.dto';
import { UpdateRoutingStepReqDto } from './dto/update-routing-step.req.dto';

/** Routing Cấp 0 của chính sản phẩm gốc (`bomItemId` bỏ trống), hoặc routing as-used của một node
 * BOM cụ thể (`bomItemId` có giá trị). `productId` luôn có — ở ca node, dùng để scope theo đúng
 * cây, chặn `bomItemId` của cây sản phẩm khác lọt qua URL này. */
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

  /** `operationId` bất biến — đổi công đoạn của một bước nghĩa là xoá + thêm lại. */
  async updateStep(
    target: RoutingTarget,
    stepId: string,
    reqDto: UpdateRoutingStepReqDto,
  ): Promise<RoutingStepResDto> {
    await this.ensureTargetExists(target);
    await this.ensureStepExists(target, stepId);

    await this.db
      .update(routingSteps)
      .set(reqDto)
      .where(and(eq(routingSteps.id, stepId), this.targetWhere(target)));

    return this.getStepDetail(target, stepId);
  }

  async deleteStep(target: RoutingTarget, stepId: string): Promise<void> {
    await this.ensureTargetExists(target);
    await this.ensureStepExists(target, stepId);

    await this.db
      .delete(routingSteps)
      .where(and(eq(routingSteps.id, stepId), this.targetWhere(target)));
  }

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

  /** Node gắn được routing phải thuộc đúng BOM của `productId` — chặn `bomItemId` của cây sản
   * phẩm khác lọt qua URL này. Mọi hàng `bom_items` giờ đều là PRODUCT nên không còn cần loại trừ
   * MATERIAL (`E063` đã nghỉ hưu). */
  private async ensureBomItemRoutable(
    productId: string,
    bomItemId: string,
  ): Promise<void> {
    const item = await this.db.query.bomItems.findFirst({
      columns: { id: true },
      with: { bom: { columns: { productId: true } } },
      where: eq(bomItems.id, bomItemId),
    });

    if (!item) {
      throw new AppException(ErrorCode.E062, HttpStatus.NOT_FOUND);
    }
    // `bomId` là FK bắt buộc, đúng 1 dòng — Drizzle suy sai kiểu `bom` thành one|many sau khi
    // schema có thêm nhiều quan hệ trỏ `users`, ép lại cho đúng thực tế thay vì đổi logic.
    const bom = item.bom as { productId: string };
    if (bom.productId !== productId) {
      throw new AppException(ErrorCode.E062, HttpStatus.NOT_FOUND);
    }
  }

  /** Trùng check tồn tại với `OperationsService.ensureOperationExists` — cố ý không inject qua DI
   * để module này đứng độc lập, giống cách `BomsService.ensureMaterialExists` tự query. */
  private async ensureOperationExists(operationId: string): Promise<void> {
    const existing = await this.db.query.operations.findFirst({
      columns: { id: true },
      where: and(eq(operations.id, operationId), isNull(operations.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E046, HttpStatus.NOT_FOUND);
    }
  }

  /** Scope theo `target` — chặn sửa/xoá một step thuộc routing khác qua URL này. */
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
