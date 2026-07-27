import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  desc,
  eq,
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
  boms,
  clients,
  productAttachments,
  productGroups,
  products,
  ProductStatus,
  ProductType,
  routingSteps,
  units,
  UnitScope,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { formatLtreeNodeId } from '../boms/utils/ltree.util';
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
  source: { columns: { id: true, code: true, name: true } },
} as const;

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
          source: { columns: { id: true, code: true, name: true } },
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

  async createProduct(
    reqDto: CreateProductReqDto,
    userId: string,
  ): Promise<ProductResDto> {
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
          type: reqDto.type ?? ProductType.FINISHED_GOOD,
          status: reqDto.status ?? ProductStatus.ACTIVE,
          createdBy: userId,
        })
        .returning();

      if (attachmentFileIds?.length) {
        await this.createAttachments(tx, product.id, attachmentFileIds);
      }

      return product.id;
    });

    return this.getProductDetail(productId);
  }

  async updateProduct(
    productId: string,
    reqDto: UpdateProductReqDto,
  ): Promise<ProductResDto> {
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
      // `updated_at` is bumped by the column's own `$onUpdate`.
      await tx
        .update(products)
        .set(productFields)
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

    await this.db
      .update(products)
      .set({ deletedAt: new Date() })
      .where(eq(products.id, productId));
  }

  /**
   * Deep-clones a product: the row itself, its attachments, its whole BOM tree, its Cấp 0 root
   * routing, and each cloned node's own as-used routing — a full independent product, not a
   * version of the source. `sourceProductId` records lineage only ("Sao chép từ"); nothing about
   * the clone stays linked to the source afterward.
   */
  async copyProduct(productId: string, userId: string): Promise<ProductResDto> {
    const original = await this.ensureProductExists(productId);
    const code = await this.generateProductCode();

    // Every read happens before the transaction opens — see `.claude/rules/api-module.md`.

    // The copy points at the same file rows as the original — `files` is a registry, and both
    // products referencing one row is exactly what it is for. Skipping this would silently give
    // the copy an empty document list.
    const originalAttachments = await this.db.query.productAttachments.findMany(
      {
        columns: { fileId: true },
        where: eq(productAttachments.productId, productId),
      },
    );

    const sourceBom = await this.db.query.boms.findFirst({
      columns: { id: true },
      where: eq(boms.productId, productId),
    });
    // Parents always precede their children: `checkNoCycle`-free copy relies on visiting a node
    // only after its parent has already been remapped (see `cloneBomTree`).
    const sourceBomItems = sourceBom
      ? await this.db.query.bomItems.findMany({
          where: eq(bomItems.bomId, sourceBom.id),
          orderBy: [asc(bomItems.level), asc(bomItems.sortOrder)],
        })
      : [];

    // Cấp 0 (root product) routing — keyed by productId, unrelated to the BOM tree.
    const sourceRootOperations = await this.db.query.routingSteps.findMany({
      where: eq(routingSteps.productId, productId),
    });

    // As-used routing on each source node — remapped through `newBomItemIdByOldId` once the tree
    // itself has been cloned (see below). Empty tree → nothing to fetch.
    const sourceNodeOperations = sourceBomItems.length
      ? await this.db.query.routingSteps.findMany({
          where: inArray(
            routingSteps.bomItemId,
            sourceBomItems.map((item) => item.id),
          ),
        })
      : [];

    const copyId = await this.db.transaction(async (tx) => {
      const [product] = await tx
        .insert(products)
        .values({
          code,
          name: original.name,
          type: original.type,
          imageFileId: original.imageFileId,
          sourceProductId: original.id,
          status: original.status,
          note: original.note,
          clientId: original.clientId,
          productGroupId: original.productGroupId,
          unitId: original.unitId,
          createdBy: userId,
        })
        .returning();

      if (originalAttachments.length) {
        await this.createAttachments(
          tx,
          product.id,
          originalAttachments.map(({ fileId }) => fileId),
        );
      }

      const newBomItemIdByOldId = sourceBomItems.length
        ? await this.cloneBomTree(tx, product.id, sourceBomItems, userId)
        : new Map<string, string>();

      if (sourceRootOperations.length) {
        await tx.insert(routingSteps).values(
          sourceRootOperations.map((step) => ({
            productId: product.id,
            bomItemId: null,
            operationId: step.operationId,
            sortOrder: step.sortOrder,
            note: step.note,
            createdBy: userId,
          })),
        );
      }

      const clonedNodeSteps = sourceNodeOperations.flatMap((step) => {
        const bomItemId = step.bomItemId
          ? newBomItemIdByOldId.get(step.bomItemId)
          : undefined;
        return bomItemId
          ? [
              {
                productId: null,
                bomItemId,
                operationId: step.operationId,
                sortOrder: step.sortOrder,
                note: step.note,
                createdBy: userId,
              },
            ]
          : [];
      });

      if (clonedNodeSteps.length) {
        await tx.insert(routingSteps).values(clonedNodeSteps);
      }

      return product.id;
    });

    return this.getProductDetail(copyId);
  }

  /**
   * Inserts a fresh `boms` header for `newProductId`, then clones every source `bom_items` row
   * onto it: new ids, `parentId` remapped through the old→new id map, and `path` rebuilt from the
   * *new* parent's path (the old ltree path embeds the old ids, so it can't just be copied).
   * `productId`/`materialId` on each row still point at the original WIP/material — cloning a BOM
   * does not recursively clone the products it references. Requires `sourceItems` to already be
   * ordered parent-before-child (by `level`), so a parent's remapped id/path always exists in the
   * maps by the time its children are processed. Returns the old→new `bom_items.id` map so the
   * caller can remap each cloned node's own as-used routing (`routing_steps.bom_item_id`).
   */
  private async cloneBomTree(
    tx: DbTransaction,
    newProductId: string,
    sourceItems: (typeof bomItems.$inferSelect)[],
    userId: string,
  ): Promise<Map<string, string>> {
    const [bom] = await tx
      .insert(boms)
      .values({ productId: newProductId, createdBy: userId })
      .returning({ id: boms.id });

    const newIdByOldId = new Map<string, string>();
    const newPathByOldId = new Map<string, string>();

    const newItems = sourceItems.map((item) => {
      const newId = crypto.randomUUID();
      newIdByOldId.set(item.id, newId);

      const newParentId = item.parentId
        ? (newIdByOldId.get(item.parentId) ?? null)
        : null;
      const parentPath = item.parentId
        ? newPathByOldId.get(item.parentId)
        : undefined;
      const nodeKey = formatLtreeNodeId(newId);
      const newPath = parentPath ? `${parentPath}.${nodeKey}` : nodeKey;
      newPathByOldId.set(item.id, newPath);

      return {
        id: newId,
        bomId: bom.id,
        parentId: newParentId,
        itemType: item.itemType,
        productId: item.productId,
        materialId: item.materialId,
        quantity: item.quantity,
        path: newPath,
        level: item.level,
        sortOrder: item.sortOrder,
        note: item.note,
        createdBy: userId,
      };
    });

    await tx.insert(bomItems).values(newItems);

    return newIdByOldId;
  }

  /**
   * Validates every file id the request carries and marks them linked, so the orphan sweeper
   * leaves them alone. Runs **before** the transaction on purpose — see `FilesService.linkFiles`.
   */
  private async linkSuppliedFiles(
    reqDto: CreateProductReqDto | UpdateProductReqDto,
  ): Promise<void> {
    const fileIds = [
      reqDto.imageFileId,
      ...(reqDto.attachmentFileIds ?? []),
    ].filter((fileId): fileId is string => Boolean(fileId));

    await this.filesService.linkFiles(fileIds);
  }

  /**
   * Writes the attachment rows. Takes `tx` (not `this.db`) so it can only ever be called from
   * inside an open transaction — passing the pooled connection is a compile error.
   */
  private async createAttachments(
    tx: DbTransaction,
    productId: string,
    fileIds: string[],
  ): Promise<void> {
    await tx
      .insert(productAttachments)
      .values(fileIds.map((fileId) => ({ productId, fileId })));
  }

  /** Replace-all. `tx` is required so a caller cannot accidentally write outside the transaction. */
  private async replaceAttachments(
    tx: DbTransaction,
    productId: string,
    attachmentFileIds: string[],
  ): Promise<void> {
    await tx
      .delete(productAttachments)
      .where(eq(productAttachments.productId, productId));

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
