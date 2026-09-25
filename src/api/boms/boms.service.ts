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

import { groupBy } from '../../common/utils/array.util';
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
  operations,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { UnitsService } from '../units/units.service';
import { BomOperationResDto } from '../bom-operations/dto/bom-operation.res.dto';
import { buildBomItemPaths, compareBomPaths } from './bom-tree.util';
import { BomItemResDto } from './dto/bom-item.res.dto';
import { CreateBomItemReqDto } from './dto/create-bom-item.req.dto';
import { UpdateBomItemReqDto } from './dto/update-bom-item.req.dto';

// Vừa đủ field cho `updateBomItem`/`deleteBomItem` tự kiểm hình dạng node trước khi ghi —
// `ensureBomItemExists` trả về đúng shape này.
type BomItemShapeCheck = {
  id: string;
  type: BomType;
};

/**
 * Cây BOM một item FG — `bom_items` chứa node COMPONENT (cấu trúc con, `code`/`name` riêng,
 * không trỏ item) lẫn lá DIRECT (trỏ `items`), xem `docs/decisions/wip-removal.md`.
 * DIRECT luôn là lá: không được nhận con (`E052`) và không được gắn `bom_operations`
 * (`E063`); ngược lại, DIRECT chỉ được gắn vào node chưa có con COMPONENT (`E273`), trừ vật tư
 * ngoài cấu trúc (`isOffStructure`).
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

    const [bom] = await this.db
      .select({ id: boms.id })
      .from(boms)
      .where(eq(boms.itemId, itemId))
      .limit(1);

    // Chưa có BOM (chưa ghi node nào) → mảng rỗng. Cấp 0 (chính item FG) không nằm trong mảng này
    // — FE đọc thông tin Cấp 0 qua `GET /items/:itemId` và công đoạn Cấp 0 qua
    // `GET /items/:itemId/operations` (`docs/decisions/bom-header-as-level-0-anchor.md`).
    if (!bom) {
      return [];
    }

    // Sắp theo (level, sortOrder, createdAt) — chưa phải depth-first theo từng nhánh, nhưng đủ để
    // `buildBomItemPaths` bên dưới gom đúng theo cha (2 node cùng cha luôn cùng level).
    const rows = await this.db
      .select({
        id: bomItems.id,
        parentId: bomItems.parentId,
        type: bomItems.type,
        itemId: bomItems.itemId,
        // Node COMPONENT mang `code`/`name` trên chính dòng; node DIRECT đọc từ item được
        // trỏ tới.
        code: sql<string>`coalesce(${bomItems.code}, ${items.code})`,
        name: sql<string>`coalesce(${bomItems.name}, ${items.name})`,
        revision: items.revision,
        image: getTableColumns(files),
        unit: getTableColumns(units),
        quantity: bomItems.quantity,
        level: bomItems.level,
        sortOrder: bomItems.sortOrder,
        note: bomItems.note,
        isOffStructure: bomItems.isOffStructure,
      })
      .from(bomItems)
      .leftJoin(items, eq(bomItems.itemId, items.id))
      .leftJoin(
        units,
        eq(units.id, sql`coalesce(${items.unitId}, ${bomItems.unitId})`),
      )
      .leftJoin(
        files,
        eq(
          files.id,
          sql`coalesce(${items.imageFileId}, ${bomItems.imageFileId})`,
        ),
      )
      .where(eq(bomItems.bomId, bom.id))
      .orderBy(
        asc(bomItems.level),
        asc(bomItems.sortOrder),
        asc(bomItems.createdAt),
      );

    // Vật tư ngoài cấu trúc không tính vào path nên STT của Part không đổi — chúng đứng ngay sau
    // node chủ (Cấp 0 → đầu mảng), `path` mượn của chủ.
    const structureRows = rows.filter((row) => !row.isOffStructure);
    const offStructureRows = rows.filter((row) => row.isOffStructure);
    const paths = buildBomItemPaths(structureRows);
    structureRows.sort((a, b) =>
      compareBomPaths(paths.get(a.id) ?? [], paths.get(b.id) ?? []),
    );

    // Một query cho cả cây thay vì N+1 theo từng node — FE hiện chuỗi công đoạn ngay trên bảng cây.
    const operationRows = await this.db
      .select({
        bomItemId: bomOperations.bomItemId,
        id: bomOperations.id,
        type: bomOperations.type,
        sortOrder: bomOperations.sortOrder,
        note: bomOperations.note,
        createdAt: bomOperations.createdAt,
        updatedAt: bomOperations.updatedAt,
        operation: operations,
      })
      .from(bomOperations)
      .innerJoin(operations, eq(operations.id, bomOperations.operationId))
      .where(
        inArray(
          bomOperations.bomItemId,
          structureRows.map((row) => row.id),
        ),
      )
      .orderBy(
        asc(bomOperations.bomItemId),
        asc(bomOperations.sortOrder),
        asc(bomOperations.createdAt),
      );
    const operationsByItemId = groupBy(
      operationRows,
      ({ bomItemId }) => bomItemId,
    );

    const offStructureByOwnerId = groupBy(
      offStructureRows,
      (row) => row.parentId,
    );
    const toOffStructureNodes = (ownerId: string | null, path: number[]) =>
      (offStructureByOwnerId.get(ownerId) ?? []).map((row) => ({
        ...row,
        path,
        operations: [],
      }));

    const nodes = [
      ...toOffStructureNodes(null, []),
      ...structureRows.flatMap((row) => {
        const path = paths.get(row.id) ?? [];
        return [
          {
            ...row,
            path,
            operations: plainToInstance(
              BomOperationResDto,
              operationsByItemId.get(row.id) ?? [],
              { excludeExtraneousValues: true },
            ),
          },
          ...toOffStructureNodes(row.id, path),
        ];
      }),
    ];

    return plainToInstance(BomItemResDto, nodes, {
      excludeExtraneousValues: true,
    });
  }

  async createBomItem(
    itemId: string,
    reqDto: CreateBomItemReqDto,
    userId: string,
  ): Promise<void> {
    const rootItem = await this.ensureItemExists(itemId);
    if (rootItem.type === ItemType.DIRECT) {
      throw new AppException(ErrorCode.E111, HttpStatus.BAD_REQUEST);
    }

    this.ensureNodePayloadValid(reqDto);
    if (reqDto.type === BomType.DIRECT) {
      // `ensureNodePayloadValid` đã đảm bảo DIRECT luôn kèm `itemId`.
      await this.ensureItemIsDirect(reqDto.itemId!);
    }
    this.ensureComponentOnlyFields(reqDto.type, reqDto);
    if (reqDto.unitId) {
      await this.unitsService.ensureUnitExists(reqDto.unitId);
    }
    this.ensureQuantityValid(reqDto.type, reqDto.quantity);

    const [existingBom] = await this.db
      .select({ id: boms.id })
      .from(boms)
      .where(eq(boms.itemId, itemId))
      .limit(1);

    // `reqDto.parentId` là id một node `bom_items` thật, hoặc omit/null nghĩa là con trực tiếp của
    // Cấp 0. `ensureBomItemInBom` tự trả `E051` nếu chưa có BOM (không dòng nào khớp).
    let parentId: string | null = null;
    if (reqDto.parentId) {
      await this.ensureBomItemInBom(itemId, reqDto.parentId);
      await this.ensureBomItemCanHaveChildren(reqDto.parentId);
      parentId = reqDto.parentId;
    }

    if (reqDto.imageFileId) {
      await this.filesService.linkFiles([reqDto.imageFileId]);
    }

    await this.db.transaction(async (tx) => {
      const { bomId } = await this.getOrCreateBomId(
        tx,
        itemId,
        existingBom?.id,
        userId,
      );

      if (reqDto.type === BomType.DIRECT) {
        if (!reqDto.isOffStructure) {
          await this.ensureBomItemIsLeaf(tx, bomId, parentId);
        }
        // `ensureNodePayloadValid` đã đảm bảo DIRECT luôn kèm `itemId`.
        await this.ensureBomItemNotDuplicate(
          tx,
          bomId,
          parentId,
          reqDto.itemId!,
        );
      } else {
        await this.deleteDirectChildren(tx, bomId, parentId);
      }

      let parentLevel = 0;
      if (parentId) {
        const [parentItem] = await tx
          .select({ level: bomItems.level })
          .from(bomItems)
          .where(eq(bomItems.id, parentId))
          .limit(1);
        parentLevel = parentItem?.level ?? 0;
      }

      await tx.insert(bomItems).values({
        ...reqDto,
        bomId,
        parentId,
        itemId: reqDto.itemId ?? null,
        code: reqDto.code ?? null,
        name: reqDto.name ?? null,
        level: parentLevel + 1,
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
      bomItem.type === BomType.DIRECT &&
      (reqDto.code !== undefined || reqDto.name !== undefined)
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
    await this.ensureBomItemExists(bom.id, bomItemId);

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

  /** Kiểm hình dạng node (DIRECT chỉ có `itemId`, COMPONENT chỉ có `code`+`name`) ở đây để trả
   * 400 thay vì để CHECK `chk_bom_items_node_shape` ở DB nổ thành 500. */
  private ensureNodePayloadValid(payload: CreateBomItemReqDto): void {
    const isValid =
      payload.type === BomType.DIRECT
        ? !!payload.itemId && payload.code == null && payload.name == null
        : !payload.itemId &&
          !!payload.code &&
          !!payload.name &&
          !payload.isOffStructure;

    if (!isValid) {
      throw new AppException(ErrorCode.E271, HttpStatus.BAD_REQUEST);
    }
  }

  private async ensureItemIsDirect(candidateItemId: string): Promise<void> {
    const [item] = await this.db
      .select({ id: items.id, type: items.type })
      .from(items)
      .where(and(eq(items.id, candidateItemId), isNull(items.deletedAt)))
      .limit(1);

    if (!item) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }
    if (item.type !== ItemType.DIRECT) {
      throw new AppException(ErrorCode.E270, HttpStatus.BAD_REQUEST);
    }
  }

  /** ĐVT/ảnh riêng chỉ COMPONENT được gán — DIRECT đã có cả hai qua join item
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

  /** COMPONENT bắt buộc SL nguyên (cấu trúc lắp ráp); DIRECT được phép SL lẻ (định mức
   * vật tư). */
  private ensureQuantityValid(type: BomType, quantity: number): void {
    if (type === BomType.COMPONENT && !Number.isInteger(quantity)) {
      throw new AppException(ErrorCode.E055, HttpStatus.BAD_REQUEST);
    }
  }

  /** DIRECT là lá — không được nhận node con. */
  private async ensureBomItemCanHaveChildren(bomItemId: string): Promise<void> {
    const [bomItem] = await this.db
      .select({ type: bomItems.type })
      .from(bomItems)
      .where(eq(bomItems.id, bomItemId))
      .limit(1);

    if (bomItem?.type === BomType.DIRECT) {
      throw new AppException(ErrorCode.E052, HttpStatus.BAD_REQUEST);
    }
  }

  /** Vật tư chỉ gắn vào node chưa có con COMPONENT — `parentId: null` nghĩa là ngay dưới Cấp 0
   * (không phải một node thật), nên cần lọc kèm `bomId` thay vì chỉ `parentId`. */
  private async ensureBomItemIsLeaf(
    tx: DbTransaction,
    bomId: string,
    parentId: string | null,
  ): Promise<void> {
    const [componentChild] = await tx
      .select({ id: bomItems.id })
      .from(bomItems)
      .where(
        and(
          eq(bomItems.bomId, bomId),
          parentId
            ? eq(bomItems.parentId, parentId)
            : isNull(bomItems.parentId),
          eq(bomItems.type, BomType.COMPONENT),
        ),
      )
      .limit(1);

    if (componentChild) {
      throw new AppException(ErrorCode.E273, HttpStatus.BAD_REQUEST);
    }
  }

  /** Side-effect của `createBomItem` khi thêm COMPONENT: node cha vừa thành node cấu trúc nên vật tư
   * đang khai trực tiếp trên nó bị xoá ngầm, trừ vật tư ngoài cấu trúc (`docs/domains/product-structure.md`). */
  private async deleteDirectChildren(
    tx: DbTransaction,
    bomId: string,
    parentId: string | null,
  ): Promise<void> {
    await tx
      .delete(bomItems)
      .where(
        and(
          eq(bomItems.bomId, bomId),
          parentId
            ? eq(bomItems.parentId, parentId)
            : isNull(bomItems.parentId),
          eq(bomItems.type, BomType.DIRECT),
          eq(bomItems.isOffStructure, false),
        ),
      );
  }

  /** Chặn thêm cùng `itemId` hai lần dưới cùng node cha — nổ BOM sẽ cộng trùng nhu cầu nếu lọt.
   * `parentId: null` nghĩa là ngay dưới Cấp 0 (không phải một node thật), lọc bằng `isNull` thay
   * vì so `=` (Postgres không khớp NULL với NULL qua `=`). Chạy trong `tx` của `createBomItem` vì
   * phải sau khi `getOrCreateBomId` resolve xong `bomId`. */
  private async ensureBomItemNotDuplicate(
    tx: DbTransaction,
    bomId: string,
    parentId: string | null,
    itemId: string,
  ): Promise<void> {
    const [duplicate] = await tx
      .select({ id: bomItems.id })
      .from(bomItems)
      .where(
        and(
          eq(bomItems.bomId, bomId),
          parentId
            ? eq(bomItems.parentId, parentId)
            : isNull(bomItems.parentId),
          eq(bomItems.itemId, itemId),
        ),
      )
      .limit(1);

    if (duplicate) {
      throw new AppException(ErrorCode.E245, HttpStatus.CONFLICT);
    }
  }

  /** DIRECT là lá — không được gắn `bom_operations`. Public vì `BomOperationsService`
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
    if (bomItem.type === BomType.DIRECT) {
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
    const [bom] = await this.db
      .select({ id: boms.id })
      .from(boms)
      .where(eq(boms.itemId, itemId))
      .limit(1);

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

  /** Header `boms` sinh lười — get-or-create trong transaction ghi node đầu tiên của item.
   * `onConflictDoNothing` (trên `boms.itemId`) là chốt chặn race thật: Postgres khoá dòng đang
   * insert tới khi giao dịch thắng cuộc đua commit, nhánh thua (`created` rỗng) đọc lại luôn thấy
   * header đã có sẵn. `existingBomId` (đọc trước transaction) chỉ để tránh round-trip insert thừa
   * khi header đã chắc chắn có sẵn. Public vì `RoutingsService` (`RoutingsModule` import
   * `BomsModule`) cần header này để ghi công đoạn Cấp 0 đầu tiên của item. */
  async getOrCreateBomId(
    tx: DbTransaction,
    itemId: string,
    existingBomId: string | undefined,
    userId: string,
  ): Promise<{ bomId: string }> {
    if (existingBomId) {
      return { bomId: existingBomId };
    }

    const [created] = await tx
      .insert(boms)
      .values({ itemId, createdBy: userId })
      .onConflictDoNothing({ target: boms.itemId })
      .returning({ id: boms.id });

    if (created) {
      return { bomId: created.id };
    }

    const [existing] = await tx
      .select({ id: boms.id })
      .from(boms)
      .where(eq(boms.itemId, itemId))
      .limit(1);

    return { bomId: existing.id };
  }
}
