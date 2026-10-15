import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  eq,
  getTableColumns,
  inArray,
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
  inventoryBalances,
  inventoryRequisitionItems,
  items,
  ItemType,
  productionJobIssues,
  units,
} from '../../database/schemas';
import { availableQuantityByItemSubquery } from '../inventory/available-quantity.query';
import { jobIssueDemandSubquery } from '../inventory/item-stock.query';
import { GetRequisitionLinesReqDto } from './dto/get-requisition-lines.req.dto';
import { RequisitionLineResDto } from './dto/requisition-line.res.dto';
import {
  issuedQuantityByJobItemSubquery,
  requisitionStockColumns,
  reservedQuantitySubquery,
} from './inventory-requisitions.query';

/** Phần đọc thuần của phiếu lãnh, tách khỏi `InventoryRequisitionsService` vì cùng một bộ join tính
 * "6 số" (SL BOM/Đã lãnh/Tồn/Đã giữ/Có thể lãnh/Khả dụng). Không method nào ghi.
 * See `docs/CODEMAPS/inventory.md`. */
@Injectable()
export class InventoryRequisitionLinesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Tab "Chi tiết vật tư lãnh" của phiếu đã lưu, cùng khuôn `PurchaseRequestsService`
   * (`.select()` thủ công vì mọi cột số đều là cột tính). `bomQuantity`/`issuedQuantity` là `null`
   * khi phiếu không gắn Job (`type = OTHER`). */
  async getRequisitionLines(
    requisitionId: string,
    scope: { productionJobId: string | null },
  ) {
    const demand = jobIssueDemandSubquery(this.db, {
      productionJobId: scope.productionJobId,
    });
    const issued = issuedQuantityByJobItemSubquery(this.db);
    const reserved = reservedQuantitySubquery(this.db);
    // "Khả dụng" cùng nguồn màn Tồn kho vật tư; khác "Có thể lãnh" (`issuableQuantity`, tồn − đã
    // giữ) là số dùng để chặn thao tác.
    const available = availableQuantityByItemSubquery(this.db);

    const rows = await this.db
      .select({
        id: inventoryRequisitionItems.id,
        quantity: inventoryRequisitionItems.quantity,
        note: inventoryRequisitionItems.note,
        item: getTableColumns(items),
        unit: getTableColumns(units),
        imageFile: getTableColumns(files),
        bomQuantity: demand.bomDemand,
        issuedQuantity: issued.issuedQuantity,
        ...requisitionStockColumns(reserved),
        availableQuantity: available.availableQuantity,
      })
      .from(inventoryRequisitionItems)
      .innerJoin(items, eq(items.id, inventoryRequisitionItems.itemId))
      .innerJoin(units, eq(units.id, items.unitId))
      .leftJoin(files, eq(files.id, items.imageFileId))
      .leftJoin(demand, eq(demand.itemId, items.id))
      .leftJoin(
        issued,
        scope.productionJobId
          ? and(
              eq(issued.productionJobId, scope.productionJobId),
              eq(issued.itemId, items.id),
            )
          : sql`false`,
      )
      .leftJoin(inventoryBalances, eq(inventoryBalances.itemId, items.id))
      .leftJoin(reserved, eq(reserved.itemId, items.id))
      .innerJoin(available, eq(available.itemId, items.id))
      .where(eq(inventoryRequisitionItems.requisitionId, requisitionId))
      .orderBy(
        asc(inventoryRequisitionItems.sortOrder),
        asc(inventoryRequisitionItems.createdAt),
      );

    return rows;
  }

  /** Popup chọn vật tư, dùng chung cho "Lãnh từ LSX" và "Lãnh thủ công".
   *
   * Rules:
   * - Có `productionJobId`: chỉ trả vật tư thuộc `production_job_issues` của Job đó (cùng ràng buộc
   *   `E230` ở `InventoryRequisitionsService.validateRequisitionLines`; dùng `inArray` để `q` vẫn
   *   lọc được ở cả hai nhánh).
   * - Không Job: mọi vật tư DIRECT chưa xoá; `bomQuantity`/`issuedQuantity`/`suggestedQuantity`
   *   luôn `null`. */
  async getRequisitionPickerLines(
    reqDto: GetRequisitionLinesReqDto,
  ): Promise<OffsetPaginatedDto<RequisitionLineResDto>> {
    const issued = issuedQuantityByJobItemSubquery(this.db);
    const reserved = reservedQuantitySubquery(this.db);
    // "Khả dụng" cùng nguồn màn Tồn kho vật tư; khác "Có thể lãnh" (`issuableQuantity`, tồn − đã
    // giữ) là số dùng để chặn thao tác.
    const available = availableQuantityByItemSubquery(this.db);
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const { productionJobId } = reqDto;

    const where = and(
      eq(items.type, ItemType.DIRECT),
      isNull(items.deletedAt),
      keyword
        ? or(
            unaccentILike(items.code, keyword),
            unaccentILike(items.name, keyword),
          )
        : undefined,
      productionJobId
        ? inArray(
            items.id,
            this.db
              .select({ itemId: productionJobIssues.itemId })
              .from(productionJobIssues)
              .where(eq(productionJobIssues.productionJobId, productionJobId)),
          )
        : undefined,
    );

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          item: getTableColumns(items),
          unit: getTableColumns(units),
          imageFile: getTableColumns(files),
          bomQuantity: productionJobIssues.requiredQty,
          issuedQuantity: issued.issuedQuantity,
          ...requisitionStockColumns(reserved),
          availableQuantity: available.availableQuantity,
        })
        .from(items)
        .innerJoin(units, eq(units.id, items.unitId))
        .leftJoin(files, eq(files.id, items.imageFileId))
        .leftJoin(
          productionJobIssues,
          productionJobId
            ? and(
                eq(productionJobIssues.productionJobId, productionJobId),
                eq(productionJobIssues.itemId, items.id),
              )
            : sql`false`,
        )
        .leftJoin(
          issued,
          productionJobId
            ? and(
                eq(issued.productionJobId, productionJobId),
                eq(issued.itemId, items.id),
              )
            : sql`false`,
        )
        .leftJoin(inventoryBalances, eq(inventoryBalances.itemId, items.id))
        .leftJoin(reserved, eq(reserved.itemId, items.id))
        .innerJoin(available, eq(available.itemId, items.id))
        .where(where)
        .orderBy(asc(items.code))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db.select({ total: count() }).from(items).where(where),
    ]);

    const lines = rows.map((row) => {
      // `bomQuantity` null khi và chỉ khi không có `productionJobId`: có Job thì `where` đã giới hạn
      // vật tư thuộc BOM và join khớp đúng `(productionJobId, itemId)`.
      if (row.bomQuantity === null) {
        return {
          ...row,
          bomQuantity: null,
          issuedQuantity: null,
          suggestedQuantity: null,
          remainingBom: null,
          isFullyIssued: false,
        };
      }

      const issuedQuantity = row.issuedQuantity ?? 0;
      const remainingBom = Math.max(row.bomQuantity - issuedQuantity, 0);

      return {
        ...row,
        issuedQuantity,
        suggestedQuantity: Math.max(
          0,
          Math.min(remainingBom, row.issuableQuantity),
        ),
        remainingBom,
        isFullyIssued: issuedQuantity >= row.bomQuantity,
      };
    });

    return new OffsetPaginatedDto(
      plainToInstance(RequisitionLineResDto, lines, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }
}
