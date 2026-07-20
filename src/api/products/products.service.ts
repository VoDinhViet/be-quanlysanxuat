import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  clients,
  productAttachments,
  productGroups,
  products,
  ProductStatus,
  units,
  UnitScope,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { CreateProductReqDto } from './dto/create-product.req.dto';
import { GetProductsReqDto } from './dto/get-products.req.dto';
import { ProductResDto } from './dto/product.res.dto';
import { UpdateProductReqDto } from './dto/update-product.req.dto';

const PRODUCT_DETAIL_WITH = {
  client: true,
  group: true,
  unit: true,
  creator: true,
  imageFile: true,
  attachments: { with: { file: true } },
} as const;

@Injectable()
export class ProductsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly filesService: FilesService,
  ) {}

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

  async getProductDetail(productId: string): Promise<ProductResDto> {
    const product = await this.db.query.products.findFirst({
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
      with: PRODUCT_DETAIL_WITH,
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
    await this.linkSuppliedFiles(reqDto);

    // `attachmentFileIds` has no column on `products` — it must be peeled off before the spread,
    // or drizzle tries to write a field that does not exist.
    const { attachmentFileIds, ...productFields } = reqDto;

    // The product row and its attachments must land together: without this transaction a failing
    // attachment insert would leave a committed product with no documents.
    const productId = await this.db.transaction(async (tx) => {
      const [product] = await tx
        .insert(products)
        .values({
          ...productFields,
          code,
          revision: reqDto.revision ?? 'R01',
          status: reqDto.status ?? ProductStatus.ACTIVE,
          createdBy: userId,
        })
        .returning();

      if (attachmentFileIds?.length) {
        await this.insertAttachments(tx, product.id, attachmentFileIds);
      }

      return product.id;
    });

    return this.getProductDetail(productId);
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
    await this.linkSuppliedFiles(reqDto);

    const { attachmentFileIds, ...productFields } = reqDto;

    await this.db.transaction(async (tx) => {
      // `updatedAt` is always written, which doubles as the reason `.set()` is safe here: drizzle
      // throws a bare "No values to set" (a 500) when every value is `undefined`, which is the
      // normal shape of a PATCH touching only `attachmentFileIds`.
      await tx
        .update(products)
        .set({ ...productFields, updatedAt: new Date() })
        .where(eq(products.id, productId));

      // Truthiness on the array itself, not `.length`: `[]` means "remove every document",
      // `undefined` means "this PATCH does not touch documents".
      if (attachmentFileIds) {
        await this.replaceAttachments(tx, productId, attachmentFileIds);
      }
    });

    return this.getProductDetail(productId);
  }

  async deleteProduct(productId: string): Promise<void> {
    await this.ensureProductExists(productId);

    await this.db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, productId));
  }

  async copyProduct(productId: string, userId: string): Promise<ProductResDto> {
    const original = await this.ensureProductExists(productId);
    const code = await this.generateProductCode();

    // The copy points at the same file rows as the original — `files` is a registry, and both
    // products referencing one row is exactly what it is for. Skipping this would silently give
    // the copy an empty document list.
    const originalAttachments = await this.db.query.productAttachments.findMany({
      columns: { fileId: true },
      where: eq(productAttachments.productId, productId),
    });

    const copyId = await this.db.transaction(async (tx) => {
      const [product] = await tx
        .insert(products)
        .values({
          code,
          name: original.name,
          imageFileId: original.imageFileId,
          revision: original.revision,
          status: original.status,
          note: original.note,
          clientId: original.clientId,
          productGroupId: original.productGroupId,
          unitId: original.unitId,
          createdBy: userId,
        })
        .returning();

      if (originalAttachments.length) {
        await this.insertAttachments(
          tx,
          product.id,
          originalAttachments.map(({ fileId }) => fileId),
        );
      }

      return product.id;
    });

    return this.getProductDetail(copyId);
  }

  /**
   * Validates every file id the request carries and marks them linked, so the orphan sweeper
   * leaves them alone. Runs **before** the transaction on purpose — see `FilesService.linkFiles`.
   */
  private async linkSuppliedFiles(
    reqDto: CreateProductReqDto | UpdateProductReqDto,
  ): Promise<void> {
    const fileIds = [reqDto.imageFileId, ...(reqDto.attachmentFileIds ?? [])].filter(
      (fileId): fileId is string => Boolean(fileId),
    );

    await this.filesService.linkFiles(fileIds);
  }

  /**
   * Writes the attachment rows. Takes `tx` (not `this.db`) so it can only ever be called from
   * inside an open transaction — passing the pooled connection is a compile error.
   */
  private async insertAttachments(
    tx: DbTransaction,
    productId: string,
    fileIds: string[],
  ): Promise<void> {
    await tx.insert(productAttachments).values(fileIds.map((fileId) => ({ productId, fileId })));
  }

  /** Replace-all. `tx` is required so a caller cannot accidentally write outside the transaction. */
  private async replaceAttachments(
    tx: DbTransaction,
    productId: string,
    attachmentFileIds: string[],
  ): Promise<void> {
    await tx.delete(productAttachments).where(eq(productAttachments.productId, productId));

    if (attachmentFileIds.length) {
      await tx
        .insert(productAttachments)
        .values(attachmentFileIds.map((fileId) => ({ productId, fileId })));
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
    const [totalRows] = await this.db.select({ total: count() }).from(products);
    return `SP${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }
}
