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
  isNull,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import {
  DocumentType,
  generateDocumentSequences,
} from '../../common/utils/document-sequence.util';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  bomItems,
  boms,
  clients,
  files,
  bomOperations,
  items,
  ItemType,
  orders,
  productionJobBomItems,
  productionJobIssues,
  productionJobItems,
  productionJobNotes,
  productionJobOperations,
  productionJobs,
  ProductionJobStatus,
  productionJobUnits,
  productionOrders,
  routingOperations,
  routings,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { issuedQuantityByJobItemSubquery } from '../inventory-requisitions/inventory-requisitions.query';
import { InventoryService } from '../inventory/inventory.service';
import { OqcService } from '../oqc/oqc.service';
import { PurchaseRequestsService } from '../purchase-requests/purchase-requests.service';
import { PurchaseRequestShortageItem } from '../purchase-requests/types/shortage-request.type';
import { UsersService } from '../users/users.service';
import { CreateProductionJobNoteReqDto } from './dto/create-production-job-note.req.dto';
import { GetProductionJobBomReqDto } from './dto/get-production-job-bom.req.dto';
import { GetProductionJobNotesReqDto } from './dto/get-production-job-notes.req.dto';
import { GetProductionJobsReqDto } from './dto/get-production-jobs.req.dto';
import { ProductionJobBomItemResDto } from './dto/production-job-bom-operation.res.dto';
import { ProductionJobDetailResDto } from './dto/production-job-detail.res.dto';
import { ProductionJobIssueResDto } from './dto/production-job-issue.res.dto';
import { ProductionJobNoteResDto } from './dto/production-job-note.res.dto';
import { ProductionJobOperationResDto } from './dto/production-job-operation.res.dto';
import { ProductionJobResDto } from './dto/production-job.res.dto';
import { UpdateProductionJobOperationReqDto } from './dto/update-production-job-operation.req.dto';

/** Khoá nội dung của một dòng snapshot (`copyBomIssues`/`resolveJobItemSnapshots`/
 * `resolveJobUnitSnapshots`) — `JSON.stringify` một tuple, tránh hẳn việc tự bịa dấu phân
 * cách: `code`/`name` là text tự do (có thể chứa bất kỳ ký tự nào), một delimiter tự chọn luôn
 * có rủi ro trùng lặp giả. */
function snapshotKey(id: string, code: string, name: string): string {
  return JSON.stringify([id, code, name]);
}

/** Job sản xuất — 1 sản phẩm (FG) = 1 Job trong một LSX. Chỉ tạo được qua `createJobs`, gọi từ
 * transaction duyệt LSX (`ProductionOrdersService.approveProductionOrder`) — không có route tạo
 * Job riêng. Sau khi tạo chỉ còn một hành động: `start`. Vòng đời, business rule:
 * `docs/domains/production.md`, `docs/workflows/production-job-execution.md`. */
