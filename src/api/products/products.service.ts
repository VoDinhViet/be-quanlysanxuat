import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, count, desc, eq, ilike, isNull, ne, or } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OrderBy } from '../../constants/app.constant';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  clients,
  operations,
  productRevisions,
  products,
  productTypes,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateProductReqDto } from './dto/create-product.req.dto';
import { CreateProductRevisionReqDto } from './dto/create-product-revision.req.dto';
import { GetProductsReqDto } from './dto/get-products.req.dto';
import { ProductOptionResDto } from './dto/product-option.res.dto';
import { ProductRevisionResDto } from './dto/product-revision.res.dto';
import { ProductResDto } from './dto/product.res.dto';
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
