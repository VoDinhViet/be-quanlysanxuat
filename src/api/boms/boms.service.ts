import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  asc,
  eq,
  and,
  countDistinct,
  getTableColumns,
  inArray,
  isNull,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  BomItemType,
  bomItems,
  boms,
  files,
  FileKind,
  materials,
  products,
  ProductType,
  routingSteps,
  units,
  UploadType,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { BomItemNodeResDto } from './dto/bom-item-node.res.dto';
import { BomItemResDto } from './dto/bom-item.res.dto';
import { BomMaterialResDto } from './dto/bom-material.res.dto';
import { CreateBomItemReqDto } from './dto/create-bom-item.req.dto';
import { GetBomMaterialsReqDto } from './dto/get-bom-materials.req.dto';
import { UpdateBomItemReqDto } from './dto/update-bom-item.req.dto';
import type {
  BomTreeFileRow,
  BomTreeNode,
  BomTreeOperationRow,
  BomTreeRow,
} from './types/bom-tree.type';
import { formatLtreeNodeId } from './utils/ltree.util';

// Aliased twice: a row's item is either a product or a material (never both), so its unit/image
// comes from whichever side the left joins actually populated.
const productUnits = alias(units, 'product_units');
const materialUnits = alias(units, 'material_units');
const productImageFiles = alias(files, 'product_image_files');
const materialImageFiles = alias(files, 'material_image_files');
// A node's own drawing is a direct, single-source left join (bom_items.drawingFileId), not a
// 2-source coalesce like image/unit above — one alias is enough.
const bomItemDrawingFiles = alias(files, 'bom_item_drawing_files');

// Raw shape `baseItemSelect()` returns, before `normalizeImage` collapses the all-null coalesced
// `image` sub-select to `null` — see `BomTreeRow` for the post-normalize shape. Derived from
// `BomTreeFileRow` (each field individually nullable, matching the per-field SQL `coalesce()`)
// instead of re-listing the same 7 fields a third time.
type RawBomItemRow = Omit<BomTreeRow, 'image'> & {
  image: { [K in keyof BomTreeFileRow]: BomTreeFileRow[K] | null };
};

