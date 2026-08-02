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

// Alias 2 lần: item của một node hoặc là product hoặc là material (không bao giờ cả hai), nên
// unit/image lấy từ bên nào left join khớp.
// `as unknown as typeof X` — sau khi schema có thêm nhiều bảng trỏ `users`, Drizzle suy sai kiểu
// cột của alias trên các bảng này (rơi về `{ [x: string]: any }`/union với `PgView`); ép lại tường
// minh qua `unknown`, không đổi hành vi runtime — `alias()` chỉ đổi tên SQL, không đổi cột.
const productUnits = alias(units, 'product_units') as unknown as typeof units;
const materialUnits = alias(units, 'material_units') as unknown as typeof units;
const productImageFiles = alias(
  files,
  'product_image_files',
) as unknown as typeof files;
const materialImageFiles = alias(
  files,
  'material_image_files',
) as unknown as typeof files;
// Bản vẽ riêng của node là left join một nguồn duy nhất (bom_items.drawingFileId), không coalesce
// 2 nguồn như image/unit ở trên — một alias là đủ.
const bomItemDrawingFiles = alias(
  files,
  'bom_item_drawing_files',
) as unknown as typeof files;

// Dạng thô `baseItemSelect()` trả về, trước khi `normalizeImage` gộp sub-select `image` coalesce
// toàn null thành `null` — xem `BomTreeRow` cho dạng sau normalize.
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

    // Chưa cấu hình BOM cho sản phẩm này — trạng thái bình thường, không phải lỗi.
    if (!bom) {
      return [];
    }

    // `as RawBomItemRow[]` — Drizzle suy sai kiểu `unit`/`drawing` sau khi schema có thêm nhiều
    // quan hệ trỏ `users`, ép lại cho đúng thực tế (không đổi hành vi runtime).
    const selectRows = (await this.baseItemSelect()
      .where(eq(bomItems.bomId, bom.id))
      .orderBy(
        asc(bomItems.sortOrder),
        asc(bomItems.createdAt),
      )) as RawBomItemRow[];
    const rows = selectRows.map((row) => this.normalizeImage(row));

    const operationsByBomItem = await this.loadOperationsByBomItem(rows);

    const tree = this.buildTree(rows, operationsByBomItem);

    return tree.map((node) =>
      plainToInstance(BomItemResDto, node, { excludeExtraneousValues: true }),
    );
  }

  /** `totalQuantity` là SUM thô qua mọi node `MATERIAL` (mọi cấp) trỏ tới vật tư đó — KHÔNG nhân
   * qua SL của WIP tổ tiên (không phải BOM explosion). */
  async getBomMaterials(
    productId: string,
    reqDto: GetBomMaterialsReqDto,
  ): Promise<OffsetPaginatedDto<BomMaterialResDto>> {
    await this.ensureProductExists(productId);

    const bom = await this.db.query.boms.findFirst({
      columns: { id: true },
      where: eq(boms.productId, productId),
    });

    // Chưa cấu hình BOM — trả trang rỗng, không phải lỗi (giống getBomTree).
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

    // Select lồng chỉ thuộc một bảng left-join (`files`) tự động về `null` khi join không khớp —
    // khác `baseItemSelect()` phải tự `coalesce()` vì có 2 bảng nguồn khác nhau.
    return new OffsetPaginatedDto(
      plainToInstance(BomMaterialResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

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
      // Chưa có BOM thì chắc chắn không có dòng bom_items nào khớp parentId này.
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

  /** Chỉ sửa SL/note/drawing — `itemType`/`itemId`/`parentId` bất biến, đổi thì xoá + thêm lại. */
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
   * `productId`/`materialId` loại trừ nhau nên tối đa một bên left join khớp; `coalesce()` chọn
   * đúng bên đó. Row đã phẳng sẵn nên DTO đọc field này dùng `ClassFieldOptional` thường, không
   * cần `FileField` (không phải Drizzle relational `with:` result). */
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

  /** Gộp sub-select `image` coalesce toàn null thành `null` — mọi cột (trừ id) đến từ cùng một
   * dòng `files` khớp, nên `id` có giá trị là đủ để biết cả sub-object đã có dữ liệu. */
  private normalizeImage(row: RawBomItemRow): BomTreeRow {
    return {
      ...row,
      image: row.image.id
        ? (row.image as NonNullable<BomTreeRow['image']>)
        : null,
    };
  }

  private async getBomItemDetail(
    bomId: string,
    itemId: string,
  ): Promise<BomItemNodeResDto> {
    // `as RawBomItemRow[]` — cùng lý do ở `getBomTree`.
    const [row] = (await this.baseItemSelect().where(
      and(eq(bomItems.id, itemId), eq(bomItems.bomId, bomId)),
    )) as RawBomItemRow[];

    if (!row) {
      throw new AppException(ErrorCode.E050, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(BomItemNodeResDto, this.normalizeImage(row), {
      excludeExtraneousValues: true,
    });
  }

  /** Fetch gộp routing as-used cho một lượt đọc cây: một query cho mọi node `PRODUCT` (khoá theo
   * `bom_items.id`, không phải id sản phẩm liên kết), gom vào `Map` cho `buildTree` gắn theo node.
   * Node `MATERIAL` không có `routing_steps` (`RoutingService.ensureBomItemRoutable` đảm bảo) nên
   * loại khỏi query luôn, không dựa vào việc query trả rỗng. */
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
   * sort lại. Chỉ đánh `level` 1-based khi đi xuống, gắn routing as-used của từng node (`[]` cho
   * node `MATERIAL`). */
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
