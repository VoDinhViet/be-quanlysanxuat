import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  ne,
  or,
} from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  bomItems,
  bomMaterials,
  boms,
  clients,
  files,
  materials,
  productGroups,
  products,
  ProductStatus,
  units,
  UnitScope,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { BomMaterialResDto } from '../bom-materials/dto/bom-material.res.dto';
import { GetBomMaterialsReqDto } from '../bom-materials/dto/get-bom-materials.req.dto';
import { CreateProductReqDto } from './dto/create-product.req.dto';
import { GetProductOptionsReqDto } from './dto/get-product-options.req.dto';
import { GetProductsReqDto } from './dto/get-products.req.dto';
import { ProductDetailResDto } from './dto/product-detail.res.dto';
import { ProductOptionResDto } from './dto/product-option.res.dto';
import { ProductResDto } from './dto/product.res.dto';
import { UpdateProductReqDto } from './dto/update-product.req.dto';

type BomItemSelect = typeof bomItems.$inferSelect;
type BomMaterialSelect = typeof bomMaterials.$inferSelect;

@Injectable()
export class ProductsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly filesService: FilesService,
  ) {}

  async getProducts(
    reqDto: GetProductsReqDto,
  ): Promise<OffsetPaginatedDto<ProductResDto>> {
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
      reqDto.productGroupId
        ? eq(products.productGroupId, reqDto.productGroupId)
        : undefined,
      reqDto.type ? eq(products.type, reqDto.type) : undefined,
      reqDto.status ? eq(products.status, reqDto.status) : undefined,
    );
    const orderBy = desc(products.createdAt);

    const [entities, countRows] = await Promise.all([
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
          imageFile: true,
        },
      }),
      this.db.select({ total: count() }).from(products).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ProductResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getProductOptions(
    reqDto: GetProductOptionsReqDto,
  ): Promise<ProductOptionResDto[]> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const entities = await this.db.query.products.findMany({
      where: and(
        isNull(products.deletedAt),
        eq(products.status, ProductStatus.ACTIVE),
        keyword
          ? or(
              unaccentILike(products.code, keyword),
              unaccentILike(products.name, keyword),
            )
          : undefined,
        reqDto.type ? eq(products.type, reqDto.type) : undefined,
      ),
      // Alphabetical, because this list is rendered straight into a dropdown.
      orderBy: asc(products.name),
      // Trần cứng: `products` là dữ liệu người dùng tự tạo (thêm cả nhân bản qua `POST /:id/copy`),
      // không phải catalogue nhỏ cố định như units/countries.
      limit: 100,
    });

    return plainToInstance(ProductOptionResDto, entities, {
      excludeExtraneousValues: true,
    });
  }

  async getProductDetail(productId: string): Promise<ProductDetailResDto> {
    const product = await this.db.query.products.findFirst({
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
      with: {
        client: true,
        group: true,
        unit: true,
        creator: true,
        imageFile: true,
        clonedFrom: { columns: { id: true, code: true, name: true } },
      },
    });

    if (!product) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(ProductDetailResDto, product, {
      excludeExtraneousValues: true,
    });
  }

  async createProduct(
    reqDto: CreateProductReqDto,
    userId: string,
  ): Promise<void> {
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
    if (reqDto.imageFileId) {
      await this.filesService.linkFiles([reqDto.imageFileId]);
    }

    // `type`/`status` đều có default ở cột schema (`ProductType.FINISHED_GOOD`/
    // `ProductStatus.ACTIVE`) — bỏ trống là DB tự điền, không cần lặp lại default ở đây.
    await this.db.insert(products).values({
      ...reqDto,
      code,
      createdBy: userId,
    });
  }

  async updateProduct(
    productId: string,
    reqDto: UpdateProductReqDto,
  ): Promise<void> {
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
    if (reqDto.imageFileId) {
      await this.filesService.linkFiles([reqDto.imageFileId]);
    }

    // `updated_at` is bumped by the column's own `$onUpdate`.
    await this.db
      .update(products)
      .set(reqDto)
      .where(eq(products.id, productId));
  }

  async getProductMaterials(
    productId: string,
    reqDto: GetBomMaterialsReqDto,
  ): Promise<OffsetPaginatedDto<BomMaterialResDto>> {
    await this.ensureProductExists(productId);

    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      eq(boms.productId, productId),
      keyword
        ? or(
            unaccentILike(materials.code, keyword),
            unaccentILike(materials.name, keyword),
          )
        : undefined,
    );

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          id: bomMaterials.id,
          materialId: materials.id,
          code: materials.code,
          name: materials.name,
          unit: getTableColumns(units),
          image: getTableColumns(files),
          quantity: bomMaterials.quantity,
          sortOrder: bomMaterials.sortOrder,
          note: bomMaterials.note,
        })
        .from(bomMaterials)
        .innerJoin(bomItems, eq(bomMaterials.bomItemId, bomItems.id))
        .innerJoin(boms, eq(bomItems.bomId, boms.id))
        .innerJoin(materials, eq(bomMaterials.materialId, materials.id))
        .innerJoin(units, eq(materials.unitId, units.id))
        .leftJoin(files, eq(materials.imageFileId, files.id))
        .where(where)
        .orderBy(asc(bomMaterials.sortOrder), asc(bomMaterials.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(bomMaterials)
        .innerJoin(bomItems, eq(bomMaterials.bomItemId, bomItems.id))
        .innerJoin(boms, eq(bomItems.bomId, boms.id))
        .innerJoin(materials, eq(bomMaterials.materialId, materials.id))
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(BomMaterialResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /**
   * Clone a product: creates a new product row with a generated code, keeping sourceProductId lineage.
   */
  async copyProduct(
    productId: string,
    userId: string,
  ): Promise<void> {
    const product = await this.ensureProductExists(productId);
    const code = await this.generateProductCode();

    // 1. Đọc BOM gốc trước khi mở transaction
    const bom = await this.db.query.boms.findFirst({
      columns: { id: true },
      where: eq(boms.productId, productId),
    });

    const items = bom
      ? await this.db.query.bomItems.findMany({
          where: eq(bomItems.bomId, bom.id),
          orderBy: [asc(bomItems.level), asc(bomItems.sortOrder)],
        })
      : [];

    const bomItemIds = items.map((item) => item.id);

    const materials = bomItemIds.length
      ? await this.db.query.bomMaterials.findMany({
          where: inArray(bomMaterials.bomItemId, bomItemIds),
        })
      : [];

    // 2. Mở transaction để ghi dữ liệu mới
    await this.db.transaction(async (tx) => {
      const {
        id: clonedFromProductId,
        code: _,
        createdAt,
        updatedAt,
        deletedAt,
        createdBy,
        ...copyFields
      } = product;

      const [createdProduct] = await tx
        .insert(products)
        .values({
          ...copyFields,
          code,
          clonedFromProductId,
          createdBy: userId,
        })
        .returning({ id: products.id });

      // 3. Clone cây BOM & Vật tư qua hàm trợ lý
      if (bom) {
        await this.copyBomTree(
          tx,
          createdProduct.id,
          items,
          materials,
          userId,
        );
      }
    });
  }

  private async copyBomTree(
    tx: DbTransaction,
    productId: string,
    items: BomItemSelect[],
    materials: BomMaterialSelect[],
    userId: string,
  ): Promise<void> {
    const [newBom] = await tx
      .insert(boms)
      .values({ productId, createdBy: userId })
      .returning({ id: boms.id });

    const newIdByOldId = new Map<string, string>();

    const newItems = items.map(
      ({
        id: oldId,
        parentId: oldParentId,
        bomId: _,
        createdAt,
        updatedAt,
        ...item
      }) => {
        const id = crypto.randomUUID();
        newIdByOldId.set(oldId, id);

        return {
          ...item,
          id,
          bomId: newBom.id,
          parentId: oldParentId
            ? (newIdByOldId.get(oldParentId) ?? null)
            : null,
          createdBy: userId,
        };
      },
    );

    if (newItems.length) {
      await tx.insert(bomItems).values(newItems);
    }

    if (materials.length) {
      await tx.insert(bomMaterials).values(
        materials.map(
          ({ id, createdAt, updatedAt, bomItemId: oldItemId, ...mat }) => ({
            ...mat,
            bomItemId: newIdByOldId.get(oldItemId)!,
            createdBy: userId,
          }),
        ),
      );
    }
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

  private async validateCodeUniqueness(
    code: string,
    ignoredProductId?: string,
  ): Promise<void> {
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

  /**
   * The unit must exist *and* be flagged as usable on products — filtering the dropdown with
   * `GET /units?scope=PRODUCT` is cosmetic on its own, a client can still post any unit id.
   */
  private async ensureUnitExists(unitId: string): Promise<void> {
    const existing = await this.db.query.units.findFirst({
      columns: { id: true },
      with: { scopes: { columns: { scope: true } } },
      where: eq(units.id, unitId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E011, HttpStatus.NOT_FOUND);
    }
    if (!existing.scopes.some(({ scope }) => scope === UnitScope.PRODUCT)) {
      throw new AppException(ErrorCode.E043, HttpStatus.BAD_REQUEST);
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

  private async ensureProductGroupExists(
    productGroupId: string,
  ): Promise<void> {
    const existing = await this.db.query.productGroups.findFirst({
      columns: { id: true },
      where: eq(productGroups.id, productGroupId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E010, HttpStatus.NOT_FOUND);
    }
  }

  private async generateProductCode(): Promise<string> {
    const [totalRows] = await this.db.select({ total: count() }).from(products);
    return `SP${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }
}
