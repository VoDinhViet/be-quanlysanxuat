import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  asc,
  eq,
  and,
  count,
  getTableColumns,
  inArray,
  isNull,
  or,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  bomItemMaterials,
  bomItems,
  boms,
  files,
  materials,
  products,
  ProductType,
  routingSteps,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { BomItemNodeResDto } from './dto/bom-item-node.res.dto';
import { BomItemResDto } from './dto/bom-item.res.dto';
import { BomMaterialResDto } from './dto/bom-material.res.dto';
import { CreateBomItemMaterialReqDto } from './dto/create-bom-item-material.req.dto';
import { CreateBomItemReqDto } from './dto/create-bom-item.req.dto';
import { GetBomMaterialsReqDto } from './dto/get-bom-materials.req.dto';
import { UpdateBomItemMaterialReqDto } from './dto/update-bom-item-material.req.dto';
import { UpdateBomItemReqDto } from './dto/update-bom-item.req.dto';
import type {
  BomTreeNode,
  BomTreeOperationRow,
  BomTreeRow,
} from './types/bom-tree.type';
import { formatLtreeNodeId } from './utils/ltree.util';

/** Vật tư Cấp 0 của chính sản phẩm gốc (`bomItemId` bỏ trống), hoặc vật tư as-used của một node BOM
 * cụ thể (`bomItemId` có giá trị) — khuôn `RoutingTarget` của `RoutingService`. */
type BomMaterialTarget = { productId: string; bomItemId?: string };

