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
  inventoryBalances,
  inventoryRequisitionItems,
  items,
  ItemType,
  productionJobIssues,
  units,
} from '../../database/schemas';
import { jobIssueDemandSubquery } from '../inventory/item-stock.query';
import { GetRequisitionLinesReqDto } from './dto/get-requisition-lines.req.dto';
import { RequisitionLineResDto } from './dto/requisition-line.res.dto';
import {
  issuedQuantityByJobItemSubquery,
  remainingBomDemandByItemSubquery,
  requisitionStockColumns,
  reservedQuantitySubquery,
} from './inventory-requisitions.query';

/** Tách khỏi `InventoryRequisitionsService` — hai method ở đây đều là đọc thuần, cùng một bộ join
 * tính "6 số" (SL BOM/Đã lãnh/Tồn/Đã giữ/Có thể lãnh/Khả dụng), phục vụ tab chi tiết + popup chọn
 * vật tư (dùng chung "Lãnh từ LSX"/"Lãnh thủ công" — `productionJobId` optional, không phải hai
 * nguồn dữ liệu khác nhau). Không có method nào ghi. Xem `docs/domains/inventory.md`, mục "Phiếu
 * lãnh vật tư". */
@Injectable()
export class InventoryRequisitionLinesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Tab "Chi tiết vật tư lãnh" của một phiếu đã lưu — cùng khuôn `getPurchaseRequestLines`
   * (`.select()` thủ công vì `inventory_requisition_items` không có cột để `orderBy` qua relational
   * API, và mọi cột số đều là cột tính). `bomQuantity`/`issuedQuantity` là `null` khi phiếu không
   * gắn Job (`type = OTHER`) — hai subquery tự trả rỗng khi không có `productionJobId` để join. */
  async getRequisitionLines(
    requisitionId: string,
    scope: { productionJobId: string | null },
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
      .leftJoin(inventoryBalances, eq(inventoryBalances.itemId, items.id))
      .leftJoin(reserved, eq(reserved.itemId, items.id))
      .leftJoin(remainingDemand, eq(remainingDemand.itemId, items.id))
      .where(eq(inventoryRequisitionItems.requisitionId, requisitionId))
      .orderBy(
        asc(inventoryRequisitionItems.sortOrder),
        asc(inventoryRequisitionItems.createdAt),
      );

    return rows;
  }

  /** Popup chọn vật tư dùng chung "Lãnh từ LSX"/"Lãnh thủ công" — `productionJobId` optional quyết
   * định có khoanh vùng theo định mức BOM hay không, không phải hai nguồn dữ liệu khác nhau. Có
   * Job: chỉ trả vật tư nằm trong `production_job_issues` của Job đó (ràng buộc y hệt `E230` phía
   * `InventoryRequisitionsService.validateRequisitionLines`, biểu diễn bằng `inArray` thay vì
   * driving table riêng để `q` vẫn lọc được ở cả hai nhánh). Không Job: mọi RM chưa xoá tại kho —
   * `bomQuantity`/`issuedQuantity`/`suggestedQuantity` luôn `null`. */
  async getRequisitionPickerLines(
    reqDto: GetRequisitionLinesReqDto,
  ): Promise<OffsetPaginatedDto<RequisitionLineResDto>> {
    const issued = issuedQuantityByJobItemSubquery(this.db);
    const reserved = reservedQuantitySubquery(this.db);
    const remainingDemand = remainingBomDemandByItemSubquery(this.db);
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const { productionJobId } = reqDto;

    const where = and(
      eq(items.type, ItemType.RM),
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

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          item: getTableColumns(items),
          unit: getTableColumns(units),
          bomQuantity: productionJobIssues.requiredQty,
          issuedQuantity: issued.issuedQuantity,
          ...requisitionStockColumns(reserved, remainingDemand),
        })
        .from(items)
        .innerJoin(units, eq(units.id, items.unitId))
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
        .leftJoin(remainingDemand, eq(remainingDemand.itemId, items.id))
        .where(where)
        .orderBy(asc(items.code))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db.select({ total: count() }).from(items).where(where),
    ]);

    const lines = rows.map((row) => {
      // `where` đã giới hạn chỉ item nằm trong BOM của Job khi có `productionJobId`, và join phía
      // trên khớp đúng (productionJobId, itemId) đó — nên `bomQuantity` (từ LEFT JOIN
      // `productionJobIssues`) null khi và chỉ khi không có `productionJobId`, không cần kiểm
      // riêng cả hai.
      if (row.bomQuantity === null) {
        return {
          ...row,
          bomQuantity: null,
          issuedQuantity: null,
          suggestedQuantity: null,
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
      };
    });

    return new OffsetPaginatedDto(
      plainToInstance(RequisitionLineResDto, lines, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }
}
