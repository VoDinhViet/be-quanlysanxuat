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
  inventoryBalances,
  inventoryRequisitionItems,
  items,
  ItemType,
  productionJobIssues,
  units,
} from '../../database/schemas';
import { jobIssueDemandSubquery } from '../inventory/item-stock.query';
import { GetIssuableItemsReqDto } from './dto/get-issuable-items.req.dto';
import { GetJobBomLinesReqDto } from './dto/get-job-bom-lines.req.dto';
import { RequisitionLineResDto } from './dto/requisition-line.res.dto';
import {
  issuedQuantityByJobItemSubquery,
  remainingBomDemandByItemSubquery,
  requisitionStockColumns,
  reservedQuantitySubquery,
} from './inventory-requisitions.query';

/** Tách khỏi `InventoryRequisitionsService` — ba method ở đây đều là đọc thuần, cùng một bộ join
 * tính "6 số" (SL BOM/Đã lãnh/Tồn/Đã giữ/Có thể lãnh/Khả dụng), phục vụ tab chi tiết + hai popup
 * chọn vật tư. Không có method nào ghi. Xem `docs/domains/inventory.md`, mục "Phiếu lãnh vật tư". */
@Injectable()
export class InventoryRequisitionLinesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Tab "Chi tiết vật tư lãnh" của một phiếu đã lưu — cùng khuôn `getPurchaseRequestLines`
   * (`.select()` thủ công vì `inventory_requisition_items` không có cột để `orderBy` qua relational
   * API, và mọi cột số đều là cột tính). `bomQuantity`/`issuedQuantity` là `null` khi phiếu không
   * gắn Job (`type = OTHER`) — hai subquery tự trả rỗng khi không có `productionJobId` để join. */
  async getRequisitionLines(
    requisitionId: string,
    scope: { warehouseId: string; productionJobId: string | null },
  ) {
    const demand = jobIssueDemandSubquery(this.db, {
      productionJobId: scope.productionJobId,
    });
    const issued = issuedQuantityByJobItemSubquery(this.db);
    const reserved = reservedQuantitySubquery(this.db);
    const remainingDemand = remainingBomDemandByItemSubquery(this.db);

    const rows = await this.db
      .select({
        id: inventoryRequisitionItems.id,
        quantity: inventoryRequisitionItems.quantity,
        note: inventoryRequisitionItems.note,
        item: getTableColumns(items),
        unit: getTableColumns(units),
        bomQuantity: demand.bomDemand,
        issuedQuantity: issued.issuedQuantity,
        ...requisitionStockColumns(reserved, remainingDemand),
      })
      .from(inventoryRequisitionItems)
      .innerJoin(items, eq(items.id, inventoryRequisitionItems.itemId))
      .innerJoin(units, eq(units.id, items.unitId))
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
      .leftJoin(
        inventoryBalances,
        and(
          eq(inventoryBalances.warehouseId, scope.warehouseId),
          eq(inventoryBalances.itemId, items.id),
        ),
      )
      .leftJoin(
        reserved,
        and(
          eq(reserved.warehouseId, scope.warehouseId),
          eq(reserved.itemId, items.id),
        ),
      )
      .leftJoin(remainingDemand, eq(remainingDemand.itemId, items.id))
      .where(eq(inventoryRequisitionItems.requisitionId, requisitionId))
      .orderBy(
        asc(inventoryRequisitionItems.sortOrder),
        asc(inventoryRequisitionItems.createdAt),
      );

    return rows;
  }

  /** Popup **"+ Lãnh từ LSX"** — mọi vật tư nằm trong định mức BOM của Job, kèm 6 số + gợi ý SL. */
  async getJobBomLines(
    reqDto: GetJobBomLinesReqDto,
  ): Promise<OffsetPaginatedDto<RequisitionLineResDto>> {
    const issued = issuedQuantityByJobItemSubquery(this.db);
    const reserved = reservedQuantitySubquery(this.db);
    const remainingDemand = remainingBomDemandByItemSubquery(this.db);

    const where = and(
      eq(productionJobIssues.productionJobId, reqDto.productionJobId),
      isNull(items.deletedAt),
    );

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          item: getTableColumns(items),
          unit: getTableColumns(units),
          bomQuantity: productionJobIssues.requiredQty,
          issuedQuantity:
            sql<number>`coalesce(${issued.issuedQuantity}, 0)`.mapWith(Number),
          ...requisitionStockColumns(reserved, remainingDemand),
        })
        .from(productionJobIssues)
        .innerJoin(items, eq(items.id, productionJobIssues.itemId))
        .innerJoin(units, eq(units.id, items.unitId))
        .leftJoin(
          issued,
          and(
            eq(issued.productionJobId, reqDto.productionJobId),
            eq(issued.itemId, items.id),
          ),
        )
        .leftJoin(
          inventoryBalances,
          and(
            eq(inventoryBalances.warehouseId, reqDto.warehouseId),
            eq(inventoryBalances.itemId, items.id),
          ),
        )
        .leftJoin(
          reserved,
          and(
            eq(reserved.warehouseId, reqDto.warehouseId),
            eq(reserved.itemId, items.id),
          ),
        )
        .leftJoin(remainingDemand, eq(remainingDemand.itemId, items.id))
        .where(where)
        .orderBy(asc(items.code))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(productionJobIssues)
        .innerJoin(items, eq(items.id, productionJobIssues.itemId))
        .where(where),
    ]);

    const lines = rows.map((row) => {
      const remainingBom = Math.max(row.bomQuantity - row.issuedQuantity, 0);

      return {
        ...row,
        suggestedQuantity: Math.max(
          0,
          Math.min(remainingBom, row.issuableQuantity),
        ),
      };
    });

    return new OffsetPaginatedDto(
      plainToInstance(RequisitionLineResDto, lines, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Popup **"+ Lãnh khác"** — mọi RM chưa xoá, số tồn tính theo kho đang chọn, `q` lọc mã/tên.
   * `bomQuantity`/`issuedQuantity`/`suggestedQuantity` luôn `null` — không có Job để tính. */
  async getIssuableItems(
    reqDto: GetIssuableItemsReqDto,
  ): Promise<OffsetPaginatedDto<RequisitionLineResDto>> {
    const reserved = reservedQuantitySubquery(this.db);
    const remainingDemand = remainingBomDemandByItemSubquery(this.db);
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const where = and(
      eq(items.type, ItemType.RM),
      isNull(items.deletedAt),
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
          item: getTableColumns(items),
          unit: getTableColumns(units),
          ...requisitionStockColumns(reserved, remainingDemand),
        })
        .from(items)
        .innerJoin(units, eq(units.id, items.unitId))
        .leftJoin(
          inventoryBalances,
          and(
            eq(inventoryBalances.warehouseId, reqDto.warehouseId),
            eq(inventoryBalances.itemId, items.id),
          ),
        )
        .leftJoin(
          reserved,
          and(
            eq(reserved.warehouseId, reqDto.warehouseId),
            eq(reserved.itemId, items.id),
          ),
        )
        .leftJoin(remainingDemand, eq(remainingDemand.itemId, items.id))
        .where(where)
        .orderBy(asc(items.code))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db.select({ total: count() }).from(items).where(where),
    ]);

    const lines = rows.map((row) => ({
      ...row,
      bomQuantity: null,
      issuedQuantity: null,
      suggestedQuantity: null,
    }));

    return new OffsetPaginatedDto(
      plainToInstance(RequisitionLineResDto, lines, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }
}