@Injectable()
export class BomsService {
  private static readonly MAX_BOM_DEPTH = 50;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly filesService: FilesService,
  ) {}

  async getBomTree(productId: string): Promise<BomItemResDto[]> {
    await this.ensureProductExists(productId);

    const bom = await this.db.query.boms.findFirst({
      columns: { id: true },
      where: eq(boms.productId, productId),
    });

    // No BOM configured for this product yet — a normal state, not an error.
    if (!bom) {
      return [];
    }

    const rows = (
      await this.baseItemSelect()
        .where(eq(bomItems.bomId, bom.id))
        .orderBy(asc(bomItems.sortOrder), asc(bomItems.createdAt))
    ).map((row) => this.normalizeImage(row));

    const operationsByBomItem = await this.loadOperationsByBomItem(rows);

    const tree = this.buildTree(rows, operationsByBomItem);

    return tree.map((node) =>
      plainToInstance(BomItemResDto, node, { excludeExtraneousValues: true }),
    );
  }

  /**
   * A BOM's materials, aggregated across every `itemType = MATERIAL` node in the tree (any
   * depth) that links to a given material — one row per distinct material, paginated.
   * `totalQuantity` is a raw SUM across matching nodes, NOT a BOM explosion (no multiplying
   * through an ancestor WIP's own quantity) — see `BomMaterialResDto`.
   */
  async getBomMaterials(
    productId: string,
    reqDto: GetBomMaterialsReqDto,
  ): Promise<OffsetPaginatedDto<BomMaterialResDto>> {
    await this.ensureProductExists(productId);

    const bom = await this.db.query.boms.findFirst({
      columns: { id: true },
      where: eq(boms.productId, productId),
    });

    // No BOM configured for this product yet — an empty page, not an error (mirrors getBomTree).
    if (!bom) {
      return new OffsetPaginatedDto([], new OffsetPaginationDto(0, reqDto));
    }

    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      eq(bomItems.bomId, bom.id),
      eq(bomItems.itemType, BomItemType.MATERIAL),
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
          materialId: materials.id,
          code: materials.code,
          name: materials.name,
          unit: getTableColumns(units),
          image: getTableColumns(files),
          totalQuantity: sql<number>`sum(${bomItems.quantity})`.mapWith(Number),
        })
        .from(bomItems)
        .innerJoin(materials, eq(bomItems.materialId, materials.id))
        .innerJoin(units, eq(materials.unitId, units.id))
        .leftJoin(files, eq(materials.imageFileId, files.id))
        .where(where)
        .groupBy(materials.id, units.id, files.id)
        .orderBy(asc(materials.code))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: countDistinct(bomItems.materialId) })
        .from(bomItems)
        .innerJoin(materials, eq(bomItems.materialId, materials.id))
        .where(where),
    ]);

    // A nested selection object whose fields all belong to one left-joined table (`files` here)
    // is collapsed to a plain `null` by drizzle at the row-mapping layer when that join found no
    // match — no manual all-null-fields check needed, unlike `baseItemSelect()`'s SQL `coalesce()`
    // over two *different* possible source tables.
    return new OffsetPaginatedDto(
      plainToInstance(BomMaterialResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /**
   * Adds one node ("[+]" popup) as a child of `reqDto.parentId`, or a top-level item (direct
   * child of the FG root) when omitted.
   */
  async addBomItem(
    productId: string,
    reqDto: CreateBomItemReqDto,
    userId: string,
  ): Promise<BomItemNodeResDto> {
    await this.ensureProductExists(productId);

    if (reqDto.itemType === BomItemType.PRODUCT) {
      await this.ensureProductIsWip(reqDto.itemId);
      if (!Number.isInteger(reqDto.quantity)) {
        throw new AppException(ErrorCode.E055, HttpStatus.BAD_REQUEST);
      }
    } else {
      await this.ensureMaterialExists(reqDto.itemId);
    }

    const existingBom = await this.db.query.boms.findFirst({
      columns: { id: true },
      where: eq(boms.productId, productId),
    });

    if (reqDto.parentId) {
      // No BOM at all yet means no bom_items row could possibly match this parentId.
      if (!existingBom) {
        throw new AppException(ErrorCode.E051, HttpStatus.NOT_FOUND);
      }
      await this.ensureParentValid(existingBom.id, reqDto.parentId);
    }

    if (reqDto.itemType === BomItemType.PRODUCT) {
      await this.checkNoCycle(
        existingBom?.id,
        productId,
        reqDto.parentId ?? null,
        reqDto.itemId,
      );
    }

    if (reqDto.drawingFileId) {
      await this.filesService.linkFiles([reqDto.drawingFileId]);
    }

    const { bomId, itemId } = await this.db.transaction(async (tx) => {
      let bomId = existingBom?.id;

      if (!bomId) {
        const [created] = await tx
          .insert(boms)
          .values({ productId, createdBy: userId })
          .onConflictDoNothing({ target: boms.productId })
          .returning({ id: boms.id });

        bomId =
          created?.id ??
          (
            await tx.query.boms.findFirst({
              columns: { id: true },
              where: eq(boms.productId, productId),
            })
          )?.id;
      }

      const newItemId = crypto.randomUUID();
      let parentPath: string | null = null;
      let parentLevel = 0;

      if (reqDto.parentId) {
        const parentItem = await tx.query.bomItems.findFirst({
          columns: { path: true, level: true },
          where: eq(bomItems.id, reqDto.parentId),
        });
        if (parentItem) {
          parentPath = parentItem.path;
          parentLevel = parentItem.level ?? 1;
        }
      }

      const itemLevel = reqDto.parentId ? parentLevel + 1 : 1;
      const nodeKey = formatLtreeNodeId(newItemId);
      const itemPath = parentPath ? `${parentPath}.${nodeKey}` : nodeKey;

      const [item] = await tx
        .insert(bomItems)
        .values({
          id: newItemId,
          bomId: bomId,
          parentId: reqDto.parentId ?? null,
          itemType: reqDto.itemType,
          productId:
            reqDto.itemType === BomItemType.PRODUCT ? reqDto.itemId : null,
          materialId:
            reqDto.itemType === BomItemType.MATERIAL ? reqDto.itemId : null,
          quantity: reqDto.quantity,
          path: itemPath,
          level: itemLevel,
          sortOrder: reqDto.sortOrder ?? 0,
          note: reqDto.note,
          drawingFileId: reqDto.drawingFileId ?? null,
          createdBy: userId,
        })
        .returning({ id: bomItems.id });

      return { bomId: bomId, itemId: item.id };
    });

    return this.getBomItemDetail(bomId, itemId);
  }

  /**
   * Edits an existing node's SL (inline edit)/note/order.
   */
  async updateBomItem(
    productId: string,
    itemId: string,
    reqDto: UpdateBomItemReqDto,
  ): Promise<BomItemNodeResDto> {
    await this.ensureProductExists(productId);

    const bom = await this.getBomOrThrow(productId);
    const item = await this.ensureBomItemExists(bom.id, itemId);

    if (
      reqDto.quantity !== undefined &&
      item.itemType === BomItemType.PRODUCT &&
      !Number.isInteger(reqDto.quantity)
    ) {
      throw new AppException(ErrorCode.E055, HttpStatus.BAD_REQUEST);
    }

    // Peeled off so the write below can decide, per the *effective* value, whether to link a new
    // file and/or delete the old one — a plain spread can't express "replace and clean up".
    const { drawingFileId: requestedDrawingFileId, ...bomItemFields } = reqDto;

    if (requestedDrawingFileId) {
      await this.filesService.linkFiles([requestedDrawingFileId]);
    }

    // `updated_at` is bumped by the column's own `$onUpdate`.
    await this.db
      .update(bomItems)
      .set({
        ...bomItemFields,
        ...(requestedDrawingFileId !== undefined
          ? { drawingFileId: requestedDrawingFileId }
          : {}),
      })
      .where(and(eq(bomItems.id, itemId), eq(bomItems.bomId, bom.id)));

    // Delete the old drawing only after the new pointer is committed — deleting first would risk
    // losing both if the write then failed. A failed delete here just leaves an orphaned file
    // (same "garbage over data loss" tradeoff as `FilesService.linkFiles`'s own ordering), so this
    // isn't wrapped in a transaction with the update above.
    if (
      requestedDrawingFileId !== undefined &&
      item.drawingFileId &&
      item.drawingFileId !== requestedDrawingFileId
    ) {
      await this.filesService.deleteFileById(item.drawingFileId);
    }

    return this.getBomItemDetail(bom.id, itemId);
  }

  /**
   * Deletes one node ("[X]").
   */
  async deleteBomItem(productId: string, itemId: string): Promise<void> {
    await this.ensureProductExists(productId);

    const bom = await this.getBomOrThrow(productId);
    await this.ensureBomItemExists(bom.id, itemId);

    await this.db
      .delete(bomItems)
      .where(and(eq(bomItems.id, itemId), eq(bomItems.bomId, bom.id)));
  }

  /**
   * The flat, coalesced select shared by the tree read and the single-node re-fetch after a
   * write — only the `.where()` differs between callers. `productId`/`materialId` are mutually
   * exclusive, so at most one side's left joins match per row; `coalesce()` picks whichever did.
   */
  private baseItemSelect() {
    return this.db
      .select({
        id: bomItems.id,
        parentId: bomItems.parentId,
        itemType: bomItems.itemType,
        itemId: sql<string>`coalesce(${products.id}, ${materials.id})`,
        code: sql<string>`coalesce(${products.code}, ${materials.code})`,
        name: sql<string>`coalesce(${products.name}, ${materials.name})`,
        image: {
          id: sql<
            string | null
          >`coalesce(${productImageFiles.id}, ${materialImageFiles.id})`,
          originalName: sql<
            string | null
          >`coalesce(${productImageFiles.originalName}, ${materialImageFiles.originalName})`,
          mimetype: sql<
            string | null
          >`coalesce(${productImageFiles.mimetype}, ${materialImageFiles.mimetype})`,
          size: sql<
            number | null
          >`coalesce(${productImageFiles.size}, ${materialImageFiles.size})`,
          type: sql<UploadType | null>`coalesce(${productImageFiles.type}, ${materialImageFiles.type})`,
          kind: sql<FileKind | null>`coalesce(${productImageFiles.kind}, ${materialImageFiles.kind})`,
          createdAt: sql<Date | null>`coalesce(${productImageFiles.createdAt}, ${materialImageFiles.createdAt})`,
        },
        unit: {
          id: sql<string>`coalesce(${productUnits.id}, ${materialUnits.id})`,
          code: sql<string>`coalesce(${productUnits.code}, ${materialUnits.code})`,
          name: sql<string>`coalesce(${productUnits.name}, ${materialUnits.name})`,
        },
        quantity: bomItems.quantity,
        sortOrder: bomItems.sortOrder,
        note: bomItems.note,
        drawing: getTableColumns(bomItemDrawingFiles),
      })
      .from(bomItems)
      .leftJoin(products, eq(bomItems.productId, products.id))
      .leftJoin(materials, eq(bomItems.materialId, materials.id))
      .leftJoin(productUnits, eq(products.unitId, productUnits.id))
      .leftJoin(materialUnits, eq(materials.unitId, materialUnits.id))
      .leftJoin(
        productImageFiles,
        eq(products.imageFileId, productImageFiles.id),
      )
      .leftJoin(
        materialImageFiles,
        eq(materials.imageFileId, materialImageFiles.id),
      )
      .leftJoin(
        bomItemDrawingFiles,
        eq(bomItems.drawingFileId, bomItemDrawingFiles.id),
      );
  }

  /** Collapses the all-null coalesced `image` sub-select to `null` (no image on either side) —
   * every non-id column comes from the same matched `files` row, so `id` truthy is sufficient to
   * know the whole sub-object is populated. */
  private normalizeImage(row: RawBomItemRow): BomTreeRow {
    return {
      ...row,
      image: row.image.id
        ? (row.image as NonNullable<BomTreeRow['image']>)
        : null,
    };
  }

  /** Re-fetches a single node after a write — never build the response DTO inside a transaction. */
  private async getBomItemDetail(
    bomId: string,
    itemId: string,
  ): Promise<BomItemNodeResDto> {
    const [row] = await this.baseItemSelect().where(
      and(eq(bomItems.id, itemId), eq(bomItems.bomId, bomId)),
    );

    if (!row) {
      throw new AppException(ErrorCode.E050, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(BomItemNodeResDto, this.normalizeImage(row), {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Batched as-used routing fetch for a tree read: one query for every `PRODUCT` node's own
   * routing (keyed by `bom_items.id`, not the linked product's id), grouped back into a `Map` for
   * `buildTree` to attach per-node. `MATERIAL` nodes never carry a
   * `routing_steps` row (enforced by `RoutingService.ensureBomItemRoutable`), so they're excluded
   * from the query outright rather than relying on an empty match; skips the query entirely when
   * the tree has no `PRODUCT` node at all.
   */
  private async loadOperationsByBomItem(
    rows: BomTreeRow[],
  ): Promise<Map<string, BomTreeOperationRow[]>> {
    const routableIds = rows
      .filter((row) => row.itemType === BomItemType.PRODUCT)
      .map((row) => row.id);

    const grouped = new Map<string, BomTreeOperationRow[]>();
    if (!routableIds.length) {
      return grouped;
    }

    const steps = await this.db.query.routingSteps.findMany({
      where: inArray(routingSteps.bomItemId, routableIds),
      with: { operation: true },
      orderBy: [asc(routingSteps.sortOrder), asc(routingSteps.createdAt)],
    });

    for (const step of steps) {
      // Always set here by construction (query is scoped to bom_item_id targets), but the
      // column itself is nullable at the schema level (XOR with product_id) — narrow before use.
      if (!step.bomItemId) {
        continue;
      }
      const list = grouped.get(step.bomItemId) ?? [];
      list.push(step);
      grouped.set(step.bomItemId, list);
    }

    return grouped;
  }

  /**
   * Nests the already-SQL-sorted flat rows by `parentId` — no recursive DB query, no re-sorting
   * (the query's `ORDER BY` already leaves each parent's children in the right relative order once
   * grouped). Just stamps a 1-based `level` (root's direct children = 1) on the way down, and
   * attaches each node's own as-used routing (`[]` for a `MATERIAL` node).
   */
  private buildTree(
    rows: BomTreeRow[],
    operationsByBomItem: Map<string, BomTreeOperationRow[]>,
  ): BomTreeNode[] {
    const childrenByParent = new Map<string | null, BomTreeRow[]>();
    for (const row of rows) {
      const siblings = childrenByParent.get(row.parentId) ?? [];
      siblings.push(row);
      childrenByParent.set(row.parentId, siblings);
    }

    const build = (parentId: string | null, level: number): BomTreeNode[] =>
      (childrenByParent.get(parentId) ?? []).map((row) => ({
        ...row,
        level,
        children: build(row.id, level + 1),
        operations: operationsByBomItem.get(row.id) ?? [],
      }));

    return build(null, 1);
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

  /** A WIP child item's `productId` must reference an existing, non-deleted,
   * `type = WORK_IN_PROGRESS` product — the FINISHED_GOOD root can't be nested as its own (or
   * anyone else's) child. */
  private async ensureProductIsWip(productId: string): Promise<void> {
    const product = await this.db.query.products.findFirst({
      columns: { id: true, type: true },
      where: and(eq(products.id, productId), isNull(products.deletedAt)),
    });

    if (!product) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }

    if (product.type !== ProductType.WORK_IN_PROGRESS) {
      throw new AppException(ErrorCode.E053, HttpStatus.BAD_REQUEST);
    }
  }

  /** `materials` has no soft delete (no `deletedAt` column) — existence is a plain id lookup. */
  private async ensureMaterialExists(materialId: string): Promise<void> {
    const material = await this.db.query.materials.findFirst({
      columns: { id: true },
      where: eq(materials.id, materialId),
    });

    if (!material) {
      throw new AppException(ErrorCode.E035, HttpStatus.NOT_FOUND);
    }
  }

  /** `parentId` must reference an existing `bom_items` row within THIS bom, and must not be a
   * MATERIAL leaf (a vật tư line can't have children). */
  private async ensureParentValid(
    bomId: string,
    parentId: string,
  ): Promise<void> {
    const parent = await this.db.query.bomItems.findFirst({
      columns: { id: true, itemType: true },
      where: and(eq(bomItems.id, parentId), eq(bomItems.bomId, bomId)),
    });

    if (!parent) {
      throw new AppException(ErrorCode.E051, HttpStatus.NOT_FOUND);
    }

    if (parent.itemType === BomItemType.MATERIAL) {
      throw new AppException(ErrorCode.E052, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Prevents a product from becoming its own ancestor/descendant within the same tree: (a) the
   * new item can't be the FG root itself, (b) walking up from `parentId` to the root, the new
   * item's productId can't already appear as an ancestor. Only meaningful for PRODUCT items —
   * MATERIAL items are leaves and can never be ancestors. Bounded by `MAX_BOM_DEPTH` as a
   * corrupt-data infinite-loop guard; the repo has no recursive-CTE precedent and real trees are
   * shallow, so a simple loop is preferred over `WITH RECURSIVE`.
   */
  private async checkNoCycle(
    bomId: string | undefined,
    rootProductId: string,
    parentId: string | null,
    itemId: string,
  ): Promise<void> {
    if (itemId === rootProductId) {
      throw new AppException(ErrorCode.E054, HttpStatus.CONFLICT);
    }

    if (!parentId || !bomId) {
      return;
    }

    let currentId: string | null = parentId;
    let depth = 0;

    while (currentId) {
      if (depth++ > BomsService.MAX_BOM_DEPTH) {
        throw new AppException(ErrorCode.E054, HttpStatus.CONFLICT);
      }

      const node:
        | { productId: string | null; parentId: string | null }
        | undefined = await this.db.query.bomItems.findFirst({
        columns: { productId: true, parentId: true },
        where: and(eq(bomItems.id, currentId), eq(bomItems.bomId, bomId)),
      });

      if (!node) {
        break;
      }

      if (node.productId === itemId) {
        throw new AppException(ErrorCode.E054, HttpStatus.CONFLICT);
      }

      currentId = node.parentId;
    }
  }

  private async getBomOrThrow(productId: string): Promise<{ id: string }> {
    const bom = await this.db.query.boms.findFirst({
      columns: { id: true },
      where: eq(boms.productId, productId),
    });

    if (!bom) {
      throw new AppException(ErrorCode.E050, HttpStatus.NOT_FOUND);
    }

    return bom;
  }

  private async ensureBomItemExists(
    bomId: string,
    itemId: string,
  ): Promise<{
    id: string;
    itemType: BomItemType;
    drawingFileId: string | null;
  }> {
    const item = await this.db.query.bomItems.findFirst({
      columns: { id: true, itemType: true, drawingFileId: true },
      where: and(eq(bomItems.id, itemId), eq(bomItems.bomId, bomId)),
    });

    if (!item) {
      throw new AppException(ErrorCode.E050, HttpStatus.NOT_FOUND);
    }

    return item;
  }
}