@Injectable()
export class ProductionJobsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly inventoryService: InventoryService,
    private readonly oqcService: OqcService,
    private readonly purchaseRequestsService: PurchaseRequestsService,
    private readonly usersService: UsersService,
  ) {}

  /** `.select()` thủ công — `q` lọc trên `productionOrders`/`orders`/`items` (bảng join),
   * relational query API không biểu diễn được. */
  async getProductionJobs(
    reqDto: GetProductionJobsReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      reqDto.orderId ? eq(orders.id, reqDto.orderId) : undefined,
      reqDto.itemId ? eq(productionJobs.itemId, reqDto.itemId) : undefined,
      reqDto.status ? eq(productionJobs.status, reqDto.status) : undefined,
      reqDto.clientId ? eq(orders.clientId, reqDto.clientId) : undefined,
      reqDto.startDate ? gte(orders.dueDate, reqDto.startDate) : undefined,
      reqDto.endDate ? lte(orders.dueDate, reqDto.endDate) : undefined,
      keyword
        ? or(
            unaccentILike(productionJobs.code, keyword),
            unaccentILike(productionOrders.code, keyword),
            unaccentILike(orders.code, keyword),
            unaccentILike(items.code, keyword),
            unaccentILike(items.name, keyword),
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
        .innerJoin(items, eq(items.id, productionJobs.itemId))
        .leftJoin(files, eq(files.id, items.imageFileId))
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
        .innerJoin(items, eq(items.id, productionJobs.itemId))
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ProductionJobResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getProductionJob(jobId: string): Promise<ProductionJobDetailResDto> {
    const [job] = await this.db
      .select({
        id: productionJobs.id,
        code: productionJobs.code,
        productionOrderId: productionJobs.productionOrderId,
        order: getTableColumns(orders),
        client: getTableColumns(clients),
        itemId: productionJobs.itemId,
        quantity: productionJobs.quantity,
        status: productionJobs.status,
        startedBy: productionJobs.startedBy,
        startedAt: productionJobs.startedAt,
        createdAt: productionJobs.createdAt,
        updatedAt: productionJobs.updatedAt,
        item: getTableColumns(items),
      })
      .from(productionJobs)
      .innerJoin(
        productionOrders,
        eq(productionOrders.id, productionJobs.productionOrderId),
      )
      .innerJoin(orders, eq(orders.id, productionOrders.orderId))
      .leftJoin(clients, eq(clients.id, orders.clientId))
      .innerJoin(items, eq(items.id, productionJobs.itemId))
      .where(eq(productionJobs.id, jobId));

    if (!job) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(ProductionJobDetailResDto, job, {
      excludeExtraneousValues: true,
    });
  }

  /** `GET /production-jobs/:jobId/bom` — nhu cầu vật tư của Job. Đọc `production_job_issues`
   * (1 dòng/vật tư, `requiredQty` = định mức BOM × SL Job, ghi 1 lần lúc duyệt LSX) join hai bảng
   * chiều `productionJobItems`/`productionJobUnits`, trả nguyên cả hai qua `getTableColumns` lồng
   * dưới `item`/`unit` — `code`/`name` trùng tên giữa hai bảng nên không spread phẳng được, và
   * DTO (`@Expose()` trên `ProductionJobItemResDto`/`ProductionJobUnitResDto`) tự lọc chỉ còn
   * `code`/`name`. `.select()` thủ công vì `q` lẫn `orderBy` chạm bảng join — relational query API
   * không biểu diễn được. Hai `innerJoin` an toàn vì cả hai FK đều `NOT NULL` (quan hệ 1-1, không
   * rơi dòng nào, `count()` khớp đúng trang). Job chưa có dòng nào trả mảng rỗng. */
  async getProductionJobBom(
    jobId: string,
    reqDto: GetProductionJobBomReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobIssueResDto>> {
    await this.ensureJobExists(jobId);

    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      eq(productionJobIssues.productionJobId, jobId),
      keyword
        ? or(
            unaccentILike(productionJobItems.code, keyword),
            unaccentILike(productionJobItems.name, keyword),
          )
        : undefined,
    );

    // "Theo dõi đã lãnh" — Đã lãnh đọc qua hàm thuần của module `inventory-requisitions`
    // (`docs/domains/inventory.md`), không qua DI, cùng tiền lệ `hasPendingIqcForItems`.
    const issued = issuedQuantityByJobItemSubquery(this.db);

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          item: getTableColumns(productionJobItems),
          unit: getTableColumns(productionJobUnits),
          requiredQty: productionJobIssues.requiredQty,
          issuedQuantity:
            sql<number>`coalesce(${issued.issuedQuantity}, 0)`.mapWith(Number),
        })
        .from(productionJobIssues)
        .innerJoin(
          productionJobItems,
          eq(productionJobItems.id, productionJobIssues.productionJobItemId),
        )
        .innerJoin(
          productionJobUnits,
          eq(productionJobUnits.id, productionJobIssues.productionJobUnitId),
        )
        .leftJoin(
          issued,
          and(
            eq(issued.productionJobId, jobId),
            eq(issued.itemId, productionJobIssues.itemId),
          ),
        )
        .where(where)
        .orderBy(asc(productionJobItems.code), asc(productionJobIssues.id))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(productionJobIssues)
        .innerJoin(
          productionJobItems,
          eq(productionJobItems.id, productionJobIssues.productionJobItemId),
        )
        .where(where),
    ]);

    const lines = rows.map((row) => ({
      ...row,
      remainingQuantity: Math.max(row.requiredQty - row.issuedQuantity, 0),
    }));

    return new OffsetPaginatedDto(
      plainToInstance(ProductionJobIssueResDto, lines, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total ?? 0, reqDto),
    );
  }

  /** `GET /production-jobs/:jobId/operations` — công đoạn as-used của Job (cả `INHOUSE` lẫn
   * `OUTSOURCE`), nhóm theo BOM item chứa nó; nguồn duy nhất để lấy `operationId` cho
   * `PATCH .../operations/:operationId`. `plannedQuantity` đọc thẳng cột đã đóng băng lúc duyệt LSX
   * (`copyBomTree`), gắn xuống từng công đoạn của node. Mảng thường, không phân trang — số BOM item
   * của một Job luôn nhỏ. */
  async getProductionJobOperations(
    jobId: string,
  ): Promise<ProductionJobBomItemResDto[]> {
    await this.ensureJobExists(jobId);

    const bomItems = await this.db.query.productionJobBomItems.findMany({
      where: eq(productionJobBomItems.productionJobId, jobId),
      orderBy: [
        asc(productionJobBomItems.sortOrder),
        asc(productionJobBomItems.id),
      ],
      with: {
        operations: {
          orderBy: [
            asc(productionJobOperations.sortOrder),
            asc(productionJobOperations.createdAt),
          ],
        },
      },
    });

    const groups = bomItems
      .filter((bomItem) => bomItem.operations.length > 0)
      .map((bomItem) => ({
        ...bomItem,
        operations: bomItem.operations.map((operation) => ({
          ...operation,
          plannedQuantity: bomItem.plannedQuantity,
        })),
      }));

    return plainToInstance(ProductionJobBomItemResDto, groups, {
      excludeExtraneousValues: true,
    });
  }

  /** `PATCH /production-jobs/:jobId/operations/:operationId` — ghi đè SL hoàn thành của một công
   * đoạn (không cộng dồn). SL kế hoạch đối chiếu = `plannedQuantity` của node BOM cha (cột đã đóng
   * băng lúc duyệt LSX), vượt số đó bị chặn (`E088`). `completedDate` server tự set khi chạm đủ, tự
   * xoá khi sửa xuống dưới. */
  async updateProductionJobOperation(
    jobId: string,
    operationId: string,
    reqDto: UpdateProductionJobOperationReqDto,
  ): Promise<ProductionJobOperationResDto> {
    const job = await this.ensureJobExists(jobId);
    this.ensureStatus(job.status, [ProductionJobStatus.IN_PROGRESS]);

    const operation = await this.db.query.productionJobOperations.findFirst({
      where: and(
        eq(productionJobOperations.id, operationId),
        eq(productionJobOperations.productionJobId, jobId),
      ),
      columns: { id: true },
      with: {
        bomItem: true,
      },
    });

    if (!operation) {
      throw new AppException(ErrorCode.E091, HttpStatus.NOT_FOUND);
    }

    // Bước Lắp ráp (node `itemType = 'FG'`, xem `copyFinalAssemblyRouting`) chỉ mở khi mọi part
    // khác của Job đã báo hoàn thành đủ — "A, B, C đều ✔ mới mở Assembly".
    if (operation.bomItem.itemType === ItemType.FG) {
      const [{ pendingCount }] = await this.db
        .select({ pendingCount: count() })
        .from(productionJobOperations)
        .innerJoin(
          productionJobBomItems,
          eq(
            productionJobBomItems.id,
            productionJobOperations.productionJobBomItemId,
          ),
        )
        .where(
          and(
            eq(productionJobOperations.productionJobId, jobId),
            ne(productionJobBomItems.itemType, ItemType.FG),
            isNull(productionJobOperations.completedDate),
          ),
        );

      if (pendingCount > 0) {
        throw new AppException(ErrorCode.E210, HttpStatus.BAD_REQUEST);
      }
    }

    const planned = operation.bomItem.plannedQuantity;

    if (reqDto.completedQuantity > planned) {
      throw new AppException(ErrorCode.E088, HttpStatus.BAD_REQUEST);
    }

    await this.db
      .update(productionJobOperations)
      .set({
        completedQuantity: reqDto.completedQuantity,
        completedDate: reqDto.completedQuantity >= planned ? new Date() : null,
      })
      .where(eq(productionJobOperations.id, operationId));

    const updated = await this.db.query.productionJobOperations.findFirst({
      where: eq(productionJobOperations.id, operationId),
    });

    return plainToInstance(ProductionJobOperationResDto, updated, {
      excludeExtraneousValues: true,
    });
  }

  async requestJobQc(jobId: string, userId: string): Promise<void> {
    return this.oqcService.createOqcForJob(jobId, userId);
  }

  async createProductionJobNote(
    jobId: string,
    reqDto: CreateProductionJobNoteReqDto,
    userId: string,
  ): Promise<void> {
    await this.ensureJobExists(jobId);

    await this.db.insert(productionJobNotes).values({
      productionJobId: jobId,
      content: reqDto.content,
      createdBy: userId,
    });
  }

  /** Sắp `asc(createdAt)` — đọc xuôi như luồng trao đổi, khác `getProductionOrderLogs` (đọc ngược
   * lịch sử) một cách có chủ đích. */
  async getProductionJobNotes(
    jobId: string,
    reqDto: GetProductionJobNotesReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobNoteResDto>> {
    await this.ensureJobExists(jobId);

    const where = eq(productionJobNotes.productionJobId, jobId);
    const [rows, countRows] = await Promise.all([
      this.db.query.productionJobNotes.findMany({
        where,
        with: { creatorBy: true },
        orderBy: asc(productionJobNotes.createdAt),
        limit: reqDto.limit,
        offset: reqDto.offset,
      }),
      this.db.select({ total: count() }).from(productionJobNotes).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ProductionJobNoteResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Sinh Job cho một LSX vừa duyệt — 1 Job/item FG (SL > 0), gộp mọi dòng
   * `production_order_items` cùng `itemId`. Bắt buộc truyền `tx` — chỉ gọi được từ transaction
   * duyệt của `ProductionOrdersService.approveProductionOrder`. Đồng thời nhân bản cây BOM
   * (`copyBomTree`, cả node WIP lẫn lá RM) và routing Cấp 0 của chính FG (`copyFinalAssemblyRouting`) đúng
   * một lần mỗi thứ. */
  async createJobs(
    tx: DbTransaction,
    productionOrderId: string,
    quantityByItem: Map<string, number>,
  ): Promise<void> {
    if (!quantityByItem.size) {
      return;
    }

    const itemIds = [...quantityByItem.keys()];
    const codes = await this.generateJobCodes(tx, itemIds.length);
    const jobRows = await tx
      .insert(productionJobs)
      .values(
        itemIds.map((itemId, index) => ({
          code: codes[index],
          productionOrderId,
          itemId,
          quantity: quantityByItem.get(itemId)!,
        })),
      )
      .returning({
        id: productionJobs.id,
        itemId: productionJobs.itemId,
      });

    const jobIdByItemId = new Map(jobRows.map((job) => [job.itemId, job.id]));
    await this.copyBomTree(tx, itemIds, jobIdByItemId, quantityByItem);
    await this.copyFinalAssemblyRouting(
      tx,
      itemIds,
      jobIdByItemId,
      quantityByItem,
    );
    await this.copyBomIssues(tx, itemIds, jobIdByItemId, quantityByItem);
  }

  /**
   * Nhân bản cây `bom_items` (cả node WIP lẫn lá RM) của từng item sang
   * `production_job_bom_items` — id hoàn toàn mới, `code`/`name` snapshot text (độc lập `items`
   * sống) — rồi copy công đoạn as-used của từng node WIP (`bom_operations.bomItemId`) sang
   * `production_job_operations`, remap `bomItemId` qua id snapshot mới và denormalize luôn
   * `code`/`name`/`type` của công đoạn. Cùng kỹ thuật remap của `ItemsService.copyBomTree`. Yêu
   * cầu `sourceBomItems` sắp cha-trước-con (`orderBy level`) để id cha luôn có sẵn trong map khi xử
   * lý tới con — cùng tính chất đó cũng cho phép tính `plannedQuantity` (nhân luỹ kế `quantity` ×
   * SL Job từ gốc xuống) ngay trong cùng vòng lặp, không cần đệ quy riêng. Đây là nguồn ghi duy nhất
   * của cột `plannedQuantity` — mọi route đọc chỉ đọc lại, không tính nữa.
   */
  private async copyBomTree(
    tx: DbTransaction,
    itemIds: string[],
    jobIdByItemId: Map<string, string>,
    quantityByItem: Map<string, number>,
  ): Promise<void> {
    const bomRefs = await tx.query.boms.findMany({
      where: inArray(boms.itemId, itemIds),
      columns: { id: true, itemId: true },
    });

    if (!bomRefs.length) {
      return;
    }

    const bomIds = bomRefs.map((bom) => bom.id);
    const itemIdByBomId = new Map(bomRefs.map((bom) => [bom.id, bom.itemId]));

    const sourceBomItems = await tx.query.bomItems.findMany({
      where: inArray(bomItems.bomId, bomIds),
      orderBy: [asc(bomItems.level), asc(bomItems.sortOrder)],
      with: { item: true },
    });

    if (!sourceBomItems.length) {
      return;
    }

    const newIdByOldId = new Map<string, string>();
    const jobIdByNewItemId = new Map<string, string>();
    const plannedByNewId = new Map<string, number>();

    const newItems = sourceBomItems.map((node) => {
      const newId = crypto.randomUUID();
      newIdByOldId.set(node.id, newId);

      const rootItemId = itemIdByBomId.get(node.bomId)!;
      const productionJobId = jobIdByItemId.get(rootItemId)!;
      jobIdByNewItemId.set(newId, productionJobId);

      const newParentId = node.parentId
        ? (newIdByOldId.get(node.parentId) ?? null)
        : null;
      const parentPlanned = newParentId
        ? plannedByNewId.get(newParentId)!
        : quantityByItem.get(rootItemId)!;
      const plannedQuantity = parentPlanned * node.quantity;
      plannedByNewId.set(newId, plannedQuantity);

      return {
        id: newId,
        productionJobId,
        parentId: newParentId,
        itemType: node.item.type,
        code: node.item.code,
        name: node.item.name,
        quantity: node.quantity,
        plannedQuantity,
        sortOrder: node.sortOrder,
        level: node.level,
        itemId: node.itemId,
        imageFileId: node.item.imageFileId,
      };
    });

    await tx.insert(productionJobBomItems).values(newItems);

    // As-used routing của từng node nguồn — node RM không có bom_operations (chặn từ lúc ghi),
    // nên query này tự nhiên chỉ khớp node WIP, không cần lọc riêng.
    const sourceBomItemIds = sourceBomItems.map((node) => node.id);
    const asUsedSteps = await tx.query.bomOperations.findMany({
      where: inArray(bomOperations.bomItemId, sourceBomItemIds),
      with: { operation: true },
      orderBy: [asc(bomOperations.sortOrder), asc(bomOperations.createdAt)],
    });

    if (!asUsedSteps.length) {
      return;
    }

    await tx.insert(productionJobOperations).values(
      asUsedSteps.map((step) => {
        const newBomItemId = newIdByOldId.get(step.bomItemId)!;
        return {
          productionJobId: jobIdByNewItemId.get(newBomItemId)!,
          productionJobBomItemId: newBomItemId,
          operationId: step.operationId,
          code: step.operation.code,
          name: step.operation.name,
          type: step.operation.type,
          sortOrder: step.sortOrder,
          note: step.note,
        };
      }),
    );
  }

  /**
   * Nhân bản routing Cấp 0 (lắp ráp/đóng gói) của chính FG vào một node `production_job_bom_items`
   * riêng, `itemType = 'FG'` (xem doc comment bảng đó và `docs/decisions/oqc-per-operation.md`
   * mục "Đừng hoàn lại") — để OQC có công đoạn để gắn vào cho bước QC thành phẩm cuối cùng, và
   * `getProductionJobOperations` hiện được nhóm đó ở cuối tab "Công đoạn sản xuất". Độc lập hoàn
   * toàn với `copyBomTree` (không qua `boms`/`bom_items`) — chỉ đọc `routings`/`routing_operations`
   * của chính `itemIds`. Bỏ qua item nào không khai routing Cấp 0 — không tạo node rỗng.
   * `sortOrder` = lớn nhất hiện có của Job + 1, để node FG luôn đứng cuối cây (gọi sau
   * `copyBomTree` trong cùng transaction nên đọc lại `production_job_bom_items` đã thấy đủ node
   * WIP/RM vừa insert).
   */
  private async copyFinalAssemblyRouting(
    tx: DbTransaction,
    itemIds: string[],
    jobIdByItemId: Map<string, string>,
    quantityByItem: Map<string, number>,
  ): Promise<void> {
    const finalAssemblyRoutings = await tx.query.routings.findMany({
      where: inArray(routings.itemId, itemIds),
      with: {
        item: true,
        operations: {
          orderBy: [
            asc(routingOperations.sortOrder),
            asc(routingOperations.createdAt),
          ],
          with: { operation: true },
        },
      },
    });

    const withSteps = finalAssemblyRoutings.filter(
      (routing) => routing.operations.length > 0,
    );

    if (!withSteps.length) {
      return;
    }

    const jobIds = withSteps.map(
      (routing) => jobIdByItemId.get(routing.itemId)!,
    );
    const maxSortOrderRows = await tx
      .select({
        productionJobId: productionJobBomItems.productionJobId,
        maxSortOrder:
          sql<number>`coalesce(max(${productionJobBomItems.sortOrder}), -1)`.mapWith(
            Number,
          ),
      })
      .from(productionJobBomItems)
      .where(inArray(productionJobBomItems.productionJobId, jobIds))
      .groupBy(productionJobBomItems.productionJobId);
    const maxSortOrderByJobId = new Map(
      maxSortOrderRows.map((row) => [row.productionJobId, row.maxSortOrder]),
    );

    const newIdByItemId = new Map<string, string>();
    const finalAssemblyItems = withSteps.map((routing) => {
      const newId = crypto.randomUUID();
      newIdByItemId.set(routing.itemId, newId);
      const productionJobId = jobIdByItemId.get(routing.itemId)!;
      const nextSortOrder =
        (maxSortOrderByJobId.get(productionJobId) ?? -1) + 1;

      return {
        id: newId,
        productionJobId,
        parentId: null,
        itemType: ItemType.FG,
        code: routing.item.code,
        name: routing.item.name,
        quantity: 1,
        plannedQuantity: quantityByItem.get(routing.itemId)!,
        sortOrder: nextSortOrder,
        level: 0,
        itemId: routing.itemId,
        imageFileId: routing.item.imageFileId,
      };
    });

    await tx.insert(productionJobBomItems).values(finalAssemblyItems);

    await tx.insert(productionJobOperations).values(
      withSteps.flatMap((routing) =>
        routing.operations.map((step) => ({
          productionJobId: jobIdByItemId.get(routing.itemId)!,
          productionJobBomItemId: newIdByItemId.get(routing.itemId)!,
          operationId: step.operationId,
          code: step.operation.code,
          name: step.operation.name,
          type: step.operation.type,
          sortOrder: step.sortOrder,
          note: step.note,
        })),
      ),
    );
  }

  /**
   * Gộp mọi node lá RM thuộc cây `bom_items` của từng item theo vật tư (vị trí chỉ ảnh hưởng
   * hiển thị/sửa ở Product Structure, không ảnh hưởng phép gộp; KHÔNG nổ theo cấp qua node WIP
   * cha, xem `docs/domains/product-structure.md`) — rồi nhân với SL Job thành `requiredQty`, ghi
   * vào `production_job_issues`. `unitQty` giữ nguyên định mức gốc — chưa có route sửa nào
   * dùng tới, để sẵn cho lúc mở rộng CRUD sau này.
   *
   * Mã/tên vật tư và mã/tên ĐVT không ghi thẳng lên dòng issue — get-or-create trước hai dòng
   * chiều `productionJobItems`/`productionJobUnits` (khoá theo bộ ba nội dung, xem doc comment hai
   * bảng đó) rồi chỉ ghi id. `units.id` được lấy thêm so với trước (cần đủ bộ ba để định danh ĐVT).
   */
  private async copyBomIssues(
    tx: DbTransaction,
    itemIds: string[],
    jobIdByItemId: Map<string, string>,
    quantityByItem: Map<string, number>,
  ): Promise<void> {
    const rows = await tx
      .select({
        rootItemId: boms.itemId,
        materialItemId: bomItems.itemId,
        unitQty: sql<number>`sum(${bomItems.quantity})`.mapWith(Number),
        issueCode: items.code,
        issueName: items.name,
        unitId: units.id,
        unitCode: units.code,
        unitName: units.name,
        imageFileId: items.imageFileId,
      })
      .from(bomItems)
      .innerJoin(boms, eq(bomItems.bomId, boms.id))
      .innerJoin(items, eq(bomItems.itemId, items.id))
      .innerJoin(units, eq(items.unitId, units.id))
      .where(and(inArray(boms.itemId, itemIds), eq(items.type, ItemType.RM)))
      .groupBy(
        boms.itemId,
        bomItems.itemId,
        items.code,
        items.name,
        units.id,
        units.code,
        units.name,
        items.imageFileId,
      );

    if (!rows.length) {
      return;
    }

    const jobItemIdByKey = await this.resolveJobItemSnapshots(tx, rows);
    const jobUnitIdByKey = await this.resolveJobUnitSnapshots(tx, rows);

    await tx.insert(productionJobIssues).values(
      rows.map((row) => ({
        productionJobId: jobIdByItemId.get(row.rootItemId)!,
        itemId: row.materialItemId,
        productionJobItemId: jobItemIdByKey.get(
          snapshotKey(row.materialItemId, row.issueCode, row.issueName),
        )!,
        productionJobUnitId: jobUnitIdByKey.get(
          snapshotKey(row.unitId, row.unitCode, row.unitName),
        )!,
        imageFileId: row.imageFileId,
        unitQty: row.unitQty,
        requiredQty: row.unitQty * quantityByItem.get(row.rootItemId)!,
      })),
    );
  }

  /**
   * Get-or-create dòng `production_job_items` cho mọi vật tư của đợt duyệt này, trả map
   * `snapshotKey(itemId, code, name) → id`.
   *
   * `ON CONFLICT DO NOTHING` không `RETURNING` dòng đã tồn tại, nên không dựng được map từ riêng
   * kết quả insert — luôn `SELECT` lại sau khi insert, lọc theo `itemId` (cột dẫn đầu của
   * `uq_production_job_items_item_code_name`, nên đi index) rồi ghép đúng bộ ba trong bộ nhớ. Map
   * trả về có thể chứa cả phiên bản tên cũ của cùng một item — vô hại, mọi lượt tra đều bằng đúng
   * bộ ba.
   *
   * `SELECT` lại đúng đắn **phụ thuộc READ COMMITTED** (mặc định Postgres, `.claude/rules/
   * transactions.md` cấm đổi isolation) — nó lấy snapshot mới nên thấy cả dòng vừa được một
   * transaction duyệt LSX song song commit, đúng trường hợp `DO NOTHING` bỏ qua.
   */
  private async resolveJobItemSnapshots(
    tx: DbTransaction,
    rows: { materialItemId: string; issueCode: string; issueName: string }[],
  ): Promise<Map<string, string>> {
    const wanted = new Map(
      rows.map((row) => [
        snapshotKey(row.materialItemId, row.issueCode, row.issueName),
        {
          itemId: row.materialItemId,
          code: row.issueCode,
          name: row.issueName,
        },
      ]),
    );

    await tx
      .insert(productionJobItems)
      .values(
        [...wanted.entries()]
          .sort(([left], [right]) => (left < right ? -1 : 1))
          .map(([, value]) => value),
      )
      .onConflictDoNothing({
        target: [
          productionJobItems.itemId,
          productionJobItems.code,
          productionJobItems.name,
        ],
      });

    const snapshots = await tx
      .select({
        id: productionJobItems.id,
        itemId: productionJobItems.itemId,
        code: productionJobItems.code,
        name: productionJobItems.name,
      })
      .from(productionJobItems)
      .where(
        inArray(productionJobItems.itemId, [
          ...new Set(rows.map((row) => row.materialItemId)),
        ]),
      );

    return new Map(
      snapshots.map((snapshot) => [
        snapshotKey(snapshot.itemId, snapshot.code, snapshot.name),
        snapshot.id,
      ]),
    );
  }

  /** Song sinh của `resolveJobItemSnapshots` cho `production_job_units` — cùng lý lẽ `DO NOTHING`
   * + đọc lại, cùng ràng buộc READ COMMITTED. */
  private async resolveJobUnitSnapshots(
    tx: DbTransaction,
    rows: { unitId: string; unitCode: string; unitName: string }[],
  ): Promise<Map<string, string>> {
    const wanted = new Map(
      rows.map((row) => [
        snapshotKey(row.unitId, row.unitCode, row.unitName),
        { unitId: row.unitId, code: row.unitCode, name: row.unitName },
      ]),
    );

    await tx
      .insert(productionJobUnits)
      .values(
        [...wanted.entries()]
          .sort(([left], [right]) => (left < right ? -1 : 1))
          .map(([, value]) => value),
      )
      .onConflictDoNothing({
        target: [
          productionJobUnits.unitId,
          productionJobUnits.code,
          productionJobUnits.name,
        ],
      });

    const snapshots = await tx
      .select({
        id: productionJobUnits.id,
        unitId: productionJobUnits.unitId,
        code: productionJobUnits.code,
        name: productionJobUnits.name,
      })
      .from(productionJobUnits)
      .where(
        inArray(productionJobUnits.unitId, [
          ...new Set(rows.map((row) => row.unitId)),
        ]),
      );

    return new Map(
      snapshots.map((snapshot) => [
        snapshotKey(snapshot.unitId, snapshot.code, snapshot.name),
        snapshot.id,
      ]),
    );
  }

  /** `PENDING` → `IN_PROGRESS` (`E087` nếu không), ghi `startedBy`/`startedAt`. Cùng transaction:
   * vật tư nào của Job thiếu tồn thì sinh một đề xuất mua hàng cho đúng phần thiếu
   * (`PurchaseRequestsService.createShortageRequest`) — không thiếu gì thì không tạo phiếu.
   * Trình tự đầy đủ: `docs/workflows/production-job-execution.md`. */
  async startJob(jobId: string, userId: string): Promise<void> {
    const job = await this.ensureJobExists(jobId);
    this.ensureStatus(job.status, [ProductionJobStatus.PENDING]);

    const shortages = await this.collectMaterialShortages(jobId);

    await this.db.transaction(async (tx) => {
      await tx
        .update(productionJobs)
        .set({
          status: ProductionJobStatus.IN_PROGRESS,
          startedBy: userId,
          startedAt: new Date(),
        })
        .where(eq(productionJobs.id, jobId));

      if (!shortages.length) {
        return;
      }

      await this.purchaseRequestsService.createShortageRequest(tx, {
        departmentId: await this.usersService.getUserDepartmentId(tx, userId),
        productionOrderId: job.productionOrderId,
        productionJobId: jobId,
        createdBy: userId,
        items: shortages,
      });
    });
  }

  /** Vật tư của Job thiếu tồn tại thời điểm bấm start: `requiredQty` (snapshot lúc duyệt LSX) trừ
   * tồn kho vật tư hiện tại (gộp mọi kho), chỉ giữ phần dương. Dòng `itemId = NULL` (vật tư bị xoá
   * sau khi snapshot) bị bỏ qua — `purchase_request_items.itemId` là `NOT NULL`, không dựng được
   * dòng. */
  private async collectMaterialShortages(
    jobId: string,
  ): Promise<PurchaseRequestShortageItem[]> {
    const jobIssues = await this.db.query.productionJobIssues.findMany({
      where: eq(productionJobIssues.productionJobId, jobId),
      columns: { itemId: true, requiredQty: true },
    });

    const itemIds = jobIssues
      .map((row) => row.itemId)
      .filter((id): id is string => id !== null);

    if (!itemIds.length) {
      return [];
    }

    const onHandByItem =
      await this.inventoryService.getMaterialStockLevels(itemIds);

    return jobIssues.flatMap((row) => {
      if (!row.itemId) {
        return [];
      }
      const shortage = row.requiredQty - (onHandByItem.get(row.itemId) ?? 0);
      return shortage > 0 ? [{ itemId: row.itemId, quantity: shortage }] : [];
    });
  }

  /** Job không tồn tại → `E082`. */
  private async ensureJobExists(jobId: string): Promise<{
    id: string;
    status: ProductionJobStatus;
    quantity: number;
    itemId: string;
    productionOrderId: string;
  }> {
    const job = await this.db.query.productionJobs.findFirst({
      columns: {
        id: true,
        status: true,
        quantity: true,
        itemId: true,
        productionOrderId: true,
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

  private async generateJobCodes(
    tx: DbTransaction,
    howMany: number,
  ): Promise<string[]> {
    const sequences = await generateDocumentSequences(
      tx,
      DocumentType.PRODUCTION_JOB,
      0,
      howMany,
    );

    return sequences.map(
      (sequence) => `JOB${String(sequence).padStart(4, '0')}`,
    );
  }
}
