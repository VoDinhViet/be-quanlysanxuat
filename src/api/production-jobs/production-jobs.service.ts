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
  bomMaterials,
  boms,
  clients,
  files,
  bomOperations,
  materials,
  orders,
  productionJobBomItems,
  productionJobMaterials,
  productionJobNotes,
  productionJobOperations,
  productionJobs,
  ProductionJobStatus,
  productionOrders,
  products,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { InventoryService } from '../inventory/inventory.service';
import { PurchaseRequestsService } from '../purchase-requests/purchase-requests.service';
import { PurchaseRequestShortageItem } from '../purchase-requests/types/shortage-request.type';
import { UsersService } from '../users/users.service';
import { CreateProductionJobNoteReqDto } from './dto/create-production-job-note.req.dto';
import { GetProductionJobMaterialsReqDto } from './dto/get-production-job-materials.req.dto';
import { GetProductionJobNotesReqDto } from './dto/get-production-job-notes.req.dto';
import { GetProductionJobsReqDto } from './dto/get-production-jobs.req.dto';
import { ProductionJobBomItemResDto } from './dto/production-job-bom-item.res.dto';
import { ProductionJobDetailResDto } from './dto/production-job-detail.res.dto';
import { ProductionJobMaterialResDto } from './dto/production-job-material.res.dto';
import { ProductionJobNoteResDto } from './dto/production-job-note.res.dto';
import { ProductionJobOperationResDto } from './dto/production-job-operation.res.dto';
import { ProductionJobResDto } from './dto/production-job.res.dto';
import { UpdateProductionJobOperationReqDto } from './dto/update-production-job-operation.req.dto';
import {
  SourceBomItemRow,
  SourceBomOperationRow,
} from './types/job-bom-tree.type';

/** Job sản xuất — 1 sản phẩm (FG) = 1 Job trong một LSX. Chỉ tạo được qua `createJobs`, gọi từ
 * transaction duyệt LSX (`ProductionOrdersService.approveProductionOrder`) — không có route tạo
 * Job riêng. Sau khi tạo chỉ còn một hành động: `start`. Vòng đời, business rule:
 * `docs/domains/production.md`, `docs/workflows/production-job-execution.md`. */
