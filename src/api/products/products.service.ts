import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OrderBy } from '../../constants/app.constant';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  bomLines,
  clients,
  operations,
  productRevisions,
  products,
  ProductItemType,
  productTypes,
  routingSteps,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { BomLineResDto } from './dto/bom-line.res.dto';
import { BomTreeNodeResDto } from './dto/bom-tree-node.res.dto';
import { CreateBomLineReqDto } from './dto/create-bom-line.req.dto';
import { CreateProductReqDto } from './dto/create-product.req.dto';
import { CreateProductRevisionReqDto } from './dto/create-product-revision.req.dto';
import { GetProductsReqDto } from './dto/get-products.req.dto';
import { ProductOptionResDto } from './dto/product-option.res.dto';
import { ProductRevisionResDto } from './dto/product-revision.res.dto';
import { ProductResDto } from './dto/product.res.dto';
import { UpdateBomLineReqDto } from './dto/update-bom-line.req.dto';
import { UpdateProductReqDto } from './dto/update-product.req.dto';
import { UpdateProductRevisionReqDto } from './dto/update-product-revision.req.dto';

@Injectable()
export class ProductsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getProducts(reqDto: GetProductsReqDto): Promise<OffsetPaginatedDto<ProductResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      isNull(products.deletedAt),
      keyword ? or(ilike(products.code, keyword), ilike(products.name, keyword)) : undefined,
      reqDto.clientId ? eq(products.clientId, reqDto.clientId) : undefined,
      reqDto.itemType ? eq(products.itemType, reqDto.itemType) : undefined,
      reqDto.status ? eq(products.status, reqDto.status) : undefined,
    );
    const orderBy =
      reqDto.order === OrderBy.DESC ? desc(products.createdAt) : asc(products.createdAt);

    const [entities, totalRows] = await Promise.all([
      this.db.query.products.findMany({
        where,
        with: {
          client: true,
          unit: true,
          revisions: {
            where: isNull(productRevisions.deletedAt),
            orderBy: desc(productRevisions.createdAt),
            limit: 1,
          },
        },
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
      }),
      this.db.select({ total: count() }).from(products).where(where),
    ]);

    return new OffsetPaginatedDto(
      this.mapProducts(entities),
      new OffsetPaginationDto(totalRows[0]?.total ?? 0, reqDto),
    );
  }

  async getProductDetail(productId: string): Promise<ProductResDto> {
    const product = await this.db.query.products.findFirst({
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
      with: {
        client: true,
        unit: true,
        revisions: {
          where: isNull(productRevisions.deletedAt),
          orderBy: desc(productRevisions.createdAt),
          limit: 1,
        },
      },
    });

    if (!product) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }

    return this.mapProduct(product);
  }

  async createProduct(reqDto: CreateProductReqDto): Promise<ProductResDto> {
    await Promise.all([
      this.ensureCodeAvailable(reqDto.code),
      this.ensureUnitExists(reqDto.unitId),
      reqDto.clientId ? this.ensureClientExists(reqDto.clientId) : Promise.resolve(),
    ]);

    const product = await this.db.transaction(async (tx) => {
      const [createdProduct] = await tx
        .insert(products)
        .values({
          clientId: reqDto.clientId,
          code: reqDto.code,
          name: reqDto.name,
          itemType: reqDto.itemType,
          unitId: reqDto.unitId,
          imageUrl: reqDto.imageUrl,
          note: reqDto.note,
        })
        .returning();

      await tx.insert(productRevisions).values({
        productId: createdProduct.id,
        revisionNo: reqDto.revisionNo,
      });

      return createdProduct;
    });

    return this.getProductDetail(product.id);
  }

  async updateProduct(productId: string, reqDto: UpdateProductReqDto): Promise<ProductResDto> {
    await this.ensureProductExists(productId);

    await Promise.all([
      reqDto.code ? this.ensureCodeAvailable(reqDto.code, productId) : Promise.resolve(),
      reqDto.unitId ? this.ensureUnitExists(reqDto.unitId) : Promise.resolve(),
      reqDto.clientId ? this.ensureClientExists(reqDto.clientId) : Promise.resolve(),
    ]);

    await this.db
      .update(products)
      .set({
        clientId: reqDto.clientId,
        code: reqDto.code,
        name: reqDto.name,
        itemType: reqDto.itemType,
        unitId: reqDto.unitId,
        status: reqDto.status,
        imageUrl: reqDto.imageUrl,
        note: reqDto.note,
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, productId), isNull(products.deletedAt)));

    return this.getProductDetail(productId);
  }

  async deleteProduct(productId: string): Promise<ProductResDto> {
    await this.ensureProductExists(productId);

    const product = await this.getProductDetail(productId);
    const deletedAt = new Date();

    await this.db
      .update(products)
      .set({
        deletedAt,
        updatedAt: deletedAt,
      })
      .where(and(eq(products.id, productId), isNull(products.deletedAt)));

    return product;
  }

  async getProductOptions(): Promise<ProductOptionResDto[]> {
    const entities = await this.db.query.products.findMany({
      columns: {
        id: true,
        code: true,
        name: true,
      },
      where: isNull(products.deletedAt),
      orderBy: asc(products.code),
    });

    return this.mapOptions(entities);
  }

  async getUnitOptions(): Promise<ProductOptionResDto[]> {
    const entities = await this.db.query.units.findMany({
      columns: {
        id: true,
        code: true,
        name: true,
      },
      where: isNull(units.deletedAt),
      orderBy: asc(units.code),
    });

    return this.mapOptions(entities);
  }

  async getProductTypeOptions(): Promise<ProductOptionResDto[]> {
    const entities = await this.db.query.productTypes.findMany({
      columns: {
        id: true,
        code: true,
        name: true,
      },
      where: isNull(productTypes.deletedAt),
      orderBy: asc(productTypes.code),
    });

    return this.mapOptions(entities);
  }

  async getOperationOptions(): Promise<ProductOptionResDto[]> {
    const entities = await this.db.query.operations.findMany({
      columns: {
        id: true,
        code: true,
        name: true,
      },
      where: isNull(operations.deletedAt),
      orderBy: asc(operations.code),
    });

    return this.mapOptions(entities);
  }

  async getProductRevisions(productId: string): Promise<ProductRevisionResDto[]> {
    await this.ensureProductExists(productId);

    const revisions = await this.db.query.productRevisions.findMany({
      where: and(eq(productRevisions.productId, productId), isNull(productRevisions.deletedAt)),
      orderBy: desc(productRevisions.createdAt),
    });

    return this.mapRevisions(revisions);
  }

  async createProductRevision(
    productId: string,
    reqDto: CreateProductRevisionReqDto,
  ): Promise<ProductRevisionResDto> {
    await this.ensureProductExists(productId);
    await this.ensureRevisionNoAvailable(productId, reqDto.revisionNo);

    const [revision] = await this.db
      .insert(productRevisions)
      .values({
        productId,
        revisionNo: reqDto.revisionNo,
        note: reqDto.note,
      })
      .returning();

    return this.mapRevision(revision);
  }

  async updateProductRevision(
    productId: string,
    revisionId: string,
    reqDto: UpdateProductRevisionReqDto,
  ): Promise<ProductRevisionResDto> {
    await this.ensureProductExists(productId);
    await this.ensureProductRevisionExists(productId, revisionId);

    if (reqDto.revisionNo) {
      await this.ensureRevisionNoAvailable(productId, reqDto.revisionNo, revisionId);
    }

    const [revision] = await this.db
      .update(productRevisions)
      .set({
        revisionNo: reqDto.revisionNo,
        note: reqDto.note,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(productRevisions.id, revisionId),
          eq(productRevisions.productId, productId),
          isNull(productRevisions.deletedAt),
        ),
      )
      .returning();

    return this.mapRevision(revision);
  }

  async getBomTree(productId: string, revisionId: string): Promise<BomTreeNodeResDto> {
    const rootProduct = await this.getBomRootProduct(productId);

    await this.ensureProductRevisionExists(productId, revisionId);

    const [lines, steps] = await Promise.all([
      this.db.query.bomLines.findMany({
        where: and(eq(bomLines.productRevisionId, revisionId), isNull(bomLines.deletedAt)),
        with: {
          childItem: {
            with: {
              unit: true,
            },
          },
          unit: true,
        },
        orderBy: [asc(bomLines.level), asc(bomLines.createdAt)],
      }),
      this.db.query.routingSteps.findMany({
        columns: {
          itemId: true,
        },
        where: and(eq(routingSteps.productRevisionId, revisionId), isNull(routingSteps.deletedAt)),
      }),
    ]);

    const routingItemIds = new Set(steps.map((step) => step.itemId));
    const linesByParentId = new Map<string, BomLineEntityWithRelations[]>();

    for (const line of lines) {
      const parentLines = linesByParentId.get(line.parentItemId) ?? [];
      parentLines.push(line);
      linesByParentId.set(line.parentItemId, parentLines);
    }

    return this.mapBomTreeNode({
      product: rootProduct,
      line: null,
      parentItemId: null,
      qty: '1',
      level: 0,
      routingItemIds,
      linesByParentId,
    });
  }

  async createBomLine(
    productId: string,
    revisionId: string,
    reqDto: CreateBomLineReqDto,
  ): Promise<BomLineResDto> {
    await this.ensureProductRevisionExists(productId, revisionId);
    await this.ensureUnitExists(reqDto.unitId);

    if (reqDto.parentItemId === reqDto.childItemId) {
      throw new AppException(ErrorCode.V002, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const [parentItem, childItem, existingLines] = await Promise.all([
      this.getBomItem(reqDto.parentItemId),
      this.getBomItem(reqDto.childItemId),
      this.getBomLines(revisionId),
    ]);

    this.ensureBomParentAllowed(parentItem);
    this.ensureBomParentAttached(productId, reqDto.parentItemId, existingLines);
    this.ensureBomCycleAllowed(reqDto.parentItemId, reqDto.childItemId, existingLines);

    const level = this.getBomChildLevel(productId, reqDto.parentItemId, existingLines);

    const [line] = await this.db
      .insert(bomLines)
      .values({
        productRevisionId: revisionId,
        parentItemId: parentItem.id,
        childItemId: childItem.id,
        qty: String(reqDto.qty),
        unitId: reqDto.unitId,
        scrapRate: String(reqDto.scrapRate ?? 0),
        level,
        note: reqDto.note,
      })
      .returning();

    return this.getBomLine(revisionId, line.id);
  }

  async updateBomLine(
    productId: string,
    revisionId: string,
    bomLineId: string,
    reqDto: UpdateBomLineReqDto,
  ): Promise<BomLineResDto> {
    await this.ensureProductRevisionExists(productId, revisionId);

    if (reqDto.unitId) {
      await this.ensureUnitExists(reqDto.unitId);
    }

    await this.ensureBomLineExists(revisionId, bomLineId);

    await this.db
      .update(bomLines)
      .set({
        qty: reqDto.qty === undefined ? undefined : String(reqDto.qty),
        unitId: reqDto.unitId,
        scrapRate: reqDto.scrapRate === undefined ? undefined : String(reqDto.scrapRate),
        note: reqDto.note,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bomLines.id, bomLineId),
          eq(bomLines.productRevisionId, revisionId),
          isNull(bomLines.deletedAt),
        ),
      );

    return this.getBomLine(revisionId, bomLineId);
  }

  async deleteBomLine(
    productId: string,
    revisionId: string,
    bomLineId: string,
  ): Promise<BomLineResDto> {
    await this.ensureProductRevisionExists(productId, revisionId);

    const line = await this.getBomLine(revisionId, bomLineId);
    const lines = await this.getBomLines(revisionId);
    const deletionIds = this.getBomSubtreeLineIds(bomLineId, line.childItemId, lines);
    const deletedAt = new Date();

    await this.db
      .update(bomLines)
      .set({
        deletedAt,
        updatedAt: deletedAt,
      })
      .where(
        and(
          inArray(bomLines.id, deletionIds),
          eq(bomLines.productRevisionId, revisionId),
          isNull(bomLines.deletedAt),
        ),
      );

    return line;
  }

  private async ensureProductExists(productId: string): Promise<void> {
    const existingProduct = await this.db.query.products.findFirst({
      columns: {
        id: true,
      },
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
    });

    if (!existingProduct) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureClientExists(clientId: string): Promise<void> {
    const existingClient = await this.db.query.clients.findFirst({
      columns: {
        id: true,
      },
      where: and(eq(clients.id, clientId), isNull(clients.deletedAt)),
    });

    if (!existingClient) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureUnitExists(unitId: string): Promise<void> {
    const existingUnit = await this.db.query.units.findFirst({
      columns: {
        id: true,
      },
      where: and(eq(units.id, unitId), isNull(units.deletedAt)),
    });

    if (!existingUnit) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureCodeAvailable(code: string, ignoredProductId?: string): Promise<void> {
    const existingProduct = await this.db.query.products.findFirst({
      columns: {
        id: true,
      },
      where: and(
        eq(products.code, code),
        ignoredProductId ? ne(products.id, ignoredProductId) : undefined,
      ),
    });

    if (existingProduct) {
      throw new AppException(ErrorCode.E005, HttpStatus.CONFLICT);
    }
  }

  private async ensureProductRevisionExists(productId: string, revisionId: string): Promise<void> {
    const existingRevision = await this.db.query.productRevisions.findFirst({
      columns: {
        id: true,
      },
      where: and(
        eq(productRevisions.id, revisionId),
        eq(productRevisions.productId, productId),
        isNull(productRevisions.deletedAt),
      ),
    });

    if (!existingRevision) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }
  }

  private async getBomRootProduct(productId: string): Promise<ProductWithUnit> {
    const product = await this.db.query.products.findFirst({
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
      with: {
        unit: true,
      },
    });

    if (!product) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }

    return product;
  }

  private async getBomItem(productId: string): Promise<ProductWithUnit> {
    const product = await this.db.query.products.findFirst({
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
      with: {
        unit: true,
      },
    });

    if (!product) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }

    return product;
  }

  private async getBomLines(revisionId: string): Promise<(typeof bomLines.$inferSelect)[]> {
    return this.db.query.bomLines.findMany({
      where: and(eq(bomLines.productRevisionId, revisionId), isNull(bomLines.deletedAt)),
    });
  }

  private async getBomLine(revisionId: string, bomLineId: string): Promise<BomLineResDto> {
    const line = await this.db.query.bomLines.findFirst({
      where: and(
        eq(bomLines.id, bomLineId),
        eq(bomLines.productRevisionId, revisionId),
        isNull(bomLines.deletedAt),
      ),
      with: {
        unit: true,
      },
    });

    if (!line) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }

    return this.mapBomLine(line);
  }

  private async ensureBomLineExists(revisionId: string, bomLineId: string): Promise<void> {
    const existingLine = await this.db.query.bomLines.findFirst({
      columns: {
        id: true,
      },
      where: and(
        eq(bomLines.id, bomLineId),
        eq(bomLines.productRevisionId, revisionId),
        isNull(bomLines.deletedAt),
      ),
    });

    if (!existingLine) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }
  }

  private ensureBomParentAllowed(parentItem: typeof products.$inferSelect): void {
    if (![ProductItemType.Fg, ProductItemType.Wip].includes(parentItem.itemType)) {
      throw new AppException(ErrorCode.V002, HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }

  private ensureBomParentAttached(
    rootProductId: string,
    parentItemId: string,
    lines: (typeof bomLines.$inferSelect)[],
  ): void {
    const isRoot = parentItemId === rootProductId;
    const isExistingChild = lines.some((line) => line.childItemId === parentItemId);

    if (!isRoot && !isExistingChild) {
      throw new AppException(ErrorCode.V002, HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }

  private ensureBomCycleAllowed(
    parentItemId: string,
    childItemId: string,
    lines: (typeof bomLines.$inferSelect)[],
  ): void {
    const childrenByParentId = new Map<string, string[]>();

    for (const line of lines) {
      const childIds = childrenByParentId.get(line.parentItemId) ?? [];
      childIds.push(line.childItemId);
      childrenByParentId.set(line.parentItemId, childIds);
    }

    const stack = [childItemId];
    const visited = new Set<string>();

    while (stack.length > 0) {
      const currentItemId = stack.pop();

      if (!currentItemId || visited.has(currentItemId)) {
        continue;
      }

      if (currentItemId === parentItemId) {
        throw new AppException(ErrorCode.V002, HttpStatus.UNPROCESSABLE_ENTITY);
      }

      visited.add(currentItemId);
      stack.push(...(childrenByParentId.get(currentItemId) ?? []));
    }
  }

  private getBomChildLevel(
    rootProductId: string,
    parentItemId: string,
    lines: (typeof bomLines.$inferSelect)[],
  ): number {
    if (parentItemId === rootProductId) {
      return 1;
    }

    const parentLine = lines.find((line) => line.childItemId === parentItemId);

    if (!parentLine) {
      throw new AppException(ErrorCode.V002, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    return parentLine.level + 1;
  }

  private getBomSubtreeLineIds(
    rootBomLineId: string,
    rootChildItemId: string,
    lines: (typeof bomLines.$inferSelect)[],
  ): string[] {
    const deletionIds = new Set([rootBomLineId]);
    const stack = [rootChildItemId];

    while (stack.length > 0) {
      const parentItemId = stack.pop();

      if (!parentItemId) {
        continue;
      }

      for (const line of lines) {
        if (line.parentItemId !== parentItemId || deletionIds.has(line.id)) {
          continue;
        }

        deletionIds.add(line.id);
        stack.push(line.childItemId);
      }
    }

    return Array.from(deletionIds);
  }

  private async ensureRevisionNoAvailable(
    productId: string,
    revisionNo: string,
    ignoredRevisionId?: string,
  ): Promise<void> {
    const existingRevision = await this.db.query.productRevisions.findFirst({
      columns: {
        id: true,
      },
      where: and(
        eq(productRevisions.productId, productId),
        eq(productRevisions.revisionNo, revisionNo),
        ignoredRevisionId ? ne(productRevisions.id, ignoredRevisionId) : undefined,
      ),
    });

    if (existingRevision) {
      throw new AppException(ErrorCode.E005, HttpStatus.CONFLICT);
    }
  }

  private mapProducts(productEntities: ProductEntityWithRelations[]): ProductResDto[] {
    return productEntities.map((product) => this.mapProduct(product));
  }

  private mapProduct(product: ProductEntityWithRelations): ProductResDto {
    return plainToInstance(
      ProductResDto,
      {
        ...product,
        currentRevision: product.revisions[0] ?? null,
      },
      { excludeExtraneousValues: true },
    );
  }

  private mapOptions(optionEntities: ProductOptionEntity[]): ProductOptionResDto[] {
    return plainToInstance(ProductOptionResDto, optionEntities, {
      excludeExtraneousValues: true,
    });
  }

  private mapRevisions(revisionEntities: (typeof productRevisions.$inferSelect)[]) {
    return plainToInstance(ProductRevisionResDto, revisionEntities, {
      excludeExtraneousValues: true,
    });
  }

  private mapRevision(revision: typeof productRevisions.$inferSelect): ProductRevisionResDto {
    return plainToInstance(ProductRevisionResDto, revision, {
      excludeExtraneousValues: true,
    });
  }

  private mapBomLine(line: BomLineWithUnit): BomLineResDto {
    return plainToInstance(BomLineResDto, line, {
      excludeExtraneousValues: true,
    });
  }

  private mapBomTreeNode(args: MapBomTreeNodeArgs): BomTreeNodeResDto {
    const { product, line, parentItemId, qty, level, routingItemIds, linesByParentId } = args;
    const children = (linesByParentId.get(product.id) ?? []).map((childLine) =>
      this.mapBomTreeNode({
        product: childLine.childItem,
        line: childLine,
        parentItemId: product.id,
        qty: childLine.qty,
        level: childLine.level,
        routingItemIds,
        linesByParentId,
      }),
    );

    return plainToInstance(
      BomTreeNodeResDto,
      {
        id: line?.id ?? product.id,
        bomLineId: line?.id ?? null,
        productId: product.id,
        parentItemId,
        code: product.code,
        name: product.name,
        imageUrl: product.imageUrl,
        itemType: product.itemType,
        qty,
        unit: line?.unit ?? product.unit,
        level,
        hasRouting: routingItemIds.has(product.id),
        children,
      },
      { excludeExtraneousValues: true },
    );
  }
}

type ProductEntityWithRelations = typeof products.$inferSelect & {
  client: typeof clients.$inferSelect | null;
  unit: typeof units.$inferSelect | null;
  revisions: (typeof productRevisions.$inferSelect)[];
};

type ProductOptionEntity = {
  id: string;
  code: string;
  name: string;
};

type ProductWithUnit = typeof products.$inferSelect & {
  unit: typeof units.$inferSelect;
};

type BomLineWithUnit = typeof bomLines.$inferSelect & {
  unit: typeof units.$inferSelect | null;
};

type BomLineEntityWithRelations = typeof bomLines.$inferSelect & {
  childItem: ProductWithUnit;
  unit: typeof units.$inferSelect | null;
};

type MapBomTreeNodeArgs = {
  product: ProductWithUnit;
  line: BomLineEntityWithRelations | null;
  parentItemId: string | null;
  qty: string;
  level: number;
  routingItemIds: Set<string>;
  linesByParentId: Map<string, BomLineEntityWithRelations[]>;
};
