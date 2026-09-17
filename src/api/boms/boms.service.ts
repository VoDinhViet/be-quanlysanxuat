import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  asc,
  eq,
  and,
  getTableColumns,
  inArray,
  isNull,
  sql,
} from 'drizzle-orm';

import { hasFields } from '../../common/utils/object.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  bomItems,
  bomOperations,
  boms,
  BomType,
  files,
  items,
  ItemType,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { UnitsService } from '../units/units.service';
import { BomOperationResDto } from '../bom-operations/dto/bom-operation.res.dto';
import { BomItemResDto } from './dto/bom-item.res.dto';
import { CreateBomItemReqDto } from './dto/create-bom-item.req.dto';
import { UpdateBomItemReqDto } from './dto/update-bom-item.req.dto';

// Hai hình dạng node hợp lệ (`chk_bom_items_node_shape`): CONSUMABLE chỉ có `itemId`, COMPONENT
// chỉ có `code`+`name` — `ensureNodePayloadValid` thu hẹp DTO về đúng một trong hai.
type BomNodePayload =
  | {
      type: BomType.CONSUMABLE;
      itemId: string;
      code?: undefined;
      name?: undefined;
    }
  | { type: BomType.COMPONENT; itemId?: undefined; code: string; name: string };

// Vừa đủ field cho `updateBomItem`/`deleteBomItem` tự kiểm hình dạng node trước khi ghi —
// `ensureBomItemExists` trả về đúng shape này.
type BomItemShapeCheck = {
  id: string;
  type: BomType;
};

/**
 * Cây BOM một item FG — `bom_items` chứa node COMPONENT (cấu trúc con, `code`/`name` riêng,
 * không trỏ item) lẫn lá CONSUMABLE (trỏ `items`), xem `docs/decisions/wip-removal.md`.
 * CONSUMABLE luôn là lá: không được nhận con (`E052`) và không được gắn `bom_operations`
 * (`E063`); ngược lại, CONSUMABLE chỉ được gắn vào node chưa có con COMPONENT (`E273`).
 * Xem `docs/domains/product-structure.md`.
 */