// Hai join riêng biệt vào cùng bảng `files` (ảnh sản phẩm + bản vẽ riêng của node) cần alias để
// không đụng nhau trong cùng một query.
// `as unknown as typeof files` — `files` có quan hệ trỏ `users` (`uploader`), khiến Drizzle suy sai
// kiểu cột của alias trên bảng này (rơi về `{ [x: string]: any }`/union với `PgView`); ép lại tường
// minh qua `unknown`, không đổi hành vi runtime — `alias()` chỉ đổi tên SQL, không đổi cột.
const imageFiles = alias(files, 'image_files') as unknown as typeof files;
const bomItemDrawingFiles = alias(
  files,
  'bom_item_drawing_files',
) as unknown as typeof files;

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

    // Chưa cấu hình BOM cho sản phẩm này — trạng thái bình thường, không phải lỗi.
    if (!bom) {
      return [];
    }

    // `as BomTreeRow[]` — Drizzle suy sai kiểu `unit`/`drawing`/`image` sau khi schema có thêm
    // nhiều quan hệ trỏ `users`, ép lại cho đúng thực tế (không đổi hành vi runtime).
    const rows = (await this.baseItemSelect()
      .where(eq(bomItems.bomId, bom.id))
      .orderBy(
        asc(bomItems.sortOrder),
        asc(bomItems.createdAt),
      )) as BomTreeRow[];

    const operationsByBomItem = await this.loadOperationsByBomItem(rows);

    const tree = this.buildTree(rows, operationsByBomItem);

    return tree.map((node) =>
      plainToInstance(BomItemResDto, node, { excludeExtraneousValues: true }),
    );
  }

  async getBomItemMaterials(
    target: BomMaterialTarget,
    reqDto: GetBomMaterialsReqDto,
  ): Promise<OffsetPaginatedDto<BomMaterialResDto>> {
    await this.ensureProductExists(target.productId);

    const bomId = await this.resolveBomId(target);

    // Chưa có BOM (hoặc node chưa từng khai vật tư) — trả trang rỗng, không phải lỗi.
    if (!bomId) {
      return new OffsetPaginatedDto([], new OffsetPaginationDto(0, reqDto));
    }

    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      eq(bomItemMaterials.bomId, bomId),
      target.bomItemId
        ? eq(bomItemMaterials.bomItemId, target.bomItemId)
        : isNull(bomItemMaterials.bomItemId),
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
          id: bomItemMaterials.id,
          materialId: materials.id,
          code: materials.code,
          name: materials.name,
          unit: getTableColumns(units),
          image: getTableColumns(files),
          quantity: bomItemMaterials.quantity,
          sortOrder: bomItemMaterials.sortOrder,
          note: bomItemMaterials.note,
        })
        .from(bomItemMaterials)
        .innerJoin(materials, eq(bomItemMaterials.materialId, materials.id))
        .innerJoin(units, eq(materials.unitId, units.id))
        .leftJoin(files, eq(materials.imageFileId, files.id))
        .where(where)
        .orderBy(
          asc(bomItemMaterials.sortOrder),
          asc(bomItemMaterials.createdAt),
        )
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db.select({ total: count() }).from(bomItemMaterials).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(BomMaterialResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async addBomItemMaterial(
    target: BomMaterialTarget,
    reqDto: CreateBomItemMaterialReqDto,
    userId: string,
  ): Promise<BomMaterialResDto> {
    await this.ensureProductExists(target.productId);
    await this.ensureMaterialExists(reqDto.materialId);

    const existingBomItem = target.bomItemId
      ? await this.ensureBomItemInBom(target.productId, target.bomItemId)
      : undefined;
    const existingBom = existingBomItem
      ? undefined
      : await this.db.query.boms.findFirst({
          columns: { id: true },
          where: eq(boms.productId, target.productId),
        });

    const materialLineId = await this.db.transaction(async (tx) => {
      const bomId =
        existingBomItem?.bomId ??
        (await this.getOrCreateBomId(
          tx,
          target.productId,
          existingBom?.id,
          userId,
        ));

      const [row] = await tx
        .insert(bomItemMaterials)
        .values({
          bomId,
          bomItemId: target.bomItemId ?? null,
          materialId: reqDto.materialId,
          quantity: reqDto.quantity,
          sortOrder: reqDto.sortOrder ?? 0,
          note: reqDto.note,
          createdBy: userId,
        })
        .returning({ id: bomItemMaterials.id });

      return row.id;
    });

    return this.getBomItemMaterialDetail(materialLineId);
  }

  /** Chỉ sửa SL/sortOrder/note — `materialId` bất biến, đổi thì xoá + thêm lại. */
  async updateBomItemMaterial(
    target: BomMaterialTarget,
    materialLineId: string,
    reqDto: UpdateBomItemMaterialReqDto,
  ): Promise<BomMaterialResDto> {
    await this.ensureProductExists(target.productId);

    const bomId = await this.resolveBomId(target);
    if (!bomId) {
      throw new AppException(ErrorCode.E108, HttpStatus.NOT_FOUND);
    }
    await this.ensureBomItemMaterialExists(
      bomId,
      target.bomItemId,
      materialLineId,
    );

    await this.db
      .update(bomItemMaterials)
      .set(reqDto)
      .where(
        and(
          eq(bomItemMaterials.id, materialLineId),
          eq(bomItemMaterials.bomId, bomId),
        ),
      );

    return this.getBomItemMaterialDetail(materialLineId);
  }

  async deleteBomItemMaterial(
    target: BomMaterialTarget,
    materialLineId: string,
  ): Promise<void> {
    await this.ensureProductExists(target.productId);

    const bomId = await this.resolveBomId(target);
    if (!bomId) {
      throw new AppException(ErrorCode.E108, HttpStatus.NOT_FOUND);
    }
    await this.ensureBomItemMaterialExists(
      bomId,
      target.bomItemId,
      materialLineId,
    );

    await this.db
      .delete(bomItemMaterials)
      .where(
        and(
          eq(bomItemMaterials.id, materialLineId),
          eq(bomItemMaterials.bomId, bomId),
        ),
      );
  }

  async addBomItem(
    productId: string,
    reqDto: CreateBomItemReqDto,
    userId: string,
  ): Promise<BomItemNodeResDto> {
    await this.ensureProductExists(productId);
    await this.ensureProductIsWip(reqDto.productId);

    const existingBom = await this.db.query.boms.findFirst({
      columns: { id: true },
      where: eq(boms.productId, productId),
    });

    if (reqDto.parentId) {
      // Chưa có BOM thì chắc chắn không có dòng bom_items nào khớp parentId này.
      if (!existingBom) {
        throw new AppException(ErrorCode.E051, HttpStatus.NOT_FOUND);
      }
      await this.ensureBomItemInBom(productId, reqDto.parentId);
    }

    await this.checkNoCycle(
      existingBom?.id,
      productId,
      reqDto.parentId ?? null,
      reqDto.productId,
    );

    if (reqDto.drawingFileId) {
      await this.filesService.linkFiles([reqDto.drawingFileId]);
    }

    const { bomId, itemId } = await this.db.transaction(async (tx) => {
      const bomId = await this.getOrCreateBomId(
        tx,
        productId,
        existingBom?.id,
        userId,
      );

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
          bomId,
          parentId: reqDto.parentId ?? null,
          productId: reqDto.productId,
          quantity: reqDto.quantity,
          path: itemPath,
          level: itemLevel,
          sortOrder: reqDto.sortOrder ?? 0,
          note: reqDto.note,
          drawingFileId: reqDto.drawingFileId ?? null,
          createdBy: userId,
        })
        .returning({ id: bomItems.id });

      return { bomId, itemId: item.id };
    });

    return this.getBomItemDetail(bomId, itemId);
  }

  /** Chỉ sửa SL/note/drawing — `productId`/`parentId` bất biến, đổi thì xoá + thêm lại. */
  async updateBomItem(
    productId: string,
    itemId: string,
    reqDto: UpdateBomItemReqDto,
  ): Promise<BomItemNodeResDto> {
    await this.ensureProductExists(productId);

    const bom = await this.getBomOrThrow(productId);
    const item = await this.ensureBomItemExists(bom.id, itemId);

    // Peel riêng để bên dưới quyết định theo giá trị *hiệu lực*: link file mới và/hoặc xoá file
    // cũ — spread thường không diễn đạt được "thay và dọn rác" cùng lúc.
    const { drawingFileId: requestedDrawingFileId, ...bomItemFields } = reqDto;

    if (requestedDrawingFileId) {
      await this.filesService.linkFiles([requestedDrawingFileId]);
    }

    await this.db
      .update(bomItems)
      .set({
        ...bomItemFields,
        ...(requestedDrawingFileId !== undefined
          ? { drawingFileId: requestedDrawingFileId }
          : {}),
      })
      .where(and(eq(bomItems.id, itemId), eq(bomItems.bomId, bom.id)));

    // Chỉ xoá file cũ sau khi con trỏ mới đã commit — xoá trước có thể mất cả hai nếu write sau
    // đó lỗi. Xoá lỗi ở đây chỉ để lại rác (đánh đổi giống `FilesService.linkFiles`), nên không
    // gộp transaction với update ở trên.
    if (
      requestedDrawingFileId !== undefined &&
      item.drawingFileId &&
      item.drawingFileId !== requestedDrawingFileId
    ) {
      await this.filesService.deleteFileById(item.drawingFileId);
    }

    return this.getBomItemDetail(bom.id, itemId);
  }

  async deleteBomItem(productId: string, itemId: string): Promise<void> {
    await this.ensureProductExists(productId);

    const bom = await this.getBomOrThrow(productId);
    await this.ensureBomItemExists(bom.id, itemId);

    await this.db
      .delete(bomItems)
      .where(and(eq(bomItems.id, itemId), eq(bomItems.bomId, bom.id)));
  }

  /** Select phẳng dùng chung cho đọc cây và re-fetch một node sau write — chỉ khác `.where()`.
   * Mọi node giờ luôn trỏ `products`, không còn coalesce hai nguồn như trước khi tách vật tư. */
  private baseItemSelect() {
    return this.db
      .select({
        id: bomItems.id,
        parentId: bomItems.parentId,
        productId: bomItems.productId,
        code: products.code,
        name: products.name,
        image: getTableColumns(imageFiles),
        unit: getTableColumns(units),
        quantity: bomItems.quantity,
        sortOrder: bomItems.sortOrder,
        level: bomItems.level,
        note: bomItems.note,
        drawing: getTableColumns(bomItemDrawingFiles),
      })
      .from(bomItems)
      .innerJoin(products, eq(bomItems.productId, products.id))
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(imageFiles, eq(imageFiles.id, products.imageFileId))
      .leftJoin(
        bomItemDrawingFiles,
        eq(bomItems.drawingFileId, bomItemDrawingFiles.id),
      );
  }

  private async getBomItemDetail(
    bomId: string,
    itemId: string,
  ): Promise<BomItemNodeResDto> {
    // `as BomTreeRow[]` — Drizzle suy sai kiểu `unit`/`drawing`/`image` sau khi schema có thêm
    // nhiều quan hệ trỏ `users`, ép lại cho đúng thực tế (không đổi hành vi runtime).
    const [row] = (await this.baseItemSelect().where(
      and(eq(bomItems.id, itemId), eq(bomItems.bomId, bomId)),
    )) as BomTreeRow[];

    if (!row) {
      throw new AppException(ErrorCode.E050, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(BomItemNodeResDto, row, {
      excludeExtraneousValues: true,
    });
  }

  private async getBomItemMaterialDetail(
    id: string,
  ): Promise<BomMaterialResDto> {
    const [row] = await this.db
      .select({
        id: bomItemMaterials.id,
        materialId: materials.id,
        code: materials.code,
        name: materials.name,
        unit: getTableColumns(units),
        image: getTableColumns(files),
        quantity: bomItemMaterials.quantity,
        sortOrder: bomItemMaterials.sortOrder,
        note: bomItemMaterials.note,
      })
      .from(bomItemMaterials)
      .innerJoin(materials, eq(bomItemMaterials.materialId, materials.id))
      .innerJoin(units, eq(materials.unitId, units.id))
      .leftJoin(files, eq(materials.imageFileId, files.id))
      .where(eq(bomItemMaterials.id, id));

    if (!row) {
      throw new AppException(ErrorCode.E108, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(BomMaterialResDto, row, {
      excludeExtraneousValues: true,
    });
  }

  /** Fetch gộp routing as-used cho một lượt đọc cây: một query cho mọi node, gom vào `Map` cho
   * `buildTree` gắn theo node. Mọi hàng `bom_items` giờ đều routable — không còn loại trừ MATERIAL. */
  private async loadOperationsByBomItem(
    rows: BomTreeRow[],
  ): Promise<Map<string, BomTreeOperationRow[]>> {
    const grouped = new Map<string, BomTreeOperationRow[]>();
    if (!rows.length) {
      return grouped;
    }

    const steps = await this.db.query.routingSteps.findMany({
      where: inArray(
        routingSteps.bomItemId,
        rows.map((row) => row.id),
      ),
      with: { operation: true },
      orderBy: [asc(routingSteps.sortOrder), asc(routingSteps.createdAt)],
    });

    for (const step of steps) {
      // Luôn có giá trị theo cách query được scope (chỉ lấy target bom_item_id), nhưng cột vẫn
      // nullable ở tầng schema (XOR với product_id) — narrow trước khi dùng.
      if (!step.bomItemId) {
        continue;
      }
      const list = grouped.get(step.bomItemId) ?? [];
      // `operationId` là FK bắt buộc, `operation` luôn đúng 1 dòng — Drizzle suy sai kiểu thành
      // one|many sau khi schema có thêm nhiều quan hệ trỏ `users`, ép lại cho đúng thực tế.
      list.push(step as BomTreeOperationRow);
      grouped.set(step.bomItemId, list);
    }

    return grouped;
  }

  /** Lồng cây từ các dòng phẳng đã sort sẵn bằng SQL theo `parentId` — không query đệ quy, không
   * sort lại. `level` đọc thẳng từ cột đã lưu; gắn routing as-used của từng node. */
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

    const build = (parentId: string | null): BomTreeNode[] =>
      (childrenByParent.get(parentId) ?? []).map((row) => ({
        ...row,
        children: build(row.id),
        operations: operationsByBomItem.get(row.id) ?? [],
      }));

    return build(null);
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

  /** FG không được lồng làm con (của chính nó hay sản phẩm khác) — chỉ WIP mới được. */
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

  /** `materials` không có soft delete (không cột `deletedAt`) — chỉ cần tra id thuần. */
  private async ensureMaterialExists(materialId: string): Promise<void> {
    const material = await this.db.query.materials.findFirst({
      columns: { id: true },
      where: eq(materials.id, materialId),
    });

    if (!material) {
      throw new AppException(ErrorCode.E035, HttpStatus.NOT_FOUND);
    }
  }

  /** Node phải thuộc đúng BOM của `productId` — chặn `bomItemId` của cây sản phẩm khác lọt qua URL
   * này. Dùng chung cho cha của một node PRODUCT lẫn node vật tư gắn vào (`E051`). */
  private async ensureBomItemInBom(
    productId: string,
    bomItemId: string,
  ): Promise<{ bomId: string }> {
    const item = await this.db.query.bomItems.findFirst({
      columns: { id: true, bomId: true },
      with: { bom: { columns: { productId: true } } },
      where: eq(bomItems.id, bomItemId),
    });

    if (!item) {
      throw new AppException(ErrorCode.E051, HttpStatus.NOT_FOUND);
    }
    // `bomId` là FK bắt buộc, đúng 1 dòng — Drizzle suy sai kiểu `bom` thành one|many sau khi
    // schema có thêm nhiều quan hệ trỏ `users`, ép lại cho đúng thực tế thay vì đổi logic.
    const bom = item.bom as { productId: string };
    if (bom.productId !== productId) {
      throw new AppException(ErrorCode.E051, HttpStatus.NOT_FOUND);
    }

    return { bomId: item.bomId };
  }

  /** `target.bomItemId` có giá trị → BOM suy ra từ chính node đó (đã kiểm cùng cây). Không có →
   * BOM của Cấp 0, có thể chưa tồn tại (`undefined`). */
  private async resolveBomId(
    target: BomMaterialTarget,
  ): Promise<string | undefined> {
    if (target.bomItemId) {
      return (await this.ensureBomItemInBom(target.productId, target.bomItemId))
        .bomId;
    }

    return (
      await this.db.query.boms.findFirst({
        columns: { id: true },
        where: eq(boms.productId, target.productId),
      })
    )?.id;
  }

  private async ensureBomItemMaterialExists(
    bomId: string,
    bomItemId: string | undefined,
    materialLineId: string,
  ): Promise<void> {
    const existing = await this.db.query.bomItemMaterials.findFirst({
      columns: { id: true },
      where: and(
        eq(bomItemMaterials.id, materialLineId),
        eq(bomItemMaterials.bomId, bomId),
        bomItemId
          ? eq(bomItemMaterials.bomItemId, bomItemId)
          : isNull(bomItemMaterials.bomItemId),
      ),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E108, HttpStatus.NOT_FOUND);
    }
  }

  /** Chặn một sản phẩm trở thành tổ tiên/hậu duệ của chính nó trong cùng cây. Giới hạn bởi
   * `MAX_BOM_DEPTH` để chặn vòng lặp vô hạn nếu dữ liệu hỏng — cây thật nông và repo không có
   * tiền lệ CTE đệ quy, nên cố ý dùng loop thay vì `WITH RECURSIVE`. */
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
    drawingFileId: string | null;
  }> {
    const item = await this.db.query.bomItems.findFirst({
      columns: { id: true, drawingFileId: true },
      where: and(eq(bomItems.id, itemId), eq(bomItems.bomId, bomId)),
    });

    if (!item) {
      throw new AppException(ErrorCode.E050, HttpStatus.NOT_FOUND);
    }

    return item;
  }

  /** Header `boms` sinh lười — get-or-create trong transaction ghi node/vật tư đầu tiên của sản
   * phẩm. `onConflictDoNothing` là chốt chặn race thật; `existingBomId` (đọc trước transaction)
   * chỉ để tránh round-trip insert thừa khi header đã chắc chắn có sẵn. */
  private async getOrCreateBomId(
    tx: DbTransaction,
    productId: string,
    existingBomId: string | undefined,
    userId: string,
  ): Promise<string> {
    if (existingBomId) {
      return existingBomId;
    }

    const [created] = await tx
      .insert(boms)
      .values({ productId, createdBy: userId })
      .onConflictDoNothing({ target: boms.productId })
      .returning({ id: boms.id });

    return (
      created?.id ??
      (await tx.query.boms.findFirst({
        columns: { id: true },
        where: eq(boms.productId, productId),
      }))!.id
    );
  }
}
