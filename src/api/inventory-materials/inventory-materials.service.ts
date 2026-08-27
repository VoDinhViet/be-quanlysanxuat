import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  eq,
  getTableColumns,
  isNull,
  or,
  sql,
} from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  files,
  items,
  ItemStatus,
  ItemType,
  suppliers,
  units,
} from '../../database/schemas';
import {
  remainingBomDemandByItemSubquery,
  requisitionHeldQuantityByItemSubquery,
} from '../inventory-requisitions/inventory-requisitions.query';
import {
  balanceByItemSubquery,
  stockStatusCondition,
} from '../inventory/inventory.query';
import { GetInventoryMaterialsReqDto } from './dto/get-inventory-materials.req.dto';
import { InventoryMaterialResDto } from './dto/inventory-material.res.dto';

/** Tồn kho vật tư — nhánh RM tách khỏi `InventoryService.getInventory` cũ
 * (`docs/domains/inventory.md`). FG sống ở `inventory-products`, không nhánh nào đọc chéo sang
 * nhánh kia. Chưa có sổ cái/thẻ kho riêng cho RM — đợt sau. */
@Injectable()
export class InventoryMaterialsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Liệt kê mọi vật tư ACTIVE, kể cả chưa từng phát sinh kho — cùng lý do
   * `InventoryService.getInventory` cũ: filter `status` là giá trị tính nên toàn bộ join + tính
   * toán phải nằm trong một `.select()` duy nhất. */
  async getInventoryMaterials(
    reqDto: GetInventoryMaterialsReqDto,
  ): Promise<OffsetPaginatedDto<InventoryMaterialResDto>> {
    const stock = balanceByItemSubquery(
      this.db,
      reqDto.asOfDate,
      reqDto.warehouseId,
    );
    const requisitionHeld = requisitionHeldQuantityByItemSubquery(
      this.db,
      reqDto.warehouseId,
    );
    const bomRemaining = remainingBomDemandByItemSubquery(this.db);
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const onHandSql = () => sql<number>`coalesce(${stock.onHand}, 0)`;
    const reservedSql = () =>
      sql<number>`coalesce(${requisitionHeld.heldQuantity}, 0)`;
    const heldForJobsSql = () =>
      sql<number>`coalesce(${requisitionHeld.heldForJobsQuantity}, 0)`;
    const bomDemandSql = () =>
      sql<number>`greatest(coalesce(${bomRemaining.remainingDemand}, 0) - (${heldForJobsSql()}), 0)`;
    const availableSql = () =>
      sql<number>`(${onHandSql()}) - (${reservedSql()}) - (${bomDemandSql()})`;

    const where = and(
      isNull(items.deletedAt),
      eq(items.status, ItemStatus.ACTIVE),
      eq(items.type, ItemType.RM),
      keyword
        ? or(
            unaccentILike(items.code, keyword),
            unaccentILike(items.name, keyword),
          )
        : undefined,
      reqDto.supplierId ? eq(items.supplierId, reqDto.supplierId) : undefined,
      reqDto.status
        ? stockStatusCondition(availableSql, reqDto.status)
        : undefined,
    );

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          id: items.id,
          code: items.code,
          name: items.name,
          unit: getTableColumns(units),
          supplier: getTableColumns(suppliers),
          image: getTableColumns(files),
          minStock: items.minStock,
          onHand: onHandSql().mapWith(Number).as('on_hand'),
          reserved: reservedSql().mapWith(Number).as('reserved'),
          bomDemand: bomDemandSql().mapWith(Number).as('bom_demand'),
          available: availableSql().mapWith(Number).as('available'),
        })
        .from(items)
        .innerJoin(units, eq(units.id, items.unitId))
        .leftJoin(suppliers, eq(suppliers.id, items.supplierId))
        .leftJoin(files, eq(files.id, items.imageFileId))
        .leftJoin(stock, eq(stock.itemId, items.id))
        .leftJoin(requisitionHeld, eq(requisitionHeld.itemId, items.id))
        .leftJoin(bomRemaining, eq(bomRemaining.itemId, items.id))
        .where(where)
        .orderBy(asc(items.code))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(items)
        .leftJoin(stock, eq(stock.itemId, items.id))
        .leftJoin(requisitionHeld, eq(requisitionHeld.itemId, items.id))
        .leftJoin(bomRemaining, eq(bomRemaining.itemId, items.id))
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(InventoryMaterialResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }
}
