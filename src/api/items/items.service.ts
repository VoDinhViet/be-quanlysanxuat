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
import {
  DocumentType,
  generateDocumentSequence,
} from '../../common/utils/document-sequence.util';
import { extractPostgresError } from '../../common/utils/postgres-error.util';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  bomItems,
  BomItemSelect,
  boms,
  clients,
  files,
  itemFiles,
  items,
  ItemStatus,
  ItemType,
  orderItems,
  productionJobs,
  productionOrderItems,
  suppliers,
  units,
  UnitScope,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { CreateItemReqDto } from './dto/create-item.req.dto';
import { GetItemIssuesReqDto } from './dto/get-item-issues.req.dto';
import { GetItemOptionsReqDto } from './dto/get-item-options.req.dto';
import { GetItemsReqDto } from './dto/get-items.req.dto';
import { ItemIssueResDto } from './dto/item-issue.res.dto';
import { ItemOptionResDto } from './dto/item-option.res.dto';
import { ItemResDto } from './dto/item.res.dto';
import { PageItemResDto } from './dto/page-item.res.dto';
import { UpdateItemReqDto } from './dto/update-item.req.dto';

@Injectable()
export class ItemsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly filesService: FilesService,
  ) {}

  async getItems(
    reqDto: GetItemsReqDto,
  ): Promise<OffsetPaginatedDto<PageItemResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      isNull(items.deletedAt),
      keyword
        ? or(
            unaccentILike(items.code, keyword),
            unaccentILike(items.name, keyword),
          )
        : undefined,
      reqDto.type?.length ? inArray(items.type, reqDto.type) : undefined,
      reqDto.clientId ? eq(items.clientId, reqDto.clientId) : undefined,
      reqDto.supplierId ? eq(items.supplierId, reqDto.supplierId) : undefined,
      reqDto.status ? eq(items.status, reqDto.status) : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.items.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(items.createdAt),
        with: {
          client: true,
          unit: true,
          supplier: true,
          creatorBy: true,
          imageFile: true,
        },
      }),
      this.db.select({ total: count() }).from(items).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageItemResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getItemOptions(
    reqDto: GetItemOptionsReqDto,
  ): Promise<ItemOptionResDto[]> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const entities = await this.db.query.items.findMany({
      where: and(
        isNull(items.deletedAt),
        eq(items.status, ItemStatus.ACTIVE),
        keyword
          ? or(
              unaccentILike(items.code, keyword),
              unaccentILike(items.name, keyword),
            )
          : undefined,
        reqDto.type ? eq(items.type, reqDto.type) : undefined,
      ),
      // Alphabetical, because this list is rendered straight into a dropdown.
      orderBy: asc(items.name),
      // Trần cứng: `items` là dữ liệu người dùng tự tạo (thêm cả nhân bản qua `POST /:id/copy`),
      // không phải catalogue nhỏ cố định như units/countries.
      limit: 100,
    });

    return plainToInstance(ItemOptionResDto, entities, {
      excludeExtraneousValues: true,
    });
  }

  async getItem(itemId: string): Promise<ItemResDto> {
    const item = await this.db.query.items.findFirst({
      where: and(eq(items.id, itemId), isNull(items.deletedAt)),
      with: {
        client: true,
        unit: true,
        supplier: true,
        creatorBy: true,
        imageFile: true,
        clonedFrom: true,
        files: { with: { file: true } },
      },
    });

    if (!item) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(ItemResDto, item, {
      excludeExtraneousValues: true,
    });
  }

  async createItem(reqDto: CreateItemReqDto, userId: string): Promise<void> {
    const type = reqDto.type ?? ItemType.FG;

    if (reqDto.code) {
      await this.validateCodeUniqueness(reqDto.code);
    }

    await this.ensureUnitExists(reqDto.unitId, type);
    if (reqDto.clientId) {
      await this.ensureClientExists(reqDto.clientId);
    }
    if (reqDto.supplierId) {
      await this.ensureSupplierExists(reqDto.supplierId);
    }
    await this.linkSuppliedFiles(reqDto);

    // `fileIds` sống ở bảng riêng `item_files` — tách khỏi phần spread thẳng vào `items`.
    const { fileIds, ...itemFields } = reqDto;

    try {
      await this.db.transaction(async (tx) => {
        const code = reqDto.code ?? (await this.generateItemCode(tx, type));

        // `type`/`status`/`minStock` đều có default ở cột schema, bỏ trống là DB tự điền.
        const [item] = await tx
          .insert(items)
          .values({
            ...itemFields,
            code,
            createdBy: userId,
          })
          .returning({ id: items.id });

        if (fileIds?.length) {
          await this.replaceFiles(tx, item.id, fileIds);
        }
      });
    } catch (error) {
      // Mã client tự gửi vẫn còn TOCTOU giữa `validateCodeUniqueness` và `INSERT` — bắt ở đây
      // thay vì để lỗi Postgres thô 500 lọt ra ngoài.
      if (extractPostgresError(error)?.code === '23505') {
        throw new AppException(ErrorCode.E008, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async updateItem(itemId: string, reqDto: UpdateItemReqDto): Promise<void> {
    const existing = await this.ensureItemExists(itemId);

    if (reqDto.code) {
      await this.validateCodeUniqueness(reqDto.code, itemId);
    }
    if (reqDto.unitId) {
      await this.ensureUnitExists(reqDto.unitId, reqDto.type ?? existing.type);
    }
    if (reqDto.clientId) {
      await this.ensureClientExists(reqDto.clientId);
    }
    if (reqDto.supplierId) {
      await this.ensureSupplierExists(reqDto.supplierId);
    }
    await this.linkSuppliedFiles(reqDto);

    const { fileIds, ...itemFields } = reqDto;

    await this.db.transaction(async (tx) => {
      // `updated_at` is bumped by the column's own `$onUpdate`. Skip the `UPDATE` entirely when a
      // request only sends `fileIds` — `UpdateItemReqDto`'s declared-but-unset fields still show up
      // as own keys (`undefined`) at runtime, so `Object.keys` alone can't tell "nothing sent" from
      // "every other field sent"; checking for a defined value avoids drizzle's "No values to set".
      if (Object.values(itemFields).some((value) => value !== undefined)) {
        await tx.update(items).set(itemFields).where(eq(items.id, itemId));
      }

      if (fileIds) {
        await this.replaceFiles(tx, itemId, fileIds);
      }
    });
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.ensureItemExists(itemId);
    await this.ensureItemNotInUse(itemId);

    await this.db
      .update(items)
      .set({ deletedAt: new Date() })
      .where(eq(items.id, itemId));
  }

  /** Chặn xoá khi item đã gắn Đơn hàng hoặc Lệnh sản xuất — không chặn theo BOM (component của
   * item khác vẫn xoá được, xoá mềm không phá cấu trúc BOM đã có). */
  private async ensureItemNotInUse(itemId: string): Promise<void> {
    const referencingTables = [
      orderItems,
      productionOrderItems,
      productionJobs,
    ];

    const references = await Promise.all(
      referencingTables.map((table) =>
        this.db
          .select({ id: table.id })
          .from(table)
          .where(eq(table.itemId, itemId))
          .limit(1),
      ),
    );

    if (references.some((rows) => rows.length > 0)) {
      throw new AppException(ErrorCode.E255, HttpStatus.CONFLICT);
    }
  }

  /**
   * Validates every file id the request carries and marks them linked, so the orphan sweeper
   * leaves them alone. Runs **before** the transaction on purpose — see `FilesService.linkFiles`.
   */
  private async linkSuppliedFiles(
    reqDto: CreateItemReqDto | UpdateItemReqDto,
  ): Promise<void> {
    const fileIds = [reqDto.imageFileId, ...(reqDto.fileIds ?? [])].filter(
      (id): id is string => Boolean(id),
    );

    await this.filesService.linkFiles(fileIds);
  }

  /** Replace-all. `tx` is required so a caller cannot accidentally write outside the transaction. */
  private async replaceFiles(
    tx: DbTransaction,
    itemId: string,
    fileIds: string[],
  ): Promise<void> {
    await tx.delete(itemFiles).where(eq(itemFiles.itemId, itemId));

    if (fileIds.length) {
      await tx
        .insert(itemFiles)
        .values(fileIds.map((fileId) => ({ itemId, fileId })));
    }
  }

  /** "Thành phần vật tư" — báo cáo phái sinh chỉ-đọc, KHÁC `getBom` (cây thật, `quantity` thô so
   * cha trực tiếp): ở đây `requiredQty` là định mức đã nổ cấp (nhân luỹ kế qua chuỗi node cha, seed
   * = 1 tại gốc) và gộp theo `itemId` — cùng tên, cùng khái niệm với
   * `ProductionJobIssueResDto.requiredQty` (seed = SL Job), xem "Chuẩn nổ cấp BOM" ở
   * `docs/domains/product-structure.md`. Cây BOM nhỏ nên dựng multiplier + gộp trong bộ nhớ (cùng
   * tiền lệ `copyBomTree`), phân trang cũng áp trên mảng đã gộp — không còn phân trang bằng SQL
   * trên `bom_items`. */
  async getItemIssues(
    itemId: string,
    reqDto: GetItemIssuesReqDto,
  ): Promise<OffsetPaginatedDto<ItemIssueResDto>> {
    await this.ensureItemExists(itemId);

    const bom = await this.db.query.boms.findFirst({
      columns: { id: true },
      where: eq(boms.itemId, itemId),
    });

    if (!bom) {
      return new OffsetPaginatedDto([], new OffsetPaginationDto(0, reqDto));
    }

    const tree = await this.db
      .select({
        id: bomItems.id,
        parentId: bomItems.parentId,
        itemId: bomItems.itemId,
        quantity: bomItems.quantity,
        itemType: items.type,
      })
      .from(bomItems)
      .innerJoin(items, eq(bomItems.itemId, items.id))
      .where(eq(bomItems.bomId, bom.id))
      .orderBy(asc(bomItems.level), asc(bomItems.sortOrder));

    // multiplier[node] = multiplier[cha] × quantity node, gốc (parentId null) = 1 × quantity —
    // đi từ gốc xuống đúng N tầng WIP rồi dừng ở RM, không cần xử lý RM có con (bất biến `E052`).
    // Làm tròn scale 3 ngay mỗi bước nhân (không chỉ lúc gộp cuối) — khác `copyBomTree`/
    // `copyBomIssues` phía Job, số ở đây không đi qua cột `numeric(18,3)` nào để Postgres tự làm
    // tròn hộ giữa các cấp, nên tự làm tròn để tránh rác dấu phẩy động lọt ra JSON (cùng idiom
    // `IqcService.validateDecision`'s `scale`).
    const multiplierById = new Map<string, number>();
    const totalByItemId = new Map<string, number>();

    for (const node of tree) {
      const parentMultiplier = node.parentId
        ? multiplierById.get(node.parentId)!
        : 1;
      const multiplier =
        Math.round(parentMultiplier * node.quantity * 1000) / 1000;
      multiplierById.set(node.id, multiplier);

      if (node.itemType === ItemType.RM) {
        const total =
          Math.round(
            ((totalByItemId.get(node.itemId) ?? 0) + multiplier) * 1000,
          ) / 1000;
        totalByItemId.set(node.itemId, total);
      }
    }

    if (!totalByItemId.size) {
      return new OffsetPaginatedDto([], new OffsetPaginationDto(0, reqDto));
    }

    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const itemRows = await this.db
      .select({
        itemId: items.id,
        code: items.code,
        name: items.name,
        unit: getTableColumns(units),
        image: getTableColumns(files),
      })
      .from(items)
      .innerJoin(units, eq(items.unitId, units.id))
      .leftJoin(files, eq(items.imageFileId, files.id))
      .where(
        and(
          inArray(items.id, [...totalByItemId.keys()]),
          keyword
            ? or(
                unaccentILike(items.code, keyword),
                unaccentILike(items.name, keyword),
              )
            : undefined,
        ),
      )
      .orderBy(asc(items.code));

    const issues = itemRows.map((row) => ({
      ...row,
      requiredQty: totalByItemId.get(row.itemId)!,
    }));

    const paged = issues.slice(reqDto.offset, reqDto.offset + reqDto.limit);

    return new OffsetPaginatedDto(
      plainToInstance(ItemIssueResDto, paged, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(issues.length, reqDto),
    );
  }

  /** Clone một item (FG/WIP): tạo item mới mang mã tự sinh, giữ `clonedFromItemId` để truy vết,
   * kèm nhân bản cả cây BOM (node WIP lẫn lá RM). RM không có cây BOM nên bị chặn ở đây (`E110`). */
  async copyItem(itemId: string, userId: string): Promise<void> {
    const item = await this.ensureItemExists(itemId);

    if (item.type === ItemType.RM) {
      throw new AppException(ErrorCode.E110, HttpStatus.BAD_REQUEST);
    }

    // 1. Đọc BOM + tài liệu đính kèm gốc trước khi mở transaction
    const bom = await this.db.query.boms.findFirst({
      columns: { id: true },
      where: eq(boms.itemId, itemId),
    });

    const sourceBomItems = bom
      ? await this.db.query.bomItems.findMany({
          where: eq(bomItems.bomId, bom.id),
          orderBy: [asc(bomItems.level), asc(bomItems.sortOrder)],
        })
      : [];

    const sourceFiles = await this.db
      .select({ fileId: itemFiles.fileId })
      .from(itemFiles)
      .where(eq(itemFiles.itemId, itemId));

    // 2. Mở transaction để ghi dữ liệu mới
    await this.db.transaction(async (tx) => {
      const code = await this.generateItemCode(tx, item.type);

      const {
        id: clonedFromItemId,
        code: _code,
        createdAt,
        updatedAt,
        deletedAt,
        createdBy,
        ...copyFields
      } = item;

      const [createdItem] = await tx
        .insert(items)
        .values({
          ...copyFields,
          code,
          clonedFromItemId,
          createdBy: userId,
        })
        .returning({ id: items.id });

      if (bom) {
        await this.copyBomTree(tx, createdItem.id, sourceBomItems, userId);
      }

      if (sourceFiles.length) {
        await this.replaceFiles(
          tx,
          createdItem.id,
          sourceFiles.map((row) => row.fileId),
        );
      }
    });
  }

  private async copyBomTree(
    tx: DbTransaction,
    itemId: string,
    sourceBomItems: BomItemSelect[],
    userId: string,
  ): Promise<void> {
    const [newBom] = await tx
      .insert(boms)
      .values({ itemId, createdBy: userId })
      .returning({ id: boms.id });

    const newIdByOldId = new Map<string, string>();

    const newItems = sourceBomItems.map(
      ({
        id: oldId,
        parentId: oldParentId,
        bomId: _bomId,
        createdAt,
        updatedAt,
        ...node
      }) => {
        const id = crypto.randomUUID();
        newIdByOldId.set(oldId, id);

        return {
          ...node,
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
  }

  private async ensureItemExists(itemId: string) {
    const existing = await this.db.query.items.findFirst({
      where: and(eq(items.id, itemId), isNull(items.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private async validateCodeUniqueness(
    code: string,
    ignoredItemId?: string,
  ): Promise<void> {
    const where = ignoredItemId
      ? and(eq(items.code, code), ne(items.id, ignoredItemId))
      : eq(items.code, code);

    const existing = await this.db.query.items.findFirst({
      columns: { id: true },
      where,
    });

    if (existing) {
      throw new AppException(ErrorCode.E008, HttpStatus.CONFLICT);
    }
  }

  /** Unit phải tồn tại *và* được đánh dấu dùng được cho loại item này — lọc dropdown qua
   * `GET /units?scope=...` chỉ là cosmetic, client vẫn post được unit id bất kỳ. */
  private async ensureUnitExists(
    unitId: string,
    type: ItemType,
  ): Promise<void> {
    const existing = await this.db.query.units.findFirst({
      columns: { id: true },
      with: { scopes: { columns: { scope: true } } },
      where: eq(units.id, unitId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E011, HttpStatus.NOT_FOUND);
    }

    const requiredScope =
      type === ItemType.RM ? UnitScope.MATERIAL : UnitScope.PRODUCT;
    if (!existing.scopes.some(({ scope }) => scope === requiredScope)) {
      throw new AppException(ErrorCode.E043, HttpStatus.BAD_REQUEST);
    }
  }

  private async ensureClientExists(clientId: string): Promise<void> {
    const existing = await this.db.query.clients.findFirst({
      columns: { id: true },
      where: and(eq(clients.id, clientId), isNull(clients.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E009, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureSupplierExists(supplierId: string): Promise<void> {
    const existing = await this.db.query.suppliers.findFirst({
      columns: { id: true },
      where: and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E019, HttpStatus.NOT_FOUND);
    }
  }

  private async generateItemCode(
    tx: DbTransaction,
    type: ItemType,
  ): Promise<string> {
    const prefix = type === ItemType.RM ? 'VT' : 'SP';
    const documentType =
      type === ItemType.RM ? DocumentType.ITEM_RM : DocumentType.ITEM_FG_WIP;
    const sequence = await generateDocumentSequence(tx, documentType);

    return `${prefix}${String(sequence).padStart(4, '0')}`;
  }
}
