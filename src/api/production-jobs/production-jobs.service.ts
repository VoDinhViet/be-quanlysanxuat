import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, count, desc, eq, getTableColumns, gte, lte, or } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  clients,
  credentials,
  files,
  orders,
  productionJobs,
  productionOrders,
  products,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { GetProductionJobsReqDto } from './dto/get-production-jobs.req.dto';
import { ProductionJobResDto } from './dto/production-job.res.dto';

/**
 * Job sản xuất — 1 sản phẩm (FG) = 1 Job trong một LSX (`production_jobs`), "Quản lý sản xuất" —
 * đơn vị công việc thực tế của xưởng, tách module riêng khỏi `production-orders` (LSX/header) vì
 * là một khái niệm/vòng đời khác.
 *
 * Rules:
 * - `createJobs` là đường ghi duy nhất, chỉ gọi được từ transaction duyệt LSX của
 *   `ProductionOrdersService.approveProductionOrder` — module này không có route ghi riêng ở
 *   `/production-jobs*`, Job chỉ được tạo gián tiếp qua duyệt LSX.
 * - Bước phát hành cũ (`issueJobs`, gọi từ `issueProductionOrders`) đã bỏ 2026-07-30; `createJobs`
 *   sống lại cùng ngày, gắn vào bước duyệt (`approveProductionOrder`) thay vì phát hành — xem
 *   `docs/features/production.md`.
 */
@Injectable()
export class ProductionJobsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getProductionJobs(
    reqDto: GetProductionJobsReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      reqDto.orderId ? eq(orders.id, reqDto.orderId) : undefined,
      reqDto.productId ? eq(productionJobs.productId, reqDto.productId) : undefined,
      reqDto.clientId ? eq(orders.clientId, reqDto.clientId) : undefined,
      reqDto.fromDate ? gte(orders.dueDate, reqDto.fromDate) : undefined,
      reqDto.toDate ? lte(orders.dueDate, reqDto.toDate) : undefined,
      keyword
        ? or(
            unaccentILike(productionJobs.code, keyword),
            unaccentILike(productionOrders.code, keyword),
            unaccentILike(orders.code, keyword),
            unaccentILike(products.code, keyword),
            unaccentILike(products.name, keyword),
          )
        : undefined,
    );

    const [rows, countRows] = await Promise.all([
      this.baseJobSelect()
        .where(where)
        .orderBy(asc(orders.dueDate), desc(productionOrders.approvedAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(productionJobs)
        .innerJoin(productionOrders, eq(productionOrders.id, productionJobs.productionOrderId))
        .innerJoin(orders, eq(orders.id, productionOrders.orderId))
        .innerJoin(products, eq(products.id, productionJobs.productId))
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ProductionJobResDto, rows, { excludeExtraneousValues: true }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getProductionJobDetail(jobId: string): Promise<ProductionJobResDto> {
    const [row] = await this.baseJobSelect().where(eq(productionJobs.id, jobId)).limit(1);

    if (!row) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(ProductionJobResDto, row, { excludeExtraneousValues: true });
  }

  /**
   * Sinh Job cho một LSX vừa duyệt — 1 Job/sản phẩm (SL > 0), gộp mọi dòng
   * `production_order_items` cùng `productId` trong LSX đó, mã `JOBxxxx`. Bắt buộc truyền `tx` vì
   * chỉ được gọi từ bên trong transaction duyệt của `ProductionOrdersService.approveProductionOrder`
   * (`.claude/rules/api-module.md`). Bỏ qua không tạo gì nếu không có sản phẩm nào SL > 0.
   */
  async createJobs(
    tx: DbTransaction,
    productionOrderId: string,
    quantityByProduct: Map<string, number>,
  ): Promise<void> {
    if (!quantityByProduct.size) {
      return;
    }

    const productIds = [...quantityByProduct.keys()];
    const codes = await this.generateJobCodes(tx, productIds.length);
    await tx.insert(productionJobs).values(
      productIds.map((productId, index) => ({
        code: codes[index],
        productionOrderId,
        productId,
        quantity: quantityByProduct.get(productId)!,
      })),
    );
  }

  private baseJobSelect() {
    return this.db
      .select({
        id: productionJobs.id,
        code: productionJobs.code,
        productionOrderCode: productionOrders.code,
        orderId: orders.id,
        orderCode: orders.code,
        dueDate: orders.dueDate,
        client: getTableColumns(clients),
        productId: products.id,
        productCode: products.code,
        productName: products.name,
        unit: getTableColumns(units),
        imageFile: getTableColumns(files),
        quantity: productionJobs.quantity,
        approver: getTableColumns(credentials),
        approvedAt: productionOrders.approvedAt,
      })
      .from(productionJobs)
      .innerJoin(productionOrders, eq(productionOrders.id, productionJobs.productionOrderId))
      .innerJoin(orders, eq(orders.id, productionOrders.orderId))
      .leftJoin(clients, eq(clients.id, orders.clientId))
      .innerJoin(products, eq(products.id, productionJobs.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(files, eq(files.id, products.imageFileId))
      .leftJoin(credentials, eq(credentials.id, productionOrders.approvedBy));
  }

  /** Khuôn `ProductionOrdersService.generateProductionOrderCode` — đếm toàn bảng `production_jobs`
   * (không lọc theo LSX) để cấp một dải mã liên tiếp cho cả lượt gọi, vẫn TOCTOU như mọi generator
   * khác trong repo, unique constraint trên `code` là chốt chặn thật. */
  private async generateJobCodes(tx: DbTransaction, howMany: number): Promise<string[]> {
    const [totalRows] = await tx.select({ total: count() }).from(productionJobs);
    const start = (totalRows?.total ?? 0) + 1;
    return Array.from(
      { length: howMany },
      (_, index) => `JOB${String(start + index).padStart(4, '0')}`,
    );
  }
}
