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
  items,
  ItemStatus,
  ItemType,
  suppliers,
  units,
  UnitScope,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { CreateItemReqDto } from './dto/create-item.req.dto';
import { GetItemMaterialsReqDto } from './dto/get-item-materials.req.dto';
import { GetItemOptionsReqDto } from './dto/get-item-options.req.dto';
import { GetItemsReqDto } from './dto/get-items.req.dto';
import { ItemMaterialResDto } from './dto/item-material.res.dto';
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
    if (reqDto.imageFileId) {
      await this.filesService.linkFiles([reqDto.imageFileId]);
    }

    try {
      await this.db.transaction(async (tx) => {
        const code = reqDto.code ?? (await this.generateItemCode(tx, type));

        // `type`/`status`/`minStock` đều có default ở cột schema, bỏ trống là DB tự điền.
        await tx.insert(items).values({
          ...reqDto,
          code,
          createdBy: userId,
        });
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
    if (reqDto.imageFileId) {
      await this.filesService.linkFiles([reqDto.imageFileId]);
    }

    // `updated_at` is bumped by the column's own `$onUpdate`.
    await this.db.update(items).set(reqDto).where(eq(items.id, itemId));
  }

  async getItemMaterials(
    itemId: string,
    reqDto: GetItemMaterialsReqDto,
  ): Promise<OffsetPaginatedDto<ItemMaterialResDto>> {
    await this.ensureItemExists(itemId);

    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      eq(boms.itemId, itemId),
      eq(items.type, ItemType.RM),
      keyword
        ? or(
            unaccentILike(items.code, keyword),
            unaccentILike(items.name, keyword),
          )
        : undefined,
    );

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          id: bomItems.id,
          itemId: items.id,
          code: items.code,
          name: items.name,
          unit: getTableColumns(units),
          image: getTableColumns(files),
          quantity: bomItems.quantity,
          sortOrder: bomItems.sortOrder,
          note: bomItems.note,
        })
        .from(bomItems)
        .innerJoin(boms, eq(bomItems.bomId, boms.id))
        .innerJoin(items, eq(bomItems.itemId, items.id))
        .innerJoin(units, eq(items.unitId, units.id))
        .leftJoin(files, eq(items.imageFileId, files.id))
        .where(where)
        .orderBy(asc(bomItems.sortOrder), asc(bomItems.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(bomItems)
        .innerJoin(boms, eq(bomItems.bomId, boms.id))
        .innerJoin(items, eq(bomItems.itemId, items.id))
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ItemMaterialResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Clone một item (FG/WIP): tạo item mới mang mã tự sinh, giữ `clonedFromItemId` để truy vết,
   * kèm nhân bản cả cây BOM (node WIP lẫn lá RM). RM không có cây BOM nên bị chặn ở đây (`E110`). */
  async copyItem(itemId: string, userId: string): Promise<void> {
    const item = await this.ensureItemExists(itemId);

    if (item.type === ItemType.RM) {
      throw new AppException(ErrorCode.E110, HttpStatus.BAD_REQUEST);
    }

    // 1. Đọc BOM gốc trước khi mở transaction
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
