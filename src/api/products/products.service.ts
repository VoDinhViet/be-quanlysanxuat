import { randomUUID } from 'node:crypto';
import { rename, unlink } from 'node:fs/promises';
import { extname, isAbsolute, join } from 'node:path';

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
  productFiles,
  productRevisions,
  products,
  ProductItemType,
  ProductStatus,
  productTypes,
  routingSteps,
  suppliers,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import {
  MAX_PRODUCT_IMAGE_SIZE_IN_BYTES,
  PRODUCT_IMAGE_ALLOWED_MIME_TYPES,
  PRODUCT_IMAGE_PUBLIC_DIR,
  PRODUCT_IMAGE_UPLOAD_DIR,
} from './constants/product-image.constants';
import { BomLineResDto } from './dto/bom-line.res.dto';
import { BomTreeNodeResDto } from './dto/bom-tree-node.res.dto';
import { CreateBomLineReqDto } from './dto/create-bom-line.req.dto';
import { CreateProductReqDto } from './dto/create-product.req.dto';
import { CreateProductRevisionReqDto } from './dto/create-product-revision.req.dto';
import { GetProductsReqDto } from './dto/get-products.req.dto';
import { ProductOptionResDto } from './dto/product-option.res.dto';
import { ProductRevisionResDto } from './dto/product-revision.res.dto';
import { ProductResDto } from './dto/product.res.dto';
import { RoutingStepResDto } from './dto/routing-step.res.dto';
import { UpdateBomLineReqDto } from './dto/update-bom-line.req.dto';
import { UpdateProductReqDto } from './dto/update-product.req.dto';
import { UpdateProductRevisionReqDto } from './dto/update-product-revision.req.dto';
import { UpdateRoutingReqDto } from './dto/update-routing.req.dto';
import type { ProductImageFile } from './types/product-image-file.type';

@Injectable()
export class ProductsService {
  private static readonly COPY_CODE_SUFFIX = '-COPY';
  private static readonly MAX_PRODUCT_CODE_LENGTH = 50;
  private static readonly MAX_COPY_CODE_ATTEMPTS = 1000;

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
    await this.ensureProductUnlocked(productId);
    this.ensureProductStatusUpdateAllowed(reqDto.status);

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

  /**
   * Stores a product image file, replaces any active image metadata, and updates the product URL.
   *
   * @param productId - Product identifier whose image should be replaced.
   * @param file - Uploaded multipart image saved temporarily by Multer.
   * @param uploadedByUserId - Authenticated user identifier for file ownership metadata.
   * @returns Updated product response with the new public image URL.
   */
  async uploadProductImage(
    productId: string,
    file: ProductImageFile | undefined,
    uploadedByUserId: string,
  ): Promise<ProductResDto> {
    const uploadedFile = await this.ensureUploadedProductImageAllowed(file);
    const extension = this.getProductImageExtension(uploadedFile.mimetype);
    const fileName = `${productId}-${randomUUID()}${extension}`;
    const relativeFilePath = `${PRODUCT_IMAGE_PUBLIC_DIR}/${fileName}`;
    const publicImageUrl = `/${relativeFilePath}`;
    const targetFilePath = join(PRODUCT_IMAGE_UPLOAD_DIR, fileName);
    let isFileMoved = false;

    try {
      await this.ensureProductUnlocked(productId);
      await rename(uploadedFile.path, targetFilePath);
      isFileMoved = true;

      const existingFiles = await this.getActiveProductFiles(productId);
      const updatedAt = new Date();

      await this.db.transaction(async (tx) => {
        await tx
          .update(productFiles)
          .set({
            deletedAt: updatedAt,
            updatedAt,
          })
          .where(and(eq(productFiles.productId, productId), isNull(productFiles.deletedAt)));

        await tx.insert(productFiles).values({
          productId,
          originalName: uploadedFile.originalname,
          fileName,
          mimeType: uploadedFile.mimetype,
          fileSize: uploadedFile.size,
          filePath: relativeFilePath,
          uploadedBy: uploadedByUserId,
        });

        await tx
          .update(products)
          .set({
            imageUrl: publicImageUrl,
            updatedAt,
          })
          .where(and(eq(products.id, productId), isNull(products.deletedAt)));
      });

      await this.deleteProductLocalFiles(existingFiles);

      return this.getProductDetail(productId);
    } catch (error) {
      await this.deleteLocalFile(isFileMoved ? targetFilePath : uploadedFile.path);
      throw error;
    }
  }

