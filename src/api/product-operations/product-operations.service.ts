import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  operations,
  productOperations,
  products,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateProductOperationReqDto } from './dto/create-product-operation.req.dto';
import { ProductOperationResDto } from './dto/product-operation.res.dto';
import { UpdateProductOperationReqDto } from './dto/update-product-operation.req.dto';

@Injectable()
export class ProductOperationsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getProductOperations(
    productId: string,
  ): Promise<ProductOperationResDto[]> {
    await this.ensureProductExists(productId);

    const rows = await this.db.query.productOperations.findMany({
      where: eq(productOperations.productId, productId),
      with: { operation: true },
      orderBy: [
        asc(productOperations.sortOrder),
        asc(productOperations.createdAt),
      ],
    });

    return rows.map((row) =>
      plainToInstance(ProductOperationResDto, row, {
        excludeExtraneousValues: true,
      }),
    );
  }

  async createProductOperation(
    productId: string,
    reqDto: CreateProductOperationReqDto,
    userId: string,
  ): Promise<void> {
    await this.ensureProductExists(productId);
    await this.ensureOperationExists(reqDto.operationId);

    await this.db.insert(productOperations).values({
      ...reqDto,
      productId,
      createdBy: userId,
    });
  }

  /** `operationId` bất biến — đổi công đoạn của một bước nghĩa là xoá + thêm lại. */
  async updateProductOperation(
    productId: string,
    stepId: string,
    reqDto: UpdateProductOperationReqDto,
  ): Promise<void> {
    await this.ensureProductExists(productId);
    await this.ensureProductOperationExists(productId, stepId);

    await this.db
      .update(productOperations)
      .set(reqDto)
      .where(
        and(
          eq(productOperations.id, stepId),
          eq(productOperations.productId, productId),
        ),
      );
  }

  async deleteProductOperation(
    productId: string,
    stepId: string,
  ): Promise<void> {
    await this.ensureProductExists(productId);
    await this.ensureProductOperationExists(productId, stepId);

    await this.db
      .delete(productOperations)
      .where(
        and(
          eq(productOperations.id, stepId),
          eq(productOperations.productId, productId),
        ),
      );
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

  private async ensureProductOperationExists(
    productId: string,
    stepId: string,
  ): Promise<void> {
    const existing = await this.db.query.productOperations.findFirst({
      columns: { id: true },
      where: and(
        eq(productOperations.id, stepId),
        eq(productOperations.productId, productId),
      ),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E056, HttpStatus.NOT_FOUND);
    }
  }
}
