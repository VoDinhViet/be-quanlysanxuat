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
  inArray,
  lte,
  or,
  sql,
} from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  BomItemType,
  bomItems,
  boms,
  clients,
  files,
  materials,
  orders,
  productionJobMaterials,
  productionJobs,
  ProductionJobStatus,
  productionJobSteps,
  productionOrders,
  products,
  routingSteps,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { GetProductionJobMaterialsReqDto } from './dto/get-production-job-materials.req.dto';
import { GetProductionJobsReqDto } from './dto/get-production-jobs.req.dto';
import { ProductionJobDetailResDto } from './dto/production-job-detail.res.dto';
import { ProductionJobMaterialResDto } from './dto/production-job-material.res.dto';
import { ProductionJobResDto } from './dto/production-job.res.dto';
import { ProductionJobStepResDto } from './dto/production-job-step.res.dto';

/** Job sản xuất — 1 sản phẩm (FG) = 1 Job trong một LSX. Chỉ tạo được qua `createJobs`, gọi từ
 * transaction duyệt LSX (`ProductionOrdersService.approveProductionOrder`) — không có route tạo
 * Job riêng. Sau khi tạo chỉ còn một hành động: `start`. Vòng đời, business rule:
 * `docs/domains/production.md`, `docs/workflows/production-job-execution.md`. */