  /**
   * Clears a product image and soft-deletes the active image file records.
   *
   * @param productId - Product identifier whose image should be removed.
   * @returns Updated product response with no public image URL.
   */
  async deleteProductImage(productId: string): Promise<ProductResDto> {
    await this.ensureProductUnlocked(productId);

    const existingFiles = await this.getActiveProductFiles(productId);
    const deletedAt = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .update(productFiles)
        .set({
          deletedAt,
          updatedAt: deletedAt,
        })
        .where(and(eq(productFiles.productId, productId), isNull(productFiles.deletedAt)));

      await tx
        .update(products)
        .set({
          imageUrl: null,
          updatedAt: deletedAt,
        })
        .where(and(eq(products.id, productId), isNull(products.deletedAt)));
    });

    await this.deleteProductLocalFiles(existingFiles);

    return this.getProductDetail(productId);
  }

  async lockProduct(productId: string): Promise<ProductResDto> {
    await this.ensureProductExists(productId);

    await this.db
      .update(products)
      .set({
        status: ProductStatus.Locked,
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, productId), isNull(products.deletedAt)));

    return this.getProductDetail(productId);
  }

  /**
   * Opens a locked product by restoring the active status for future edits.
   *
   * @param productId - Product identifier to unlock.
   * @returns Updated product response DTO with active status.
   */
  async unlockProduct(productId: string): Promise<ProductResDto> {
    await this.ensureProductExists(productId);

    await this.db
      .update(products)
      .set({
        status: ProductStatus.Active,
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, productId), isNull(products.deletedAt)));

    return this.getProductDetail(productId);
  }

  async copyProduct(productId: string): Promise<ProductResDto> {
    const sourceProduct = await this.getProductWithCurrentRevision(productId);
    const sourceRevision = sourceProduct.revisions[0];

    if (!sourceRevision) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }

    const [sourceBomLines, sourceRoutingSteps, copiedCode] = await Promise.all([
      this.getBomLines(sourceRevision.id),
      this.getRoutingSteps(sourceRevision.id),
      this.generateProductCopyCode(sourceProduct.code),
    ]);

    const copiedProduct = await this.db.transaction(async (tx) => {
      const [createdProduct] = await tx
        .insert(products)
        .values({
          clientId: sourceProduct.clientId,
          code: copiedCode,
          name: `${sourceProduct.name} Copy`,
          itemType: sourceProduct.itemType,
          unitId: sourceProduct.unitId,
          imageUrl: sourceProduct.imageUrl,
          status: ProductStatus.Active,
          note: sourceProduct.note,
        })
        .returning();

      const [createdRevision] = await tx
        .insert(productRevisions)
        .values({
          productId: createdProduct.id,
          revisionNo: sourceRevision.revisionNo,
          note: sourceRevision.note,
        })
        .returning();

      if (sourceBomLines.length > 0) {
        await tx.insert(bomLines).values(
          sourceBomLines.map((line) => ({
            productRevisionId: createdRevision.id,
            parentItemId:
              line.parentItemId === sourceProduct.id ? createdProduct.id : line.parentItemId,
            childItemId:
              line.childItemId === sourceProduct.id ? createdProduct.id : line.childItemId,
            qty: line.qty,
            unitId: line.unitId,
            scrapRate: line.scrapRate,
            level: line.level,
            sortOrder: line.sortOrder,
            note: line.note,
          })),
        );
      }

      if (sourceRoutingSteps.length > 0) {
        await tx.insert(routingSteps).values(
          sourceRoutingSteps.map((step) => ({
            productRevisionId: createdRevision.id,
            itemId: step.itemId === sourceProduct.id ? createdProduct.id : step.itemId,
            operationId: step.operationId,
            stepNo: step.stepNo,
            isOutsideProcess: step.isOutsideProcess,
            defaultSupplierId: step.defaultSupplierId,
            note: step.note,
          })),
        );
      }

      return createdProduct;
    });

    return this.getProductDetail(copiedProduct.id);
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

  /**
   * Creates a product revision and optionally copies BOM/routing from a source revision.
   *
   * @param productId - Product identifier that owns the new revision.
   * @param reqDto - Revision number, optional source revision, and revision note.
   * @returns Created product revision response DTO.
   */
  async createProductRevision(
    productId: string,
    reqDto: CreateProductRevisionReqDto,
  ): Promise<ProductRevisionResDto> {
    await this.ensureProductUnlocked(productId);
    await this.ensureRevisionNoAvailable(productId, reqDto.revisionNo);

    if (reqDto.copyFromRevisionId) {
      await this.ensureProductRevisionExists(productId, reqDto.copyFromRevisionId);
    }

    const [sourceBomLines, sourceRoutingSteps] = reqDto.copyFromRevisionId
      ? await Promise.all([
          this.getBomLines(reqDto.copyFromRevisionId),
          this.getRoutingSteps(reqDto.copyFromRevisionId),
        ])
      : [[], []];

    const revision = await this.db.transaction(async (tx) => {
      const [createdRevision] = await tx
        .insert(productRevisions)
        .values({
          productId,
          revisionNo: reqDto.revisionNo,
          note: reqDto.note,
        })
        .returning();

      if (sourceBomLines.length > 0) {
        await tx.insert(bomLines).values(
          sourceBomLines.map((line) => ({
            productRevisionId: createdRevision.id,
            parentItemId: line.parentItemId,
            childItemId: line.childItemId,
            qty: line.qty,
            unitId: line.unitId,
            scrapRate: line.scrapRate,
            level: line.level,
            sortOrder: line.sortOrder,
            note: line.note,
          })),
        );
      }

      if (sourceRoutingSteps.length > 0) {
        await tx.insert(routingSteps).values(
          sourceRoutingSteps.map((step) => ({
            productRevisionId: createdRevision.id,
            itemId: step.itemId,
            operationId: step.operationId,
            stepNo: step.stepNo,
            isOutsideProcess: step.isOutsideProcess,
            defaultSupplierId: step.defaultSupplierId,
            note: step.note,
          })),
        );
      }

      return createdRevision;
    });

    return this.mapRevision(revision);
  }

  async updateProductRevision(
    productId: string,
    revisionId: string,
    reqDto: UpdateProductRevisionReqDto,
  ): Promise<ProductRevisionResDto> {
    await this.ensureProductUnlocked(productId);
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
        orderBy: [
          asc(bomLines.level),
          asc(bomLines.parentItemId),
          asc(bomLines.sortOrder),
          asc(bomLines.createdAt),
        ],
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
    await this.ensureProductUnlocked(productId);
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
    const sortOrder =
      reqDto.sortOrder ?? this.getNextBomSortOrder(reqDto.parentItemId, existingLines);

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
        sortOrder,
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
    await this.ensureProductUnlocked(productId);

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
        sortOrder: reqDto.sortOrder,
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
    await this.ensureProductUnlocked(productId);

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

  async getRouting(
    productId: string,
    revisionId: string,
    itemId: string,
  ): Promise<RoutingStepResDto[]> {
    await this.ensureProductRevisionExists(productId, revisionId);

    const [item, lines] = await Promise.all([
      this.getBomItem(itemId),
      this.getBomLines(revisionId),
    ]);

    this.ensureRoutingItemAllowed(item);
    this.ensureRoutingItemAttached(productId, itemId, lines);

    const steps = await this.db.query.routingSteps.findMany({
      where: and(
        eq(routingSteps.productRevisionId, revisionId),
        eq(routingSteps.itemId, itemId),
        isNull(routingSteps.deletedAt),
      ),
      with: {
        operation: true,
        defaultSupplier: true,
      },
      orderBy: asc(routingSteps.stepNo),
    });

    return this.mapRoutingSteps(steps);
  }

  async updateRouting(
    productId: string,
    revisionId: string,
    itemId: string,
    reqDto: UpdateRoutingReqDto,
  ): Promise<RoutingStepResDto[]> {
    await this.ensureProductRevisionExists(productId, revisionId);
    await this.ensureProductUnlocked(productId);

    const [item, lines] = await Promise.all([
      this.getBomItem(itemId),
      this.getBomLines(revisionId),
    ]);

    this.ensureRoutingItemAllowed(item);
    this.ensureRoutingItemAttached(productId, itemId, lines);
    this.ensureRoutingStepsAllowed(reqDto);

    await this.ensureRoutingReferencesExist(reqDto);

    await this.db.transaction(async (tx) => {
      const deletedAt = new Date();

      await tx
        .update(routingSteps)
        .set({
          deletedAt,
          updatedAt: deletedAt,
        })
        .where(
          and(
            eq(routingSteps.productRevisionId, revisionId),
            eq(routingSteps.itemId, itemId),
            isNull(routingSteps.deletedAt),
          ),
        );

      if (reqDto.steps.length === 0) {
        return;
      }

      await tx.insert(routingSteps).values(
        reqDto.steps.map((step) => ({
          productRevisionId: revisionId,
          itemId,
          operationId: step.operationId,
          stepNo: step.stepNo,
          isOutsideProcess: step.isOutsideProcess ?? false,
          defaultSupplierId: step.defaultSupplierId ?? null,
          note: step.note ?? null,
        })),
      );
    });

    return this.getRouting(productId, revisionId, itemId);
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

  private async getProductWithCurrentRevision(productId: string): Promise<ProductWithRevisions> {
    const product = await this.db.query.products.findFirst({
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
      with: {
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

    return product;
  }

  private async ensureProductUnlocked(productId: string): Promise<void> {
    const existingProduct = await this.db.query.products.findFirst({
      columns: {
        id: true,
        status: true,
      },
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
    });

    if (!existingProduct) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }

    if (existingProduct.status === ProductStatus.Locked) {
      throw new AppException(ErrorCode.E006, HttpStatus.CONFLICT, 'Product is locked');
    }
  }

  private ensureProductStatusUpdateAllowed(status?: ProductStatus): void {
    if (status === ProductStatus.Locked) {
      throw new AppException(ErrorCode.V002, HttpStatus.UNPROCESSABLE_ENTITY);
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

  private async getRoutingSteps(revisionId: string): Promise<(typeof routingSteps.$inferSelect)[]> {
    return this.db.query.routingSteps.findMany({
      where: and(eq(routingSteps.productRevisionId, revisionId), isNull(routingSteps.deletedAt)),
    });
  }

  private async getActiveProductFiles(productId: string): Promise<ProductFileEntity[]> {
    return this.db.query.productFiles.findMany({
      where: and(eq(productFiles.productId, productId), isNull(productFiles.deletedAt)),
    });
  }

  private async ensureUploadedProductImageAllowed(
    file: ProductImageFile | undefined,
  ): Promise<ProductImageFile> {
    if (!file) {
      throw new AppException(ErrorCode.V002, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const isAllowedMimeType = (PRODUCT_IMAGE_ALLOWED_MIME_TYPES as readonly string[]).includes(
      file.mimetype,
    );
    const isAllowedFileSize = file.size <= MAX_PRODUCT_IMAGE_SIZE_IN_BYTES;

    if (!isAllowedMimeType || !isAllowedFileSize) {
      await this.deleteLocalFile(file.path);
      throw new AppException(ErrorCode.V002, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    return file;
  }

  private getProductImageExtension(mimeType: string): string {
    switch (mimeType) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      case 'image/gif':
        return '.gif';
      default:
        return extname(mimeType);
    }
  }

  private async deleteProductLocalFiles(files: ProductFileEntity[]): Promise<void> {
    await Promise.all(
      files.map((file) => this.deleteLocalFile(this.resolveProductFilePath(file.filePath))),
    );
  }

  private resolveProductFilePath(filePath: string): string {
    return isAbsolute(filePath) ? filePath : join(process.cwd(), filePath);
  }

  private async deleteLocalFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch {
      return;
    }
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

  private getNextBomSortOrder(
    parentItemId: string,
    lines: (typeof bomLines.$inferSelect)[],
  ): number {
    const siblingSortOrders = lines
      .filter((line) => line.parentItemId === parentItemId)
      .map((line) => line.sortOrder);

    if (siblingSortOrders.length === 0) {
      return 1;
    }

    return Math.max(...siblingSortOrders) + 1;
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

  private ensureRoutingItemAllowed(item: typeof products.$inferSelect): void {
    if (![ProductItemType.Fg, ProductItemType.Wip].includes(item.itemType)) {
      throw new AppException(ErrorCode.V002, HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }

  private ensureRoutingItemAttached(
    rootProductId: string,
    itemId: string,
    lines: (typeof bomLines.$inferSelect)[],
  ): void {
    const isRoot = itemId === rootProductId;
    const isExistingChild = lines.some((line) => line.childItemId === itemId);

    if (!isRoot && !isExistingChild) {
      throw new AppException(ErrorCode.V002, HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }

  private ensureRoutingStepsAllowed(reqDto: UpdateRoutingReqDto): void {
    const stepNumbers = new Set<number>();

    for (const step of reqDto.steps) {
      if (stepNumbers.has(step.stepNo)) {
        throw new AppException(ErrorCode.V002, HttpStatus.UNPROCESSABLE_ENTITY);
      }

      stepNumbers.add(step.stepNo);

      if (!step.isOutsideProcess && step.defaultSupplierId) {
        throw new AppException(ErrorCode.V002, HttpStatus.UNPROCESSABLE_ENTITY);
      }
    }
  }

  private async ensureRoutingReferencesExist(reqDto: UpdateRoutingReqDto): Promise<void> {
    const operationIds = [...new Set(reqDto.steps.map((step) => step.operationId))];
    const supplierIds = [
      ...new Set(
        reqDto.steps.map((step) => step.defaultSupplierId).filter((id): id is string => !!id),
      ),
    ];

    await Promise.all([
      ...operationIds.map((operationId) => this.ensureOperationExists(operationId)),
      ...supplierIds.map((supplierId) => this.ensureSupplierExists(supplierId)),
    ]);
  }

  private async ensureOperationExists(operationId: string): Promise<void> {
    const existingOperation = await this.db.query.operations.findFirst({
      columns: {
        id: true,
      },
      where: and(eq(operations.id, operationId), isNull(operations.deletedAt)),
    });

    if (!existingOperation) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureSupplierExists(supplierId: string): Promise<void> {
    const existingSupplier = await this.db.query.suppliers.findFirst({
      columns: {
        id: true,
      },
      where: and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)),
    });

    if (!existingSupplier) {
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

  private async generateProductCopyCode(sourceCode: string): Promise<string> {
    for (let attempt = 1; attempt <= ProductsService.MAX_COPY_CODE_ATTEMPTS; attempt += 1) {
      const suffix =
        attempt === 1
          ? ProductsService.COPY_CODE_SUFFIX
          : `${ProductsService.COPY_CODE_SUFFIX}-${attempt}`;
      const baseCode = sourceCode.slice(0, ProductsService.MAX_PRODUCT_CODE_LENGTH - suffix.length);
      const candidateCode = `${baseCode}${suffix}`;
      const existingProduct = await this.db.query.products.findFirst({
        columns: {
          id: true,
        },
        where: eq(products.code, candidateCode),
      });

      if (!existingProduct) {
        return candidateCode;
      }
    }

    throw new AppException(ErrorCode.E104, HttpStatus.CONFLICT);
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
        sortOrder: line?.sortOrder ?? 0,
        hasRouting: routingItemIds.has(product.id),
        children,
      },
      { excludeExtraneousValues: true },
    );
  }

  private mapRoutingSteps(stepEntities: RoutingStepEntityWithRelations[]): RoutingStepResDto[] {
    return plainToInstance(RoutingStepResDto, stepEntities, {
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

type ProductWithUnit = typeof products.$inferSelect & {
  unit: typeof units.$inferSelect;
};

type ProductWithRevisions = typeof products.$inferSelect & {
  revisions: (typeof productRevisions.$inferSelect)[];
};

type ProductFileEntity = typeof productFiles.$inferSelect;

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

type RoutingStepEntityWithRelations = typeof routingSteps.$inferSelect & {
  operation: typeof operations.$inferSelect | null;
  defaultSupplier: typeof suppliers.$inferSelect | null;
};