@Injectable()
export class BomsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly filesService: FilesService,
    private readonly unitsService: UnitsService,
  ) {}

  async getBomItem(itemId: string): Promise<BomItemResDto[]> {
    await this.ensureItemExists(itemId);

    // Join thẳng qua `boms` — item chưa có BOM (hoặc BOM chưa có node) đều tự nhiên ra mảng
    // rỗng, không cần early-return riêng. Sắp theo (level, sortOrder, createdAt) — không phải
    // depth-first theo từng nhánh, FE tự dựng lại thứ tự hiển thị (`buildBomRows`).
    const rows = await this.db
      .select({
        ...getTableColumns(bomItems),
        // Node COMPONENT mang `code`/`name` trên chính dòng; node CONSUMABLE đọc từ item được
        // trỏ tới.
        code: sql<string>`coalesce(${bomItems.code}, ${items.code})`,
        name: sql<string>`coalesce(${bomItems.name}, ${items.name})`,
        revision: items.revision,
        image: getTableColumns(files),
        unit: getTableColumns(units),
      })
      .from(bomItems)
      .innerJoin(boms, eq(bomItems.bomId, boms.id))
      .leftJoin(items, eq(bomItems.itemId, items.id))
      // COMPONENT không join `items` nên tự lấy `unit` qua `bomItems.unitId` riêng — coalesce đủ
      // vì CONSUMABLE/ROOT luôn có `unitId` (cột) là NULL (`chk_bom_items_node_shape`).
      .leftJoin(
        units,
        eq(units.id, sql`coalesce(${items.unitId}, ${bomItems.unitId})`),
      )
      // Cùng lý do với `unit`: ảnh của CONSUMABLE/ROOT đọc từ item liên kết, COMPONENT đọc
      // `bomItems.imageFileId` riêng.
      .leftJoin(
        files,
        eq(
          files.id,
          sql`coalesce(${items.imageFileId}, ${bomItems.imageFileId})`,
        ),
      )
      .where(eq(boms.itemId, itemId))
      .orderBy(
        asc(bomItems.level),
        asc(bomItems.sortOrder),
        asc(bomItems.createdAt),
      );

    // Một query `IN (...)` cho cả cây thay vì N+1 theo từng node — FE hiện chuỗi công đoạn ngay
    // trên bảng cây (cột "CÔNG ĐOẠN"), CONSUMABLE tự nhiên không khớp id nào nên ra mảng rỗng.
    const bomItemIds = rows.map((row) => row.id);
    const operationRows =
      bomItemIds.length === 0
        ? []
        : await this.db.query.bomOperations.findMany({
            where: inArray(bomOperations.bomItemId, bomItemIds),
            with: { operation: true },
            orderBy: [
              asc(bomOperations.sortOrder),
              asc(bomOperations.createdAt),
            ],
          });

    const operationsByBomItemId = new Map<string, typeof operationRows>();
    for (const operationRow of operationRows) {
      const group = operationsByBomItemId.get(operationRow.bomItemId) ?? [];
      group.push(operationRow);
      operationsByBomItemId.set(operationRow.bomItemId, group);
    }

    return plainToInstance(
      BomItemResDto,
      rows.map((row) => ({
        ...row,
        operations: plainToInstance(
          BomOperationResDto,
          operationsByBomItemId.get(row.id) ?? [],
          { excludeExtraneousValues: true },
        ),
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
    if (rootItem.type === ItemType.CONSUMABLE) {
      throw new AppException(ErrorCode.E111, HttpStatus.BAD_REQUEST);
    }

    this.ensureNodePayloadValid(reqDto);
    if (reqDto.type === BomType.CONSUMABLE) {
      await this.ensureConsumableItemValid(reqDto.itemId);
    }
    this.ensureComponentOnlyFields(reqDto.type, reqDto);
    if (reqDto.unitId) {
      await this.unitsService.ensureUnitExists(reqDto.unitId);
    }
    this.ensureQuantityValid(reqDto.type, reqDto.quantity);

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

    if (reqDto.imageFileId) {
      await this.filesService.linkFiles([reqDto.imageFileId]);
    }

    await this.db.transaction(async (tx) => {
      const { bomId, rootBomItemId } = await this.getOrCreateBom(
        tx,
        itemId,
        existingBom?.id,
        userId,
      );

      // Không truyền `parentId` nghĩa là "con trực tiếp của gốc" — từ
      // `docs/decisions/root-bom-item.md` gốc là node ROOT thật, không còn `parentId = null`.
      const parentId = reqDto.parentId ?? rootBomItemId;

      if (reqDto.type === BomType.CONSUMABLE) {
        await this.ensureBomItemIsLeaf(tx, parentId);
        await this.ensureBomItemNotDuplicate(
          tx,
          bomId,
          parentId,
          reqDto.itemId,
        );
      } else {
        await this.deleteConsumableChildren(tx, parentId);
      }

      const [parentItem] = await tx
        .select({ level: bomItems.level })
        .from(bomItems)
        .where(eq(bomItems.id, parentId))
        .limit(1);

      await tx.insert(bomItems).values({
        ...reqDto,
        bomId,
        parentId,
        itemId: reqDto.itemId ?? null,
        code: reqDto.code ?? null,
        name: reqDto.name ?? null,
        level: (parentItem?.level ?? 0) + 1,
        sortOrder: reqDto.sortOrder ?? 0,
        createdBy: userId,
      });
    });
  }

  /** Chỉ sửa SL/note (+ `code`/`name`/`unitId`/`imageFileId` của node COMPONENT) —
   * `type`/`itemId`/`parentId` bất biến, đổi thì xoá + thêm lại. */
  async updateBomItem(
    itemId: string,
    bomItemId: string,
    reqDto: UpdateBomItemReqDto,
  ): Promise<void> {
    await this.ensureItemExists(itemId);

    const bom = await this.getBomOrThrow(itemId);
    const bomItem = await this.ensureBomItemExists(bom.id, bomItemId);

    if (
      bomItem.type === BomType.CONSUMABLE &&
      (reqDto.code !== undefined || reqDto.name !== undefined)
    ) {
      throw new AppException(ErrorCode.E271, HttpStatus.BAD_REQUEST);
    }
    // ROOT ("Cấp 0") sinh tự động, `quantity`/`sortOrder` cố định (1/0 —
    // `docs/decisions/root-bom-item.md`); `note` vẫn sửa được như COMPONENT.
    if (
      bomItem.type === BomType.ROOT &&
      (reqDto.quantity !== undefined || reqDto.sortOrder !== undefined)
    ) {
      throw new AppException(ErrorCode.E271, HttpStatus.BAD_REQUEST);
    }
    if (reqDto.quantity !== undefined) {
      this.ensureQuantityValid(bomItem.type, reqDto.quantity);
    }
    this.ensureComponentOnlyFields(bomItem.type, reqDto);
    if (reqDto.unitId) {
      await this.unitsService.ensureUnitExists(reqDto.unitId);
    }
    if (reqDto.imageFileId) {
      await this.filesService.linkFiles([reqDto.imageFileId]);
    }

    if (hasFields(reqDto)) {
      await this.db
        .update(bomItems)
        .set(reqDto)
        .where(and(eq(bomItems.id, bomItemId), eq(bomItems.bomId, bom.id)));
    }
  }

  async deleteBomItem(itemId: string, bomItemId: string): Promise<void> {
    await this.ensureItemExists(itemId);

    const bom = await this.getBomOrThrow(itemId);
    const bomItem = await this.ensureBomItemExists(bom.id, bomItemId);

    // ROOT sống/chết theo `boms` header, không xoá lẻ qua API item thường
    // (`docs/decisions/root-bom-item.md`).
    if (bomItem.type === BomType.ROOT) {
      throw new AppException(ErrorCode.E271, HttpStatus.BAD_REQUEST);
    }

    await this.db
      .delete(bomItems)
      .where(and(eq(bomItems.id, bomItemId), eq(bomItems.bomId, bom.id)));
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

  /** Kiểm hình dạng node (`BomNodePayload`) ở đây để trả 400 thay vì để CHECK ở DB nổ thành
   * 500. */
  private ensureNodePayloadValid(
    payload: CreateBomItemReqDto,
  ): asserts payload is CreateBomItemReqDto & BomNodePayload {
    const isValid =
      payload.type === BomType.CONSUMABLE
        ? !!payload.itemId && payload.code == null && payload.name == null
        : !payload.itemId && !!payload.code && !!payload.name;

    if (!isValid) {
      throw new AppException(ErrorCode.E271, HttpStatus.BAD_REQUEST);
    }
  }

  private async ensureConsumableItemValid(
    candidateItemId: string,
  ): Promise<void> {
    const item = await this.db.query.items.findFirst({
      columns: { id: true, type: true },
      where: and(eq(items.id, candidateItemId), isNull(items.deletedAt)),
    });

    if (!item) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }
    if (item.type !== ItemType.CONSUMABLE) {
      throw new AppException(ErrorCode.E270, HttpStatus.BAD_REQUEST);
    }
  }

  /** ĐVT/ảnh riêng chỉ COMPONENT được gán — CONSUMABLE/ROOT đã có cả hai qua join item
   * (`chk_bom_items_node_shape` chặn ở tầng DB, đây là kiểm sớm để trả 400 thay vì 500). */
  private ensureComponentOnlyFields(
    type: BomType,
    reqDto: Pick<UpdateBomItemReqDto, 'unitId' | 'imageFileId'>,
  ): void {
    if (
      type !== BomType.COMPONENT &&
      (reqDto.unitId !== undefined || reqDto.imageFileId !== undefined)
    ) {
      throw new AppException(ErrorCode.E271, HttpStatus.BAD_REQUEST);
    }
  }

  /** COMPONENT bắt buộc SL nguyên (cấu trúc lắp ráp); CONSUMABLE được phép SL lẻ (định mức
   * vật tư). */
  private ensureQuantityValid(type: BomType, quantity: number): void {
    if (type === BomType.COMPONENT && !Number.isInteger(quantity)) {
      throw new AppException(ErrorCode.E055, HttpStatus.BAD_REQUEST);
    }
  }

  /** CONSUMABLE là lá — không được nhận node con. */
  private async ensureBomItemCanHaveChildren(bomItemId: string): Promise<void> {
    const [bomItem] = await this.db
      .select({ type: bomItems.type })
      .from(bomItems)
      .where(eq(bomItems.id, bomItemId))
      .limit(1);

    if (bomItem?.type === BomType.CONSUMABLE) {
      throw new AppException(ErrorCode.E052, HttpStatus.BAD_REQUEST);
    }
  }

  /** Vật tư chỉ gắn vào node chưa có con COMPONENT. Chạy trong `tx` của `createBomItem` — cùng lý do
   * với `ensureBomItemNotDuplicate`: `parentId` chỉ chắc chắn có sau `getOrCreateBom`. */
  private async ensureBomItemIsLeaf(
    tx: DbTransaction,
    bomItemId: string,
  ): Promise<void> {
    const [componentChild] = await tx
      .select({ id: bomItems.id })
      .from(bomItems)
      .where(
        and(
          eq(bomItems.parentId, bomItemId),
          eq(bomItems.type, BomType.COMPONENT),
        ),
      )
      .limit(1);

    if (componentChild) {
      throw new AppException(ErrorCode.E273, HttpStatus.BAD_REQUEST);
    }
  }

  /** Side-effect của `createBomItem` khi thêm COMPONENT: node cha vừa thành node cấu trúc nên vật tư
   * đang khai trực tiếp trên nó bị xoá ngầm (`docs/domains/product-structure.md`). */
  private async deleteConsumableChildren(
    tx: DbTransaction,
    bomItemId: string,
  ): Promise<void> {
    await tx
      .delete(bomItems)
      .where(
        and(
          eq(bomItems.parentId, bomItemId),
          eq(bomItems.type, BomType.CONSUMABLE),
        ),
      );
  }

  /** Chặn thêm cùng `itemId` hai lần dưới cùng node cha — nổ BOM sẽ cộng trùng nhu cầu nếu lọt.
   * `parentId` giờ luôn có giá trị thật (kể cả node ROOT — `docs/decisions/root-bom-item.md`),
   * không còn ca top-level `parentId = null` cần nhánh riêng. Chạy trong `tx` của `createBomItem`
   * vì `parentId` chỉ chắc chắn có (khi mặc định về ROOT) sau khi `getOrCreateBom` resolve xong. */
  private async ensureBomItemNotDuplicate(
    tx: DbTransaction,
    bomId: string,
    parentId: string,
    itemId: string,
  ): Promise<void> {
    const [duplicate] = await tx
      .select({ id: bomItems.id })
      .from(bomItems)
      .where(
        and(
          eq(bomItems.bomId, bomId),
          eq(bomItems.parentId, parentId),
          eq(bomItems.itemId, itemId),
        ),
      )
      .limit(1);

    if (duplicate) {
      throw new AppException(ErrorCode.E245, HttpStatus.CONFLICT);
    }
  }

  /** CONSUMABLE là lá — không được gắn `bom_operations`. Public vì `BomOperationsService`
   * (`BomOperationsModule` import `BomsModule`) gọi trước khi insert. */
  async ensureBomItemCanHaveOperations(bomItemId: string): Promise<void> {
    const [bomItem] = await this.db
      .select({ type: bomItems.type })
      .from(bomItems)
      .where(eq(bomItems.id, bomItemId))
      .limit(1);

    if (!bomItem) {
      throw new AppException(ErrorCode.E050, HttpStatus.NOT_FOUND);
    }
    if (bomItem.type === BomType.CONSUMABLE) {
      throw new AppException(ErrorCode.E063, HttpStatus.BAD_REQUEST);
    }
  }

  /** Node phải thuộc đúng BOM của `itemId` — chặn `bomItemId` của cây item khác lọt qua URL này.
   * Public vì `BomOperationsService` cũng cần kiểm tra này. */
  async ensureBomItemInBom(
    itemId: string,
    bomItemId: string,
  ): Promise<{ bomId: string }> {
    const bomItem = await this.db.query.bomItems.findFirst({
      columns: { id: true, bomId: true },
      with: { bom: { columns: { itemId: true } } },
      where: eq(bomItems.id, bomItemId),
    });

    if (!bomItem) {
      throw new AppException(ErrorCode.E051, HttpStatus.NOT_FOUND);
    }
    // `bomId` là FK bắt buộc, đúng 1 dòng — Drizzle suy sai kiểu `bom` thành one|many sau khi
    // schema có thêm nhiều quan hệ trỏ `users`, ép lại cho đúng thực tế thay vì đổi logic.
    const bom = bomItem.bom;
    if (bom.itemId !== itemId) {
      throw new AppException(ErrorCode.E051, HttpStatus.NOT_FOUND);
    }

    return { bomId: bomItem.bomId };
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
  ): Promise<BomItemShapeCheck> {
    const [bomItem] = await this.db
      .select({
        id: bomItems.id,
        type: bomItems.type,
      })
      .from(bomItems)
      .where(and(eq(bomItems.id, bomItemId), eq(bomItems.bomId, bomId)))
      .limit(1);

    if (!bomItem) {
      throw new AppException(ErrorCode.E050, HttpStatus.NOT_FOUND);
    }

    return bomItem;
  }

  /** Header `boms` sinh lười — get-or-create trong transaction ghi node đầu tiên của item, kèm
   * đúng 1 node ROOT ("Cấp 0", `docs/decisions/root-bom-item.md`) sinh cùng lúc — một `boms` row
   * không bao giờ tồn tại mà thiếu ROOT. `onConflictDoNothing` (trên `boms.itemId`) là chốt chặn
   * race thật cho `boms`: Postgres khoá dòng đang insert tới khi giao dịch thắng cuộc đua commit,
   * nên nhánh thua (`created` rỗng) đọc lại luôn thấy đủ cả `boms` lẫn ROOT của nó — ROOT vì vậy
   * không cần `onConflictDoNothing` riêng, chỉ transaction thắng cuộc mới bao giờ insert nó.
   * `existingBomId` (đọc trước transaction) chỉ để tránh round-trip insert thừa khi header đã
   * chắc chắn có sẵn. */
  private async getOrCreateBom(
    tx: DbTransaction,
    itemId: string,
    existingBomId: string | undefined,
    userId: string,
  ): Promise<{ bomId: string; rootBomItemId: string }> {
    if (existingBomId) {
      return {
        bomId: existingBomId,
        rootBomItemId: await this.getRootBomItemId(tx, existingBomId),
      };
    }

    const [created] = await tx
      .insert(boms)
      .values({ itemId, createdBy: userId })
      .onConflictDoNothing({ target: boms.itemId })
      .returning({ id: boms.id });

    if (created) {
      const [root] = await tx
        .insert(bomItems)
        .values({
          bomId: created.id,
          parentId: null,
          type: BomType.ROOT,
          itemId,
          quantity: 1,
          level: 0,
          sortOrder: 0,
          createdBy: userId,
        })
        .returning({ id: bomItems.id });

      return { bomId: created.id, rootBomItemId: root.id };
    }

    const [existing] = await tx
      .select({ id: boms.id })
      .from(boms)
      .where(eq(boms.itemId, itemId))
      .limit(1);
    const bomId = existing.id;

    return { bomId, rootBomItemId: await this.getRootBomItemId(tx, bomId) };
  }

  /** Bất biến: một `boms` row không bao giờ tồn tại mà thiếu ROOT — cả hai luôn sinh cùng nhau
   * trong `getOrCreateBom`. */
  private async getRootBomItemId(
    tx: DbTransaction,
    bomId: string,
  ): Promise<string> {
    const [root] = await tx
      .select({ id: bomItems.id })
      .from(bomItems)
      .where(and(eq(bomItems.bomId, bomId), eq(bomItems.type, BomType.ROOT)))
      .limit(1);

    return root.id;
  }
}