@Injectable()
export class ProductionJobsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Tự dựng `.select()` riêng, tách khỏi `getProductionJob` — chỉ lấy đúng cột bảng cần. */
  async getProductionJobs(
    reqDto: GetProductionJobsReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      reqDto.orderId ? eq(orders.id, reqDto.orderId) : undefined,
      reqDto.productId
        ? eq(productionJobs.productId, reqDto.productId)
        : undefined,
      reqDto.status ? eq(productionJobs.status, reqDto.status) : undefined,
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
      this.db
        .select({
          id: productionJobs.id,
          code: productionJobs.code,
          orderCode: orders.code,
          client: getTableColumns(clients),
          imageFile: getTableColumns(files),
          quantity: productionJobs.quantity,
          orderDate: orders.orderDate,
          dueDate: orders.dueDate,
          status: productionJobs.status,
        })
        .from(productionJobs)
        .innerJoin(
          productionOrders,
          eq(productionOrders.id, productionJobs.productionOrderId),
        )
        .innerJoin(orders, eq(orders.id, productionOrders.orderId))
        .leftJoin(clients, eq(clients.id, orders.clientId))
        .innerJoin(products, eq(products.id, productionJobs.productId))
        .leftJoin(files, eq(files.id, products.imageFileId))
        .where(where)
        .orderBy(asc(orders.dueDate), desc(productionOrders.approvedAt))
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
      plainToInstance(ProductionJobResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Không join — thông tin PO/khách hàng/sản phẩm FE lấy từ dòng tương ứng ở `getProductionJobs`
   * (list). */
  async getProductionJob(jobId: string): Promise<ProductionJobDetailResDto> {
    const job = await this.db.query.productionJobs.findFirst({
      where: eq(productionJobs.id, jobId),
    });

    if (!job) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(ProductionJobDetailResDto, job, {
      excludeExtraneousValues: true,
    });
  }

  /** `GET /production-jobs/:jobId/steps` — snapshot công đoạn đã đóng băng lúc duyệt LSX, không
   * route nào sửa. Sắp theo `sortOrder` rồi `createdAt`, khuôn `RoutingService.getRouting`. */
  async getProductionJobSteps(
    jobId: string,
  ): Promise<ProductionJobStepResDto[]> {
    await this.ensureJobExists(jobId);

    const steps = await this.db.query.productionJobSteps.findMany({
      where: eq(productionJobSteps.productionJobId, jobId),
      with: { operation: true },
      orderBy: [
        asc(productionJobSteps.sortOrder),
        asc(productionJobSteps.createdAt),
      ],
    });

    return steps.map((step) =>
      plainToInstance(ProductionJobStepResDto, step, {
        excludeExtraneousValues: true,
      }),
    );
  }

  /** Read-only, danh sách vật tư khởi tạo từ BOM lúc duyệt. `.select()` join thủ công vì `q` lọc
   * trên `materials.code`/`name` (bảng join), relational query không biểu diễn được. */
  async getProductionJobMaterials(
    jobId: string,
    reqDto: GetProductionJobMaterialsReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobMaterialResDto>> {
    await this.ensureJobExists(jobId);

    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      eq(productionJobMaterials.productionJobId, jobId),
      keyword
        ? or(
            unaccentILike(materials.code, keyword),
            unaccentILike(materials.name, keyword),
          )
        : undefined,
    );

    const [rows, countRows] = await Promise.all([
      this.jobMaterialSelect()
        .where(where)
        .orderBy(asc(materials.code))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(productionJobMaterials)
        .innerJoin(
          materials,
          eq(productionJobMaterials.materialId, materials.id),
        )
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ProductionJobMaterialResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Sinh Job cho một LSX vừa duyệt — 1 Job/sản phẩm (SL > 0), gộp mọi dòng
   * `production_order_items` cùng `productId`. Bắt buộc truyền `tx` — chỉ gọi được từ transaction
   * duyệt của `ProductionOrdersService.approveProductionOrder`. Đồng thời copy snapshot công đoạn
   * (`copyRoutingSteps`) và vật tư (`copyBomMaterials`) từ Product Structure, đúng một lần. */
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
    const jobRows = await tx
      .insert(productionJobs)
      .values(
        productIds.map((productId, index) => ({
          code: codes[index],
          productionOrderId,
          productId,
          quantity: quantityByProduct.get(productId)!,
        })),
      )
      .returning({
        id: productionJobs.id,
        productId: productionJobs.productId,
      });

    const jobIdByProductId = new Map(
      jobRows.map((job) => [job.productId, job.id]),
    );
    await this.copyRoutingSteps(tx, productIds, jobIdByProductId);
    await this.copyBomMaterials(
      tx,
      productIds,
      jobIdByProductId,
      quantityByProduct,
    );
  }

  /**
   * Copy routing **Cấp 0** của từng sản phẩm (`routing_steps.productId`) sang
   * `production_job_steps`, đóng băng lúc duyệt LSX. Không lọc `operations.deletedAt` — một công
   * đoạn đã nghỉ nhưng routing còn tham chiếu vẫn là bước thật của sản phẩm, cùng hành vi
   * `RoutingService.getRouting`.
   */
  private async copyRoutingSteps(
    tx: DbTransaction,
    productIds: string[],
    jobIdByProductId: Map<string, string>,
  ): Promise<void> {
    const steps = await tx.query.routingSteps.findMany({
      where: inArray(routingSteps.productId, productIds),
      orderBy: [asc(routingSteps.sortOrder), asc(routingSteps.createdAt)],
    });

    if (!steps.length) {
      return;
    }

    await tx.insert(productionJobSteps).values(
      steps.map((step) => ({
        productionJobId: jobIdByProductId.get(step.productId!)!,
        operationId: step.operationId,
        sortOrder: step.sortOrder,
        note: step.note,
      })),
    );
  }

  /**
   * Gộp BOM theo vật tư cho từng sản phẩm — cùng phép `SUM` thô của `BomsService.getBomMaterials`
   * (KHÔNG nổ theo cấp qua node WIP cha, xem `docs/domains/product-structure.md`) — rồi nhân với
   * SL Job thành `requiredQty`, ghi vào `production_job_materials`. `unitQty` giữ nguyên định mức
   * gốc — chưa có route sửa nào dùng tới, để sẵn cho lúc mở rộng CRUD sau này.
   */
  private async copyBomMaterials(
    tx: DbTransaction,
    productIds: string[],
    jobIdByProductId: Map<string, string>,
    quantityByProduct: Map<string, number>,
  ): Promise<void> {
    const rows = await tx
      .select({
        productId: boms.productId,
        materialId: bomItems.materialId,
        unitQty: sql<number>`sum(${bomItems.quantity})`.mapWith(Number),
      })
      .from(bomItems)
      .innerJoin(boms, eq(bomItems.bomId, boms.id))
      .where(
        and(
          eq(bomItems.itemType, BomItemType.MATERIAL),
          inArray(boms.productId, productIds),
        ),
      )
      .groupBy(boms.productId, bomItems.materialId);

    if (!rows.length) {
      return;
    }

    await tx.insert(productionJobMaterials).values(
      rows.map((row) => ({
        productionJobId: jobIdByProductId.get(row.productId)!,
        materialId: row.materialId!,
        unitQty: row.unitQty,
        requiredQty: row.unitQty * quantityByProduct.get(row.productId)!,
      })),
    );
  }

  /** `PENDING` → `IN_PROGRESS` (`E087` nếu không). Ghi `startedBy`/`startedAt`. */
  async startJob(
    jobId: string,
    userId: string,
  ): Promise<ProductionJobDetailResDto> {
    const job = await this.ensureJobExists(jobId);
    this.ensureStatus(job.status, [ProductionJobStatus.PENDING]);

    await this.db
      .update(productionJobs)
      .set({
        status: ProductionJobStatus.IN_PROGRESS,
        startedBy: userId,
        startedAt: new Date(),
      })
      .where(eq(productionJobs.id, jobId));

    return this.getProductionJob(jobId);
  }

  private jobMaterialSelect() {
    return this.db
      .select({
        materialId: materials.id,
        code: materials.code,
        name: materials.name,
        unit: getTableColumns(units),
        image: getTableColumns(files),
        unitQty: productionJobMaterials.unitQty,
        requiredQty: productionJobMaterials.requiredQty,
      })
      .from(productionJobMaterials)
      .innerJoin(materials, eq(productionJobMaterials.materialId, materials.id))
      .innerJoin(units, eq(materials.unitId, units.id))
      .leftJoin(files, eq(materials.imageFileId, files.id));
  }

  /** Job không tồn tại → `E082`. */
  private async ensureJobExists(jobId: string): Promise<{
    id: string;
    status: ProductionJobStatus;
    quantity: number;
  }> {
    const job = await this.db.query.productionJobs.findFirst({
      columns: {
        id: true,
        status: true,
        quantity: true,
      },
      where: eq(productionJobs.id, jobId),
    });

    if (!job) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }

    return job;
  }

  private ensureStatus(
    current: ProductionJobStatus,
    allowed: ProductionJobStatus[],
  ): void {
    if (!allowed.includes(current)) {
      throw new AppException(ErrorCode.E087, HttpStatus.CONFLICT);
    }
  }

  /** Khuôn `ProductionOrdersService.generateProductionOrderCode` — cùng giới hạn TOCTOU, unique
   * constraint trên `code` là chốt chặn thật. */
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
