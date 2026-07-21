import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import { productRevisions, products } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateProductRevisionReqDto } from './dto/create-product-revision.req.dto';
import { ProductRevisionResDto } from './dto/product-revision.res.dto';
import { UpdateProductRevisionReqDto } from './dto/update-product-revision.req.dto';

@Injectable()
export class ProductRevisionsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getRevisions(productId: string): Promise<ProductRevisionResDto[]> {
    const product = await this.ensureProductExists(productId);

    const rows = await this.db.query.productRevisions.findMany({
      where: eq(productRevisions.productId, productId),
      orderBy: desc(productRevisions.createdAt),
      with: { creator: true },
    });

    const isActive = (revisionId: string) => revisionId === product.currentRevisionId;

    return rows.map((row) =>
      plainToInstance(
        ProductRevisionResDto,
        { ...row, isActive: isActive(row.id) },
        { excludeExtraneousValues: true },
      ),
    );
  }

  async getRevisionDetail(productId: string, revisionId: string): Promise<ProductRevisionResDto> {
    const product = await this.ensureProductExists(productId);

    const row = await this.db.query.productRevisions.findFirst({
      where: and(eq(productRevisions.id, revisionId), eq(productRevisions.productId, productId)),
      with: { creator: true },
    });

    if (!row) {
      throw new AppException(ErrorCode.E048, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(
      ProductRevisionResDto,
      { ...row, isActive: row.id === product.currentRevisionId },
      { excludeExtraneousValues: true },
    );
  }

  async createRevision(
    productId: string,
    reqDto: CreateProductRevisionReqDto,
    userId: string,
  ): Promise<ProductRevisionResDto> {
    await this.ensureProductExists(productId);
    await this.ensureRevisionExists(productId, reqDto.sourceRevisionId);

    let revisionNo = reqDto.revisionNo;
    if (revisionNo) {
      await this.validateRevisionNoUniqueness(productId, revisionNo);
    } else {
      revisionNo = await this.generateRevisionNo(productId);
    }

    const setAsCurrent = reqDto.setAsCurrent ?? true;

    const revisionId = await this.db.transaction(async (tx) => {
      const [revision] = await tx
        .insert(productRevisions)
        .values({
          productId,
          revisionNo,
          note: reqDto.note,
          sourceRevisionId: reqDto.sourceRevisionId,
          createdBy: userId,
        })
        .returning();

      if (setAsCurrent) {
        // `updatedAt` reflects that the product's "current" state (which revision it shows)
        // genuinely changed, not just a housekeeping bump.
        await tx
          .update(products)
          .set({ currentRevisionId: revision.id, updatedAt: new Date() })
          .where(eq(products.id, productId));
      }

      return revision.id;
    });

    return this.getRevisionDetail(productId, revisionId);
  }

  async updateRevision(
    productId: string,
    revisionId: string,
    reqDto: UpdateProductRevisionReqDto,
  ): Promise<ProductRevisionResDto> {
    await this.ensureProductExists(productId);
    await this.ensureRevisionExists(productId, revisionId);

    if (reqDto.revisionNo) {
      await this.validateRevisionNoUniqueness(productId, reqDto.revisionNo, revisionId);
    }

    await this.db
      .update(productRevisions)
      .set({ ...reqDto, updatedAt: new Date() })
      .where(and(eq(productRevisions.id, revisionId), eq(productRevisions.productId, productId)));

    return this.getRevisionDetail(productId, revisionId);
  }

  async activateRevision(productId: string, revisionId: string): Promise<ProductRevisionResDto> {
    await this.ensureProductExists(productId);
    await this.ensureRevisionExists(productId, revisionId);

    await this.db
      .update(products)
      .set({ currentRevisionId: revisionId, updatedAt: new Date() })
      .where(eq(products.id, productId));

    return this.getRevisionDetail(productId, revisionId);
  }

  /**
   * Inserts a product's very first revision ("R01"). Called from `ProductsService.createProduct`
   * inside its own open transaction — takes `tx` (not `this.db`) so it can only ever run inside an
   * already-open transaction. Does **not** set `products.currentRevisionId` itself: the caller owns
   * writes to `products`, this helper only owns writes to `product_revisions`.
   */
  async createInitialRevision(
    tx: DbTransaction,
    productId: string,
    userId: string,
  ): Promise<string> {
    const [revision] = await tx
      .insert(productRevisions)
      .values({ productId, revisionNo: 'R01', createdBy: userId })
      .returning();

    return revision.id;
  }

  private async ensureProductExists(
    productId: string,
  ): Promise<{ id: string; currentRevisionId: string | null }> {
    const existing = await this.db.query.products.findFirst({
      columns: { id: true, currentRevisionId: true },
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private async ensureRevisionExists(productId: string, revisionId: string): Promise<void> {
    const existing = await this.db.query.productRevisions.findFirst({
      columns: { id: true },
      where: and(eq(productRevisions.id, revisionId), eq(productRevisions.productId, productId)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E048, HttpStatus.NOT_FOUND);
    }
  }

  private async validateRevisionNoUniqueness(
    productId: string,
    revisionNo: string,
    ignoredRevisionId?: string,
  ): Promise<void> {
    const where = ignoredRevisionId
      ? and(
          eq(productRevisions.productId, productId),
          eq(productRevisions.revisionNo, revisionNo),
          ne(productRevisions.id, ignoredRevisionId),
        )
      : and(eq(productRevisions.productId, productId), eq(productRevisions.revisionNo, revisionNo));

    const existing = await this.db.query.productRevisions.findFirst({
      columns: { id: true },
      where,
    });

    if (existing) {
      throw new AppException(ErrorCode.E049, HttpStatus.CONFLICT);
    }
  }

  /**
   * Per-product sequential "Rxx", collision-safe: revisionNo can be sparse (a user may have
   * explicitly created "R05" skipping R02-R04), so a naive `count + 1` can collide with an
   * already-taken number and throw a bare unique-constraint 500. Loop forward from `count + 1`
   * until a free number is found.
   */
  private async generateRevisionNo(productId: string): Promise<string> {
    const existing = await this.db.query.productRevisions.findMany({
      where: eq(productRevisions.productId, productId),
      columns: { revisionNo: true },
    });
    const taken = new Set(existing.map((row) => row.revisionNo));

    let n = existing.length + 1;
    let candidate = `R${String(n).padStart(2, '0')}`;
    while (taken.has(candidate)) {
      n += 1;
      candidate = `R${String(n).padStart(2, '0')}`;
    }

    return candidate;
  }
}
