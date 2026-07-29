import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  lte,
  or,
} from 'drizzle-orm';

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
 * Hình dạng dòng dữ liệu của `baseJobSelect()`, viết tường minh thay vì suy ra từ kiểu trả về của
 * query builder — `client`/`imageFile`/`issuer` là left-join nên khai nullable ở đây dù kiểu cột
 * của drizzle không phản ánh điều đó (cùng một điểm cần lưu ý như `UsersService.getCurrentUser`/
 * `RawBomItemRow` của `BomsService`): khi left-join không khớp, kết quả vẫn là một dòng toàn null,
 * không phải JS `null`, và `toJobDtoInput` chịu trách nhiệm gộp nó lại thành `null`.
 */
interface ProductionJobRow {
  id: string;
  code: string;
  // `production_orders.code` nullable ở kiểu cột (chỉ gán khi `ISSUED`) — nhưng một Job chỉ tồn
  // tại sau khi LSX cha đã `ISSUED`, nên trên thực tế luôn có giá trị (xem `toJobDtoInput`).
  productionOrderCode: string | null;
  orderId: string;
  orderCode: string;
  dueDate: Date | null;
  client: typeof clients.$inferSelect | null;
  productId: string;
  productCode: string;
  productName: string;
  unit: typeof units.$inferSelect;
  imageFile: typeof files.$inferSelect | null;
  quantity: number;
  issuer: typeof credentials.$inferSelect | null;
  issuedAt: Date | null;
}

/**
 * Job sản xuất — 1 sản phẩm (FG) = 1 Job trong một LSX (`production_jobs`), chỉ tồn tại sau khi
 * `ProductionOrdersService.issueProductionOrders` phát hành. Đây là "Quản lý sản xuất" — đơn vị
 * công việc thực tế của xưởng, tách module riêng khỏi `production-orders` (LSX/header) vì là một
 * khái niệm/vòng đời khác: Job không có thao tác ghi độc lập, chỉ được sinh qua `issueJobs` (gọi
 * từ transaction phát hành của `ProductionOrdersService`) — xem `docs/features/production.md`.
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
      reqDto.productId
        ? eq(productionJobs.productId, reqDto.productId)
        : undefined,
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
        .orderBy(asc(orders.dueDate), desc(productionOrders.issuedAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(productionJobs)
        .innerJoin(
          productionOrders,
          eq(productionOrders.id, productionJobs.productionOrderId),
        )
        .innerJoin(orders, eq(orders.id, productionOrders.orderId))
        .innerJoin(products, eq(products.id, productionJobs.productId))
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(
        ProductionJobResDto,
        rows.map((row) => this.toJobDtoInput(row)),
        { excludeExtraneousValues: true },
      ),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getProductionJobDetail(jobId: string): Promise<ProductionJobResDto> {
    const [row] = await this.baseJobSelect()
      .where(eq(productionJobs.id, jobId))
      .limit(1);

    if (!row) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(ProductionJobResDto, this.toJobDtoInput(row), {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Sinh Job cho lượt phát hành của một LSX — 1 Job/sản phẩm, mã `JOBxxxx`. Bắt buộc truyền `tx`
   * vì chỉ được gọi từ bên trong transaction phát hành của `ProductionOrdersService.issueProductionOrders`
   * (`.claude/rules/api-module.md`). Bỏ qua không tạo gì nếu không có sản phẩm nào SL > 0.
   */
  async issueJobs(
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
        issuer: getTableColumns(credentials),
        issuedAt: productionOrders.issuedAt,
      })
      .from(productionJobs)
      .innerJoin(
        productionOrders,
        eq(productionOrders.id, productionJobs.productionOrderId),
      )
      .innerJoin(orders, eq(orders.id, productionOrders.orderId))
      .leftJoin(clients, eq(clients.id, orders.clientId))
      .innerJoin(products, eq(products.id, productionJobs.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(files, eq(files.id, products.imageFileId))
      .leftJoin(credentials, eq(credentials.id, productionOrders.issuedBy));
  }

  /** Định hình lại một dòng join phẳng thành shape lồng nhau mà `ProductionJobResDto` cần, gộp
   * mọi left-join không khớp (`client`/`imageFile`/`issuer`) từ dòng toàn null về `null` — cùng
   * cách làm với `UsersService.getCurrentUser`. `issuedAt` luôn có giá trị trên thực tế (Job chỉ
   * được tạo trong lượt phát hành), `!` ở đây khẳng định bất biến đó thay vì nới kiểu DTO. */
  private toJobDtoInput(row: ProductionJobRow) {
    return {
      id: row.id,
      code: row.code,
      productionOrderCode: row.productionOrderCode!,
      orderId: row.orderId,
      orderCode: row.orderCode,
      client: row.client?.id ? row.client : null,
      product: {
        id: row.productId,
        code: row.productCode,
        name: row.productName,
        unit: row.unit,
        imageFile: row.imageFile?.id ? row.imageFile : null,
      },
      quantity: row.quantity,
      dueDate: row.dueDate,
      issuer: row.issuer?.id ? row.issuer : null,
      issuedAt: row.issuedAt!,
    };
  }

  private async generateJobCodes(
    tx: DbTransaction,
    howMany: number,
  ): Promise<string[]> {
    const [totalRows] = await tx
      .select({ total: count() })
      .from(productionJobs);
    const start = (totalRows?.total ?? 0) + 1;
    return Array.from(
      { length: howMany },
      (_, index) => `JOB${String(start + index).padStart(4, '0')}`,
    );
  }
}
