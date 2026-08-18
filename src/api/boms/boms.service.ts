import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { asc, eq, and, getTableColumns, inArray, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  bomItems,
  bomOperations,
  boms,
  files,
  items,
  ItemType,
  operations,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { BomItemResDto } from './dto/bom-item.res.dto';
import { CreateBomItemReqDto } from './dto/create-bom-item.req.dto';
import { UpdateBomItemReqDto } from './dto/update-bom-item.req.dto';
import type { BomItem, BomOperation } from './types/bom-tree.type';

// Hai join riêng biệt vào cùng bảng `files` (ảnh item + bản vẽ riêng của node) cần alias để
// không đụng nhau trong cùng một query.
const imageFiles = alias(files, 'image_files');
const bomItemDrawingFiles = alias(files, 'bom_item_drawing_files');

/**
 * Cây BOM một item (FG/WIP gốc) — `bom_items` chứa cả node WIP lẫn lá RM (không còn bảng
 * `bom_materials` riêng, xem `docs/decisions/items-merge.md`). RM luôn là lá: không được nhận con
 * (`E052`) và không được gắn `bom_operations` (`E063`). Xem `docs/domains/product-structure.md`.
 */
@Injectable()
export class BomsService {
  private static readonly MAX_BOM_DEPTH = 50;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly filesService: FilesService,
  ) {}

  async getBom(itemId: string): Promise<BomItemResDto[]> {
    await this.ensureItemExists(itemId);

    // Join thẳng qua `boms` — item chưa có BOM (hoặc BOM chưa có node) đều tự nhiên ra mảng
    // rỗng, không cần early-return riêng. Khai kiểu ngay trên biến — Drizzle suy sai kiểu
    // `unit`/`drawing`/`image` sau khi schema có thêm nhiều quan hệ trỏ `users`; contextual type ở
    // đây đủ để TS ép đúng, không cần `as BomItem[]` rải rác bên dưới.
    const rows: BomItem[] = await this.db
      .select({
        ...getTableColumns(bomItems),
        itemType: items.type,
        code: items.code,
        name: items.name,
        image: getTableColumns(imageFiles),
        unit: getTableColumns(units),
        drawing: getTableColumns(bomItemDrawingFiles),
      })
      .from(bomItems)
      .innerJoin(boms, eq(bomItems.bomId, boms.id))
      .innerJoin(items, eq(bomItems.itemId, items.id))
      .innerJoin(units, eq(units.id, items.unitId))
      .leftJoin(imageFiles, eq(imageFiles.id, items.imageFileId))
      .leftJoin(
        bomItemDrawingFiles,
        eq(bomItems.drawingFileId, bomItemDrawingFiles.id),
      )
      .where(eq(boms.itemId, itemId))
      .orderBy(
        asc(bomItems.level),
        asc(bomItems.sortOrder),
        asc(bomItems.createdAt),
      );

    const operationsByBomItem = await this.loadOperationsByBomItem(rows);

    return plainToInstance(
      BomItemResDto,
      rows.map((row) => ({
        ...row,
        operations: operationsByBomItem.get(row.id) ?? [],
      })),
      { excludeExtraneousValues: true },
    );
  }

  async createBomItem(
    itemId: string,
    reqDto: CreateBomItemReqDto,
    userId: string,
  ): Promise<void> {
    const rootItem = await this.ensureItemExists(itemId);
    if (rootItem.type === ItemType.RM) {
      throw new AppException(ErrorCode.E111, HttpStatus.BAD_REQUEST);
    }

    const childItem = await this.ensureBomNodeItemValid(reqDto.itemId);
    this.ensureQuantityValid(childItem.type, reqDto.quantity);

    const existingBom = await this.db.query.boms.findFirst({
      columns: { id: true },
      where: eq(boms.itemId, itemId),
    });

    if (reqDto.parentId) {
      // Chưa có BOM thì chắc chắn không có dòng bom_items nào khớp parentId này.
      if (!existingBom) {
        throw new AppException(ErrorCode.E051, HttpStatus.NOT_FOUND);
      }
      await this.ensureBomItemInBom(itemId, reqDto.parentId);
      await this.ensureBomItemCanHaveChildren(reqDto.parentId);
    }

    if (childItem.type === ItemType.WIP) {
      await this.checkNoCycle(
        existingBom?.id,
        itemId,
        reqDto.parentId ?? null,
        reqDto.itemId,
      );
    }

    if (reqDto.drawingFileId) {
      await this.filesService.linkFiles([reqDto.drawingFileId]);
    }

    await this.db.transaction(async (tx) => {
      const bomId = await this.getOrCreateBomId(
        tx,
        itemId,
        existingBom?.id,
        userId,
      );

      let parentLevel = 0;

      if (reqDto.parentId) {
        const parentItem = await tx.query.bomItems.findFirst({
          columns: { level: true },
          where: eq(bomItems.id, reqDto.parentId),
        });
        if (parentItem) {
          parentLevel = parentItem.level ?? 1;
        }
      }

      const itemLevel = reqDto.parentId ? parentLevel + 1 : 1;

      await tx.insert(bomItems).values({
        bomId,
        parentId: reqDto.parentId ?? null,
        itemId: reqDto.itemId,
        quantity: reqDto.quantity,
        level: itemLevel,
        sortOrder: reqDto.sortOrder ?? 0,
        note: reqDto.note,
        drawingFileId: reqDto.drawingFileId ?? null,
        createdBy: userId,
      });
    });
  }

  /** Chỉ sửa SL/note/drawing — `itemId`/`parentId` bất biến, đổi thì xoá + thêm lại. */
  async updateBomItem(
    itemId: string,
    bomItemId: string,
    reqDto: UpdateBomItemReqDto,
  ): Promise<void> {
    await this.ensureItemExists(itemId);

    const bom = await this.getBomOrThrow(itemId);
    const node = await this.ensureBomItemExists(bom.id, bomItemId);

    if (reqDto.quantity !== undefined) {
      this.ensureQuantityValid(node.itemType, reqDto.quantity);
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
      .where(and(eq(bomItems.id, bomItemId), eq(bomItems.bomId, bom.id)));

    // Chỉ xoá file cũ sau khi con trỏ mới đã commit — xoá trước có thể mất cả hai nếu write sau
    // đó lỗi. Xoá lỗi ở đây chỉ để lại rác (đánh đổi giống `FilesService.linkFiles`), nên không
    // gộp transaction với update ở trên.
    if (
      requestedDrawingFileId !== undefined &&
      node.drawingFileId &&
      node.drawingFileId !== requestedDrawingFileId
    ) {
      await this.filesService.deleteFileById(node.drawingFileId);
    }
  }

  async deleteBomItem(itemId: string, bomItemId: string): Promise<void> {
    await this.ensureItemExists(itemId);

    const bom = await this.getBomOrThrow(itemId);
    await this.ensureBomItemExists(bom.id, bomItemId);

    await this.db
      .delete(bomItems)
      .where(and(eq(bomItems.id, bomItemId), eq(bomItems.bomId, bom.id)));
  }

  /** Fetch gộp công đoạn as-used cho một lượt đọc BOM: một query cho mọi node, gom vào `Map` để
   * gắn theo node. Node RM tự nhiên không có dòng nào ở đây (chặn từ lúc ghi, `E063`). */
  private async loadOperationsByBomItem(
    rows: BomItem[],
  ): Promise<Map<string, BomOperation[]>> {
    const grouped = new Map<string, BomOperation[]>();
    if (!rows.length) {
      return grouped;
    }

    const bomOperationRows = await this.db
      .select({
        ...getTableColumns(bomOperations),
        operation: getTableColumns(operations),
      })
      .from(bomOperations)
      .innerJoin(operations, eq(bomOperations.operationId, operations.id))
      .where(
        inArray(
          bomOperations.bomItemId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(bomOperations.sortOrder), asc(bomOperations.createdAt));

    for (const row of bomOperationRows) {
      const nodeOperations = grouped.get(row.bomItemId) ?? [];
      nodeOperations.push(row);
      grouped.set(row.bomItemId, nodeOperations);
    }

    return grouped;
  }

  /** Dùng chung với `BomOperationsService` (`BomOperationsModule` import `BomsModule`). */
  async ensureItemExists(
    itemId: string,
  ): Promise<{ id: string; type: ItemType }> {
    const existing = await this.db.query.items.findFirst({
      columns: { id: true, type: true },
      where: and(eq(items.id, itemId), isNull(items.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  /** Node được thêm vào cây phải là WIP hoặc RM — FG không được lồng làm con (của chính nó hay
   * item khác). */
  private async ensureBomNodeItemValid(
    candidateItemId: string,
  ): Promise<{ id: string; type: ItemType }> {
    const item = await this.db.query.items.findFirst({
      columns: { id: true, type: true },
      where: and(eq(items.id, candidateItemId), isNull(items.deletedAt)),
    });

    if (!item) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }
    if (item.type === ItemType.FG) {
      throw new AppException(ErrorCode.E053, HttpStatus.BAD_REQUEST);
    }

    return item;
  }

  /** WIP bắt buộc SL nguyên (cấu trúc lắp ráp); RM được phép SL lẻ (định mức vật tư). */
  private ensureQuantityValid(itemType: ItemType, quantity: number): void {
    if (itemType === ItemType.WIP && !Number.isInteger(quantity)) {
      throw new AppException(ErrorCode.E055, HttpStatus.BAD_REQUEST);
    }
  }

  /** RM là lá — không được nhận node con. */
  private async ensureBomItemCanHaveChildren(bomItemId: string): Promise<void> {
    const node = await this.db.query.bomItems.findFirst({
      columns: { id: true },
      with: { item: { columns: { type: true } } },
      where: eq(bomItems.id, bomItemId),
    });

    // `item` là FK bắt buộc, đúng 1 dòng — Drizzle suy sai kiểu thành one|many sau khi schema có
    // thêm nhiều quan hệ trỏ `users`, ép lại cho đúng thực tế thay vì đổi logic.
    const item = node?.item;
    if (item?.type === ItemType.RM) {
      throw new AppException(ErrorCode.E052, HttpStatus.BAD_REQUEST);
    }
  }

  /** RM là lá — không được gắn `bom_operations`. Public vì `BomOperationsService`
   * (`BomOperationsModule` import `BomsModule`) gọi trước khi insert. */
  async ensureBomItemCanHaveOperations(bomItemId: string): Promise<void> {
    const node = await this.db.query.bomItems.findFirst({
      columns: { id: true },
      with: { item: { columns: { type: true } } },
      where: eq(bomItems.id, bomItemId),
    });

    if (!node) {
      throw new AppException(ErrorCode.E050, HttpStatus.NOT_FOUND);
    }
    const item = node.item;
    if (item.type === ItemType.RM) {
      throw new AppException(ErrorCode.E063, HttpStatus.BAD_REQUEST);
    }
  }

  /** Node phải thuộc đúng BOM của `itemId` — chặn `bomItemId` của cây item khác lọt qua URL này.
   * Public vì `BomOperationsService` cũng cần kiểm tra này. */
  async ensureBomItemInBom(
    itemId: string,
    bomItemId: string,
  ): Promise<{ bomId: string }> {
    const node = await this.db.query.bomItems.findFirst({
      columns: { id: true, bomId: true },
      with: { bom: { columns: { itemId: true } } },
      where: eq(bomItems.id, bomItemId),
    });

    if (!node) {
      throw new AppException(ErrorCode.E051, HttpStatus.NOT_FOUND);
    }
    // `bomId` là FK bắt buộc, đúng 1 dòng — Drizzle suy sai kiểu `bom` thành one|many sau khi
    // schema có thêm nhiều quan hệ trỏ `users`, ép lại cho đúng thực tế thay vì đổi logic.
    const bom = node.bom;
    if (bom.itemId !== itemId) {
      throw new AppException(ErrorCode.E051, HttpStatus.NOT_FOUND);
    }

    return { bomId: node.bomId };
  }

  /** Chặn một item trở thành tổ tiên/hậu duệ của chính nó trong cùng cây. Chỉ gọi khi node đang
   * thêm là WIP — RM luôn là lá nên không bao giờ tạo được vòng lặp. Giới hạn bởi `MAX_BOM_DEPTH`
   * để chặn vòng lặp vô hạn nếu dữ liệu hỏng — cây thật nông và repo không có tiền lệ CTE đệ quy,
   * nên cố ý dùng loop thay vì `WITH RECURSIVE`. */
  private async checkNoCycle(
    bomId: string | undefined,
    rootItemId: string,
    parentId: string | null,
    candidateItemId: string,
  ): Promise<void> {
    if (candidateItemId === rootItemId) {
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
        | { itemId: string | null; parentId: string | null }
        | undefined = await this.db.query.bomItems.findFirst({
        columns: { itemId: true, parentId: true },
        where: and(eq(bomItems.id, currentId), eq(bomItems.bomId, bomId)),
      });

      if (!node) {
        break;
      }

      if (node.itemId === candidateItemId) {
        throw new AppException(ErrorCode.E054, HttpStatus.CONFLICT);
      }

      currentId = node.parentId;
    }
  }

  private async getBomOrThrow(itemId: string): Promise<{ id: string }> {
    const bom = await this.db.query.boms.findFirst({
      columns: { id: true },
      where: eq(boms.itemId, itemId),
    });

    if (!bom) {
      throw new AppException(ErrorCode.E050, HttpStatus.NOT_FOUND);
    }

    return bom;
  }

  private async ensureBomItemExists(
    bomId: string,
    bomItemId: string,
  ): Promise<{
    id: string;
    drawingFileId: string | null;
    itemType: ItemType;
  }> {
    const node = await this.db.query.bomItems.findFirst({
      columns: { id: true, drawingFileId: true },
      with: { item: { columns: { type: true } } },
      where: and(eq(bomItems.id, bomItemId), eq(bomItems.bomId, bomId)),
    });

    if (!node) {
      throw new AppException(ErrorCode.E050, HttpStatus.NOT_FOUND);
    }

    // Same Drizzle type-inference quirk as `ensureBomItemCanHaveOperations`.
    const item = node.item;

    return {
      id: node.id,
      drawingFileId: node.drawingFileId,
      itemType: item.type,
    };
  }

  /** Header `boms` sinh lười — get-or-create trong transaction ghi node đầu tiên của item.
   * `onConflictDoNothing` là chốt chặn race thật; `existingBomId` (đọc trước transaction) chỉ để
   * tránh round-trip insert thừa khi header đã chắc chắn có sẵn. */
  private async getOrCreateBomId(
    tx: DbTransaction,
    itemId: string,
    existingBomId: string | undefined,
    userId: string,
  ): Promise<string> {
    if (existingBomId) {
      return existingBomId;
    }

    const [created] = await tx
      .insert(boms)
      .values({ itemId, createdBy: userId })
      .onConflictDoNothing({ target: boms.itemId })
      .returning({ id: boms.id });

    return (
      created?.id ??
      (await tx.query.boms.findFirst({
        columns: { id: true },
        where: eq(boms.itemId, itemId),
      }))!.id
    );
  }
}