@Injectable()
export class ProductionJobsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly inventoryService: InventoryService,
    private readonly purchaseRequestsService: PurchaseRequestsService,
    private readonly usersService: UsersService,
  ) {}

  /** `.select()` thủ công — `q` lọc trên `productionOrders`/`orders`/`products` (bảng join),
   * relational query API không biểu diễn được. */
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

  async getProductionJob(jobId: string): Promise<ProductionJobDetailResDto> {
    const [job] = await this.db
      .select({
        id: productionJobs.id,
        code: productionJobs.code,
        productionOrderId: productionJobs.productionOrderId,
        order: getTableColumns(orders),
        client: getTableColumns(clients),
        productId: productionJobs.productId,
        quantity: productionJobs.quantity,
        status: productionJobs.status,
        startedBy: productionJobs.startedBy,
        startedAt: productionJobs.startedAt,
        createdAt: productionJobs.createdAt,
        updatedAt: productionJobs.updatedAt,
        product: getTableColumns(products),
      })
      .from(productionJobs)
      .innerJoin(
        productionOrders,
        eq(productionOrders.id, productionJobs.productionOrderId),
      )
      .innerJoin(orders, eq(orders.id, productionOrders.orderId))
      .leftJoin(clients, eq(clients.id, orders.clientId))
      .innerJoin(products, eq(products.id, productionJobs.productId))
      .where(eq(productionJobs.id, jobId));

    if (!job) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(ProductionJobDetailResDto, job, {
      excludeExtraneousValues: true,
    });
  }

  /** `GET /production-jobs/:jobId/bom` — cây BOM của Job đã đóng băng lúc duyệt LSX: danh sách
   * phẳng cha-con (FE tự dựng cây qua `parentId`), mỗi node kèm công đoạn as-used của nó và
   * `plannedQuantity` (tính lúc đọc, xem `resolvePlannedQuantities`). Không gồm sản phẩm FG gốc —
   * chỉ node BOM thật (`production_job_bom_items`); `parentId = null` là node top-level, con trực
   * tiếp của FG. */
  async getProductionJobBom(
    jobId: string,
  ): Promise<ProductionJobBomItemResDto[]> {
    const job = await this.ensureJobExists(jobId);

    const nodes = await this.db.query.productionJobBomItems.findMany({
      where: eq(productionJobBomItems.productionJobId, jobId),
      with: {
        operations: {
          orderBy: [
            asc(productionJobOperations.sortOrder),
            asc(productionJobOperations.createdAt),
          ],
        },
      },
      orderBy: [
        asc(productionJobBomItems.level),
        asc(productionJobBomItems.sortOrder),
        asc(productionJobBomItems.createdAt),
      ],
    });

    const plannedById = this.resolvePlannedQuantities(nodes, job.quantity);
    const rows = nodes.map((node) => ({
      ...node,
      plannedQuantity: plannedById.get(node.id)!,
    }));

    return plainToInstance(ProductionJobBomItemResDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  /** `PATCH /production-jobs/:jobId/operations/:operationId` — ghi đè SL hoàn thành của một công
   * đoạn (không cộng dồn). SL kế hoạch đối chiếu = SL kế hoạch node BOM cha
   * (`resolvePlannedQuantities`), vượt số đó bị chặn (`E088`). `completedDate` server tự set khi
   * chạm đủ, tự xoá khi sửa xuống dưới. */
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
      columns: { id: true, productionJobBomItemId: true },
    });

    if (!operation) {
      throw new AppException(ErrorCode.E091, HttpStatus.NOT_FOUND);
    }

    const nodes = await this.db.query.productionJobBomItems.findMany({
      where: eq(productionJobBomItems.productionJobId, jobId),
      columns: { id: true, parentId: true, quantity: true },
    });
    const planned = this.resolvePlannedQuantities(nodes, job.quantity).get(
      operation.productionJobBomItemId,
    )!;

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

  /** SL kế hoạch của một node = SL kế hoạch node cha (gốc là SL Job) × định mức (`quantity`) của
   * chính node — nhân luỹ kế theo cây cha-con, vì `quantity` là định mức trên 1 đơn vị cha, không
   * phải số tuyệt đối (khác `production_job_materials.requiredQty`, cố ý không nổ theo cấp). Không
   * lưu cột — `quantity`/`parentId`/SL Job đều bất biến sau khi Job duyệt nên tính lại lúc đọc
   * không có rủi ro lệch dữ liệu (khác lý do từng khiến `level` phải chuyển sang lưu cột thật). */
  private resolvePlannedQuantities(
    nodes: { id: string; parentId: string | null; quantity: number }[],
    jobQuantity: number,
  ): Map<string, number> {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const planned = new Map<string, number>();

    const resolve = (id: string): number => {
      const cached = planned.get(id);
      if (cached !== undefined) {
        return cached;
      }
      const node = nodeById.get(id)!;
      const parentPlanned = node.parentId
        ? resolve(node.parentId)
        : jobQuantity;
      const value = parentPlanned * node.quantity;
      planned.set(id, value);
      return value;
    };

    for (const node of nodes) {
      resolve(node.id);
    }

    return planned;
  }

  /** Read-only, danh sách vật tư khởi tạo từ BOM lúc duyệt. Đọc thẳng cột snapshot trên
   * `production_job_materials` (`materialCode`/`materialName`, độc lập `materials` sống) — `q` lọc
   * ngay trên chúng, không còn join `materials`. Chỉ còn join `files` để lấy metadata ảnh: `files`
   * là registry ghi-một-lần, an toàn giữ dạng liên kết sống. */
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
            unaccentILike(productionJobMaterials.materialCode, keyword),
            unaccentILike(productionJobMaterials.materialName, keyword),
          )
        : undefined,
    );

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(productionJobMaterials),
          image: getTableColumns(files),
        })
        .from(productionJobMaterials)
        .leftJoin(files, eq(productionJobMaterials.imageFileId, files.id))
        .where(where)
        .orderBy(asc(productionJobMaterials.materialCode))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(productionJobMaterials)
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ProductionJobMaterialResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
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
        with: { creator: true },
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

  /** Sinh Job cho một LSX vừa duyệt — 1 Job/sản phẩm (SL > 0), gộp mọi dòng
   * `production_order_items` cùng `productId`. Bắt buộc truyền `tx` — chỉ gọi được từ transaction
   * duyệt của `ProductionOrdersService.approveProductionOrder`. Đồng thời nhân bản cây BOM
   * (`copyBomProcess`) và copy vật tư (`copyBomMaterials`) từ Product Structure, đúng một lần. */
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
    await this.copyBomProcess(tx, productIds, jobIdByProductId);
    await this.copyBomMaterials(
      tx,
      productIds,
      jobIdByProductId,
      quantityByProduct,
    );
  }

  /**
   * Nhân bản cây cấu trúc (`bom_items`, thuần WIP) của từng sản phẩm sang
   * `production_job_bom_items` — id hoàn toàn mới, `code`/`name` snapshot text (độc lập
   * `products` sống) — rồi copy công đoạn as-used của từng node (`bom_operations.bomItemId`) sang
   * `production_job_operations`, remap `bomItemId` qua id snapshot mới và denormalize luôn
   * `code`/`name`/`type` của công đoạn. Cùng kỹ thuật remap của `ProductsService.cloneBomTree`. Yêu
   * cầu `sourceItems` sắp cha-trước-con (`orderBy level`) để id cha luôn có sẵn trong map khi xử lý
   * tới con. Vật tư **không** nhân bản ở đây — xem `copyBomMaterials`, vật tư của Job chỉ sống ở
   * `production_job_materials`, không còn là node trong cây snapshot.
   */
  private async copyBomProcess(
    tx: DbTransaction,
    productIds: string[],
    jobIdByProductId: Map<string, string>,
  ): Promise<void> {
    const bomHeaders = await tx.query.boms.findMany({
      where: inArray(boms.productId, productIds),
      columns: { id: true, productId: true },
    });

    if (!bomHeaders.length) {
      return;
    }

    const bomIds = bomHeaders.map((bom) => bom.id);
    const productIdByBomId = new Map(
      bomHeaders.map((bom) => [bom.id, bom.productId]),
    );

    const sourceItems = (await tx.query.bomItems.findMany({
      where: inArray(bomItems.bomId, bomIds),
      orderBy: [asc(bomItems.level), asc(bomItems.sortOrder)],
      with: {
        product: { columns: { code: true, name: true } },
      },
    })) as SourceBomItemRow[];

    if (!sourceItems.length) {
      return;
    }

    const newIdByOldId = new Map<string, string>();
    const jobIdByNewItemId = new Map<string, string>();

    const newItems = sourceItems.map((item) => {
      const newId = crypto.randomUUID();
      newIdByOldId.set(item.id, newId);

      const productionJobId = jobIdByProductId.get(
        productIdByBomId.get(item.bomId)!,
      )!;
      jobIdByNewItemId.set(newId, productionJobId);

      return {
        id: newId,
        productionJobId,
        parentId: item.parentId
          ? (newIdByOldId.get(item.parentId) ?? null)
          : null,
        itemType: BomItemType.PRODUCT,
        code: item.product!.code,
        name: item.product!.name,
        quantity: item.quantity,
        sortOrder: item.sortOrder,
        level: item.level,
        productId: item.productId,
        materialId: null,
      };
    });

    await tx.insert(productionJobBomItems).values(newItems);

    // As-used routing của từng node nguồn — mọi hàng bom_items giờ đều routable, không còn nhánh
    // MATERIAL để loại trừ.
    const sourceItemIds = sourceItems.map((item) => item.id);
    const asUsedSteps = (await tx.query.bomOperations.findMany({
      where: inArray(bomOperations.bomItemId, sourceItemIds),
      with: {
        operation: { columns: { code: true, name: true, type: true } },
      },
      orderBy: [asc(bomOperations.sortOrder), asc(bomOperations.createdAt)],
    })) as SourceBomOperationRow[];

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
   * Gộp mọi dòng `bom_materials` thuộc cây `bom_items` của từng sản phẩm theo vật tư (vị trí chỉ
   * ảnh hưởng hiển thị/sửa ở Product Structure, không ảnh hưởng phép gộp; KHÔNG nổ theo cấp qua
   * node WIP cha, xem `docs/domains/product-structure.md`) — rồi nhân với SL Job thành
   * `requiredQty`, ghi vào `production_job_materials`. `unitQty` giữ nguyên định mức gốc — chưa có
   * route sửa nào dùng tới, để sẵn cho lúc mở rộng CRUD sau này. `materialCode`/`materialName`/
   * `unitCode`/`unitName`/`imageFileId` snapshot lúc duyệt — độc lập `materials`/`units` sống, xem
   * doc comment `productionJobMaterials`.
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
        materialId: bomMaterials.materialId,
        unitQty: sql<number>`sum(${bomMaterials.quantity})`.mapWith(Number),
        materialCode: materials.code,
        materialName: materials.name,
        unitCode: units.code,
        unitName: units.name,
        imageFileId: materials.imageFileId,
      })
      .from(bomMaterials)
      .innerJoin(bomItems, eq(bomMaterials.bomItemId, bomItems.id))
      .innerJoin(boms, eq(bomItems.bomId, boms.id))
      .innerJoin(materials, eq(bomMaterials.materialId, materials.id))
      .innerJoin(units, eq(materials.unitId, units.id))
      .where(inArray(boms.productId, productIds))
      .groupBy(
        boms.productId,
        bomMaterials.materialId,
        materials.code,
        materials.name,
        units.code,
        units.name,
        materials.imageFileId,
      );

    if (!rows.length) {
      return;
    }

    await tx.insert(productionJobMaterials).values(
      rows.map((row) => ({
        productionJobId: jobIdByProductId.get(row.productId)!,
        materialId: row.materialId,
        materialCode: row.materialCode,
        materialName: row.materialName,
        unitCode: row.unitCode,
        unitName: row.unitName,
        imageFileId: row.imageFileId,
        unitQty: row.unitQty,
        requiredQty: row.unitQty * quantityByProduct.get(row.productId)!,
      })),
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
   * tồn kho vật tư hiện tại (gộp mọi kho), chỉ giữ phần dương. Dòng `materialId = NULL` (vật tư bị
   * xoá sau khi snapshot) bị bỏ qua — `purchase_request_items.materialId` là `NOT NULL`, không
   * dựng được dòng. */
  private async collectMaterialShortages(
    jobId: string,
  ): Promise<PurchaseRequestShortageItem[]> {
    const jobMaterials = await this.db.query.productionJobMaterials.findMany({
      where: eq(productionJobMaterials.productionJobId, jobId),
      columns: { materialId: true, requiredQty: true },
    });

    const materialIds = jobMaterials
      .map((row) => row.materialId)
      .filter((id): id is string => id !== null);

    if (!materialIds.length) {
      return [];
    }

    const onHandByMaterial =
      await this.inventoryService.getMaterialStockLevels(materialIds);

    return jobMaterials.flatMap((row) => {
      if (!row.materialId) {
        return [];
      }
      const shortage =
        row.requiredQty - (onHandByMaterial.get(row.materialId) ?? 0);
      return shortage > 0
        ? [{ materialId: row.materialId, quantity: shortage }]
        : [];
    });
  }

  /** Job không tồn tại → `E082`. */
  private async ensureJobExists(jobId: string): Promise<{
    id: string;
    status: ProductionJobStatus;
    quantity: number;
    productId: string;
    productionOrderId: string;
  }> {
    const job = await this.db.query.productionJobs.findFirst({
      columns: {
        id: true,
        status: true,
        quantity: true,
        productId: true,
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
