import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count as drizzleCount, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { clients, productGroups, products, ProductStatus, units } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateProductReqDto } from './dto/create-product.req.dto';
import { GetProductsReqDto } from './dto/get-products.req.dto';
import { ProductResDto } from './dto/product.res.dto';
import { UpdateProductReqDto } from './dto/update-product.req.dto';

@Injectable()
export class ProductsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getProducts(reqDto: GetProductsReqDto): Promise<OffsetPaginatedDto<ProductResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      isNull(products.deletedAt),
      keyword
        ? or(
            unaccentILike(products.code, keyword),
            unaccentILike(products.name, keyword),
            inArray(
              products.productGroupId,
              this.db
                .select({ id: productGroups.id })
                .from(productGroups)
                .where(unaccentILike(productGroups.name, keyword)),
            ),
          )
        : undefined,
      reqDto.clientId ? eq(products.clientId, reqDto.clientId) : undefined,
      reqDto.productGroupId ? eq(products.productGroupId, reqDto.productGroupId) : undefined,
      reqDto.status ? eq(products.status, reqDto.status) : undefined,
    );
    const orderBy = desc(products.createdAt);

    const [entities, count] = await Promise.all([
      this.db.query.products.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
        with: {
          client: true,
          group: true,
          unit: true,
          creator: true,
        },
      }),
      this.db.select({ total: drizzleCount() }).from(products).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ProductResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(count[0]?.total ?? 0, reqDto),
    );
  }

  async getProductDetail(productId: string): Promise<ProductResDto> {
    const product = await this.db.query.products.findFirst({
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
      with: {
        client: true,
        group: true,
        unit: true,
        creator: true,
      },
    });

    if (!product) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(ProductResDto, product, {
      excludeExtraneousValues: true,
    });
  }

  async createProduct(reqDto: CreateProductReqDto, userId: string): Promise<ProductResDto> {
    let code = reqDto.code;
    if (code) {
      await this.validateCodeUniqueness(code);
    } else {
      code = await this.generateProductCode();
    }

    await this.ensureUnitExists(reqDto.unitId);
    if (reqDto.clientId) {
      await this.ensureClientExists(reqDto.clientId);
    }
    if (reqDto.productGroupId) {
      await this.ensureProductGroupExists(reqDto.productGroupId);
    }

    const [product] = await this.db
      .insert(products)
      .values({
        code,
        name: reqDto.name,
        imageUrl: reqDto.imageUrl,
        revision: reqDto.revision ?? 'R01',
        status: reqDto.status ?? ProductStatus.ACTIVE,
        note: reqDto.note,
        clientId: reqDto.clientId,
        productGroupId: reqDto.productGroupId,
        unitId: reqDto.unitId,
        createdBy: userId,
      })
      .returning();

    return this.getProductDetail(product.id);
  }

  async updateProduct(productId: string, reqDto: UpdateProductReqDto): Promise<ProductResDto> {
    await this.ensureProductExists(productId);

    if (reqDto.code) {
      await this.validateCodeUniqueness(reqDto.code, productId);
    }
    if (reqDto.unitId) {
      await this.ensureUnitExists(reqDto.unitId);
    }
    if (reqDto.clientId) {
      await this.ensureClientExists(reqDto.clientId);
    }
    if (reqDto.productGroupId) {
      await this.ensureProductGroupExists(reqDto.productGroupId);
    }

    const [product] = await this.db
      .update(products)
      .set({
        code: reqDto.code,
        name: reqDto.name,
        imageUrl: reqDto.imageUrl,
        revision: reqDto.revision,
        status: reqDto.status,
        note: reqDto.note,
        clientId: reqDto.clientId,
        productGroupId: reqDto.productGroupId,
        unitId: reqDto.unitId,
      })
      .where(eq(products.id, productId))
      .returning();

    return this.getProductDetail(product.id);
  }

  async deleteProduct(productId: string): Promise<void> {
    await this.ensureProductExists(productId);

    await this.db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, productId));
  }

  async copyProduct(productId: string, userId: string): Promise<ProductResDto> {
    const original = await this.ensureProductExists(productId);
    const code = await this.generateProductCode();

    const [product] = await this.db
      .insert(products)
      .values({
        code,
        name: original.name,
        imageUrl: original.imageUrl,
        revision: original.revision,
        status: original.status,
        note: original.note,
        clientId: original.clientId,
        productGroupId: original.productGroupId,
        unitId: original.unitId,
        createdBy: userId,
      })
      .returning();

    return this.getProductDetail(product.id);
  }

  private async ensureProductExists(productId: string) {
    const existing = await this.db.query.products.findFirst({
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private async validateCodeUniqueness(code: string, ignoredProductId?: string): Promise<void> {
    const where = ignoredProductId
      ? and(eq(products.code, code), ne(products.id, ignoredProductId))
      : eq(products.code, code);

    const existing = await this.db.query.products.findFirst({
      columns: { id: true },
      where,
    });

    if (existing) {
      throw new AppException(ErrorCode.E008, HttpStatus.CONFLICT);
    }
  }

  private async ensureUnitExists(unitId: string): Promise<void> {
    const existing = await this.db.query.units.findFirst({
      columns: { id: true },
      where: eq(units.id, unitId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E011, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureClientExists(clientId: string): Promise<void> {
    const existing = await this.db.query.clients.findFirst({
      columns: { id: true },
      where: eq(clients.id, clientId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E009, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureProductGroupExists(productGroupId: string): Promise<void> {
    const existing = await this.db.query.productGroups.findFirst({
      columns: { id: true },
      where: eq(productGroups.id, productGroupId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E010, HttpStatus.NOT_FOUND);
    }
  }

  private async generateProductCode(): Promise<string> {
    const [totalRows] = await this.db.select({ total: drizzleCount() }).from(products);
    return `SP${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }
}
