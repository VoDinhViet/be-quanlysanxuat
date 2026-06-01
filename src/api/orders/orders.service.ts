import { randomUUID } from 'node:crypto';
import { unlink, rename } from 'node:fs/promises';
import { extname, isAbsolute, join } from 'node:path';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, eq, ilike, inArray, isNull, ne, or } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  clients,
  orderFiles,
  OrderFileType,
  orderItems,
  orders,
  OrderStatus,
  productFiles,
  ProductFileType,
  ProductItemType,
  products,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { ProductFileResDto } from '../products/dto/product-file.res.dto';
import {
  MAX_ORDER_PDF_SIZE_IN_BYTES,
  ORDER_PDF_ALLOWED_MIME_TYPE,
  ORDER_PDF_PUBLIC_DIR,
  ORDER_PDF_UPLOAD_DIR,
} from './constants/order-file.constants';
import { CreateOrderItemReqDto, CreateOrderReqDto } from './dto/create-order.req.dto';
import { GetOrdersReqDto } from './dto/get-orders.req.dto';
import { OrderFileResDto } from './dto/order-file.res.dto';
import { OrderProductOptionResDto } from './dto/order-product-option.res.dto';
import { OrderProductionResDto } from './dto/order-production.res.dto';
import { OrderResDto } from './dto/order.res.dto';
import { RejectOrderReqDto } from './dto/reject-order.req.dto';
import { UpdateOrderReqDto } from './dto/update-order.req.dto';
import type { OrderStoredFile } from './types/order-file.type';

@Injectable()
export class OrdersService {
  private static readonly ALLOWED_VAT_RATES = [0, 5, 8, 10] as const;

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Lists commercial orders with financial fields and PO PDF metadata.
   *
   * @param reqDto - Query filters, keyword, and pagination options.
   * @returns Paginated commercial order response.
   */
  async getOrders(reqDto: GetOrdersReqDto): Promise<OffsetPaginatedDto<OrderResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const keywordClientIds = keyword ? await this.getKeywordClientIds(keyword) : [];
    const where = and(
      isNull(orders.deletedAt),
      reqDto.status ? eq(orders.status, reqDto.status) : undefined,
      reqDto.clientId ? eq(orders.clientId, reqDto.clientId) : undefined,
      keyword
        ? or(
            ilike(orders.code, keyword),
            ilike(orders.prNumber, keyword),
            keywordClientIds.length > 0 ? inArray(orders.clientId, keywordClientIds) : undefined,
          )
        : undefined,
    );

    const [entities, totalRows] = await Promise.all([
      this.db.query.orders.findMany({
        where,
        with: this.getOrderRelations(),
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(orders.createdAt),
      }),
      this.db.select({ total: count() }).from(orders).where(where),
    ]);

    return new OffsetPaginatedDto(
      this.mapOrders(entities),
      new OffsetPaginationDto(totalRows[0]?.total ?? 0, reqDto),
    );
  }

  /**
   * Creates an order, snapshots product data, and calculates VAT totals.
   *
   * @param reqDto - Client, PO/PR, due date, VAT, note, and product lines.
   * @param userId - Authenticated user identifier used as order creator.
   * @returns Created commercial order detail.
   */
  async createOrder(reqDto: CreateOrderReqDto, userId: string): Promise<OrderResDto> {
    this.ensureVatRateAllowed(reqDto.vatRate);
    await Promise.all([
      this.ensureOrderCodeAvailable(reqDto.code),
      this.ensureClientExists(reqDto.clientId),
    ]);

    const preparedItems = await this.prepareOrderItems(reqDto.items);
    const totals = this.calculateTotals(preparedItems, reqDto.vatRate);

    const order = await this.db.transaction(async (tx) => {
      const [createdOrder] = await tx
        .insert(orders)
        .values({
          clientId: reqDto.clientId,
          code: reqDto.code,
          prNumber: reqDto.prNumber,
          dueDate: this.formatDateOnly(reqDto.dueDate),
          note: reqDto.note ?? null,
          vatRate: reqDto.vatRate,
          subTotal: totals.subTotal,
          vatAmount: totals.vatAmount,
          totalAfterVat: totals.totalAfterVat,
          status: OrderStatus.PendingApproval,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      await tx.insert(orderItems).values(
        preparedItems.map((item) => ({
          orderId: createdOrder.id,
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
      );

      return createdOrder;
    });

    return this.getOrderDetail(order.id);
  }

  /**
   * Gets full commercial order detail including financial fields and PO files.
   *
   * @param orderId - Order identifier from the route.
   * @returns Commercial order detail.
   */
  async getOrderDetail(orderId: string): Promise<OrderResDto> {
    const order = await this.getOrderEntity(orderId);

    return this.mapOrder(order);
  }

  /**
   * Updates an editable order and moves rejected orders back to pending approval.
   *
   * @param orderId - Order identifier from the route.
   * @param reqDto - Editable header fields and optional replacement item lines.
   * @param userId - Authenticated user identifier used as updater.
   * @returns Updated commercial order detail.
   */
  async updateOrder(
    orderId: string,
    reqDto: UpdateOrderReqDto,
    userId: string,
  ): Promise<OrderResDto> {
    const order = await this.getOrderEntity(orderId);
    this.ensureOrderEditable(order);
    this.ensureVatRateAllowed(reqDto.vatRate);

    await Promise.all([
      reqDto.clientId ? this.ensureClientExists(reqDto.clientId) : Promise.resolve(),
      reqDto.code ? this.ensureOrderCodeAvailable(reqDto.code, orderId) : Promise.resolve(),
    ]);

    const preparedItems =
      reqDto.items === undefined
        ? this.mapExistingItemsForTotals(order.items)
        : await this.prepareOrderItems(reqDto.items);
    const vatRate = reqDto.vatRate ?? order.vatRate;
    const totals = this.calculateTotals(preparedItems, vatRate);
    const updatedAt = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          clientId: reqDto.clientId,
          code: reqDto.code,
          prNumber: reqDto.prNumber,
          dueDate: reqDto.dueDate ? this.formatDateOnly(reqDto.dueDate) : undefined,
          note: reqDto.note,
          vatRate,
          subTotal: totals.subTotal,
          vatAmount: totals.vatAmount,
          totalAfterVat: totals.totalAfterVat,
          status: OrderStatus.PendingApproval,
          approvedBy: null,
          approvedAt: null,
          rejectedBy: null,
          rejectedAt: null,
          rejectedReason: null,
          updatedBy: userId,
          updatedAt,
        })
        .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)));

      if (reqDto.items === undefined) {
        return;
      }

      await tx
        .update(orderItems)
        .set({
          deletedAt: updatedAt,
          updatedAt,
        })
        .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)));

      await tx.insert(orderItems).values(
        preparedItems.map((item) => ({
          orderId,
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
      );
    });

    return this.getOrderDetail(orderId);
  }

  /**
   * Soft-deletes an order before it is approved.
   *
   * @param orderId - Order identifier from the route.
   * @param userId - Authenticated user identifier used as updater.
   * @returns Deleted order detail as it was before deletion.
   */
  async deleteOrder(orderId: string, userId: string): Promise<OrderResDto> {
    const order = await this.getOrderEntity(orderId);
    this.ensureOrderEditable(order);

    const response = this.mapOrder(order);
    const deletedAt = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          deletedAt,
          updatedAt: deletedAt,
          updatedBy: userId,
        })
        .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)));

      await tx
        .update(orderItems)
        .set({
          deletedAt,
          updatedAt: deletedAt,
        })
        .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)));

      await tx
        .update(orderFiles)
        .set({
          deletedAt,
          updatedAt: deletedAt,
        })
        .where(and(eq(orderFiles.orderId, orderId), isNull(orderFiles.deletedAt)));
    });

    return response;
  }

  /**
   * Approves a pending order.
   *
   * @param orderId - Order identifier from the route.
   * @param userId - Authenticated director/admin identifier.
   * @returns Approved commercial order detail.
   */
  async approveOrder(orderId: string, userId: string): Promise<OrderResDto> {
    const order = await this.getOrderEntity(orderId);
    this.ensureOrderPendingApproval(order);

    const approvedAt = new Date();

    await this.db
      .update(orders)
      .set({
        status: OrderStatus.Approved,
        approvedBy: userId,
        approvedAt,
        rejectedBy: null,
        rejectedAt: null,
        rejectedReason: null,
        updatedBy: userId,
        updatedAt: approvedAt,
      })
      .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)));

    return this.getOrderDetail(orderId);
  }

  /**
   * Rejects a pending order with a required reason.
   *
   * @param orderId - Order identifier from the route.
   * @param reqDto - Rejection reason.
   * @param userId - Authenticated director/admin identifier.
   * @returns Rejected commercial order detail.
   */
  async rejectOrder(
    orderId: string,
    reqDto: RejectOrderReqDto,
    userId: string,
  ): Promise<OrderResDto> {
    const order = await this.getOrderEntity(orderId);
    this.ensureOrderPendingApproval(order);

    const rejectedAt = new Date();

    await this.db
      .update(orders)
      .set({
        status: OrderStatus.Rejected,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: userId,
        rejectedAt,
        rejectedReason: reqDto.rejectedReason,
        updatedBy: userId,
        updatedAt: rejectedAt,
      })
      .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)));

    return this.getOrderDetail(orderId);
  }

  /**
   * Uploads a customer PO PDF to an editable order.
   *
   * @param orderId - Order identifier from the route.
   * @param file - Uploaded PDF file from multipart form-data.
   * @param userId - Authenticated user identifier used as uploader.
   * @returns Created order file metadata.
   */
  async uploadOrderPdf(
    orderId: string,
    file: OrderStoredFile | undefined,
    userId: string,
  ): Promise<OrderFileResDto> {
    const uploadedFile = this.ensureUploadedOrderPdfAllowed(file);
    const fileName = `${orderId}-${randomUUID()}.pdf`;
    const relativeFilePath = `${ORDER_PDF_PUBLIC_DIR}/${fileName}`;
    const targetFilePath = join(ORDER_PDF_UPLOAD_DIR, fileName);
    let isFileMoved = false;

    try {
      const order = await this.getOrderEntity(orderId);
      this.ensureOrderEditable(order);

      await rename(uploadedFile.path, targetFilePath);
      isFileMoved = true;

      const [createdFile] = await this.db
        .insert(orderFiles)
        .values({
          orderId,
          fileType: OrderFileType.OrderPdf,
          originalName: uploadedFile.originalname,
          fileName,
          mimeType: uploadedFile.mimetype,
          fileSize: uploadedFile.size,
          filePath: relativeFilePath,
          uploadedBy: userId,
        })
        .returning();

      return this.mapOrderFile(createdFile);
    } catch (error) {
      await this.deleteLocalFile(isFileMoved ? targetFilePath : uploadedFile.path);
      throw error;
    }
  }

  /**
   * Soft-deletes a PO PDF on an editable order.
   *
   * @param orderId - Order identifier from the route.
   * @param fileId - Order file identifier from the route.
   * @param userId - Authenticated user identifier used as updater.
   * @returns Deleted order file metadata.
   */
  async deleteOrderFile(orderId: string, fileId: string, userId: string): Promise<OrderFileResDto> {
    const order = await this.getOrderEntity(orderId);
    this.ensureOrderEditable(order);

    const file = await this.getOrderPdfFile(orderId, fileId);
    const deletedAt = new Date();

    await this.db
      .update(orderFiles)
      .set({
        deletedAt,
        updatedAt: deletedAt,
      })
      .where(
        and(
          eq(orderFiles.id, fileId),
          eq(orderFiles.orderId, orderId),
          eq(orderFiles.fileType, OrderFileType.OrderPdf),
          isNull(orderFiles.deletedAt),
        ),
      );

    await this.db
      .update(orders)
      .set({
        updatedBy: userId,
        updatedAt: deletedAt,
      })
      .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)));

    await this.deleteLocalFile(this.resolveLocalFilePath(file.filePath));

    return file;
  }

  /**
   * Lists finished-good product options for commercial order entry.
   *
   * @param q - Optional keyword searched by product code or name.
   * @returns Product options with default sale price and technical files.
   */
  async getProductOptions(q?: string): Promise<OrderProductOptionResDto[]> {
    const keyword = q ? `%${q}%` : undefined;
    const productEntities = await this.db.query.products.findMany({
      where: and(
        isNull(products.deletedAt),
        eq(products.itemType, ProductItemType.Fg),
        keyword ? or(ilike(products.code, keyword), ilike(products.name, keyword)) : undefined,
      ),
      with: {
        unit: true,
        files: {
          where: and(
            eq(productFiles.fileType, ProductFileType.TechnicalAttachment),
            isNull(productFiles.deletedAt),
          ),
          orderBy: desc(productFiles.createdAt),
        },
      },
      limit: 20,
      orderBy: desc(products.createdAt),
    });

    return plainToInstance(
      OrderProductOptionResDto,
      productEntities.map((product) => ({
        id: product.id,
        code: product.code,
        name: product.name,
        unit: product.unit?.code ?? product.unit?.name ?? null,
        defaultSalePrice: Number(product.defaultSalePrice),
        technicalFiles: this.buildProductFileResponses(product.files),
      })),
      { excludeExtraneousValues: true },
    );
  }

  /**
   * Lists approved orders for production without financial fields or PO PDF metadata.
   *
   * @param reqDto - Query filters and pagination options.
   * @returns Paginated production-safe order response.
   */
  async getProductionOrders(
    reqDto: GetOrdersReqDto,
  ): Promise<OffsetPaginatedDto<OrderProductionResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const keywordClientIds = keyword ? await this.getKeywordClientIds(keyword) : [];
    const where = and(
      isNull(orders.deletedAt),
      eq(orders.status, OrderStatus.Approved),
      reqDto.clientId ? eq(orders.clientId, reqDto.clientId) : undefined,
      keyword
        ? or(
            ilike(orders.code, keyword),
            ilike(orders.prNumber, keyword),
            keywordClientIds.length > 0 ? inArray(orders.clientId, keywordClientIds) : undefined,
          )
        : undefined,
    );

    const [entities, totalRows] = await Promise.all([
      this.db.query.orders.findMany({
        where,
        with: this.getOrderRelations(),
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(orders.createdAt),
      }),
      this.db.select({ total: count() }).from(orders).where(where),
    ]);

    return new OffsetPaginatedDto(
      this.mapProductionOrders(entities),
      new OffsetPaginationDto(totalRows[0]?.total ?? 0, reqDto),
    );
  }

  /**
   * Gets approved order detail for production without financial fields or PO PDF metadata.
   *
   * @param orderId - Order identifier from the route.
   * @returns Production-safe order detail.
   */
  async getProductionOrderDetail(orderId: string): Promise<OrderProductionResDto> {
    const order = await this.getOrderEntity(orderId);

    if (order.status !== OrderStatus.Approved) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }

    return this.mapProductionOrder(order);
  }

  private getOrderRelations() {
    return {
      client: true,
      items: {
        where: isNull(orderItems.deletedAt),
        with: {
          product: {
            with: {
              files: {
                where: and(
                  eq(productFiles.fileType, ProductFileType.TechnicalAttachment),
                  isNull(productFiles.deletedAt),
                ),
                orderBy: desc(productFiles.createdAt),
              },
            },
          },
        },
        orderBy: orderItems.createdAt,
      },
      files: {
        where: and(eq(orderFiles.fileType, OrderFileType.OrderPdf), isNull(orderFiles.deletedAt)),
        orderBy: desc(orderFiles.createdAt),
      },
    } as const;
  }

  private async getOrderEntity(orderId: string): Promise<OrderEntityWithRelations> {
    const order = await this.db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), isNull(orders.deletedAt)),
      with: this.getOrderRelations(),
    });

    if (!order) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }

    return order;
  }

  private async getOrderPdfFile(orderId: string, fileId: string): Promise<OrderFileResDto> {
    const file = await this.db.query.orderFiles.findFirst({
      where: and(
        eq(orderFiles.id, fileId),
        eq(orderFiles.orderId, orderId),
        eq(orderFiles.fileType, OrderFileType.OrderPdf),
        isNull(orderFiles.deletedAt),
      ),
    });

    if (!file) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }

    return this.mapOrderFile(file);
  }

  private async ensureClientExists(clientId: string): Promise<void> {
    const existingClient = await this.db.query.clients.findFirst({
      columns: { id: true },
      where: and(eq(clients.id, clientId), isNull(clients.deletedAt)),
    });

    if (!existingClient) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }
  }

  private async getKeywordClientIds(keyword: string): Promise<string[]> {
    const clientRows = await this.db.query.clients.findMany({
      columns: { id: true },
      where: and(
        isNull(clients.deletedAt),
        or(ilike(clients.fullName, keyword), ilike(clients.code, keyword)),
      ),
      limit: 50,
    });

    return clientRows.map((client) => client.id);
  }

  private async ensureOrderCodeAvailable(code: string, ignoredOrderId?: string): Promise<void> {
    const existingOrder = await this.db.query.orders.findFirst({
      columns: { id: true },
      where: and(eq(orders.code, code), ignoredOrderId ? ne(orders.id, ignoredOrderId) : undefined),
    });

    if (existingOrder) {
      throw new AppException(ErrorCode.E005, HttpStatus.CONFLICT);
    }
  }

  private ensureVatRateAllowed(vatRate: number | undefined): void {
    if (vatRate === undefined) {
      return;
    }

    if (
      !OrdersService.ALLOWED_VAT_RATES.includes(
        vatRate as (typeof OrdersService.ALLOWED_VAT_RATES)[number],
      )
    ) {
      throw new AppException(ErrorCode.V002, HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }

  private ensureOrderEditable(order: Pick<typeof orders.$inferSelect, 'status'>): void {
    if (![OrderStatus.PendingApproval, OrderStatus.Rejected].includes(order.status)) {
      throw new AppException(ErrorCode.E006, HttpStatus.CONFLICT, 'Order is approved or locked');
    }
  }

  private ensureOrderPendingApproval(order: Pick<typeof orders.$inferSelect, 'status'>): void {
    if (order.status !== OrderStatus.PendingApproval) {
      throw new AppException(ErrorCode.V002, HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }

  private async prepareOrderItems(items: CreateOrderItemReqDto[]): Promise<PreparedOrderItem[]> {
    const productIds = [...new Set(items.map((item) => item.productId))];
    const productEntities = await this.db.query.products.findMany({
      where: and(inArray(products.id, productIds), isNull(products.deletedAt)),
      with: {
        unit: true,
      },
    });
    const productById = new Map(productEntities.map((product) => [product.id, product]));

    return items.map((item) => {
      const product = productById.get(item.productId);

      if (!product) {
        throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
      }

      const unit = item.unit || product.unit?.code || product.unit?.name;

      if (!unit) {
        throw new AppException(ErrorCode.V002, HttpStatus.UNPROCESSABLE_ENTITY);
      }

      const quantity = this.formatQuantity(item.quantity);
      const unitPrice = this.formatMoney(Number(product.defaultSalePrice));
      const lineTotal = this.formatMoney(Number(quantity) * Number(unitPrice));

      return {
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        unit,
        quantity,
        unitPrice,
        lineTotal,
      };
    });
  }

  private mapExistingItemsForTotals(items: OrderItemEntityWithRelations[]): PreparedOrderItem[] {
    return items.map((item) => ({
      productId: item.productId,
      productCode: item.productCode,
      productName: item.productName,
      unit: item.unit,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    }));
  }

  private calculateTotals(
    items: Array<Pick<PreparedOrderItem, 'lineTotal'>>,
    vatRate: number,
  ): OrderTotals {
    const subTotalValue = items.reduce((total, item) => total + Number(item.lineTotal), 0);
    const vatAmountValue = subTotalValue * (vatRate / 100);
    const totalAfterVatValue = subTotalValue + vatAmountValue;

    return {
      subTotal: this.formatMoney(subTotalValue),
      vatAmount: this.formatMoney(vatAmountValue),
      totalAfterVat: this.formatMoney(totalAfterVatValue),
    };
  }

  private ensureUploadedOrderPdfAllowed(file: OrderStoredFile | undefined): OrderStoredFile {
    if (!file) {
      throw new AppException(ErrorCode.V002, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const isPdfMime = file.mimetype === ORDER_PDF_ALLOWED_MIME_TYPE;
    const isPdfExtension = extname(file.originalname).toLowerCase() === '.pdf';
    const isAllowedFileSize = file.size <= MAX_ORDER_PDF_SIZE_IN_BYTES;

    if ((!isPdfMime && !isPdfExtension) || !isAllowedFileSize) {
      void this.deleteLocalFile(file.path);
      throw new AppException(ErrorCode.V002, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    return file;
  }

  private formatDateOnly(value: Date): string;
  private formatDateOnly(value: string): string;
  private formatDateOnly(value: Date | string): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }

    return value.toISOString().slice(0, 10);
  }

  private formatQuantity(value: number): string {
    return Number(value).toFixed(3);
  }

  private formatMoney(value: number): string {
    return Number(value).toFixed(2);
  }

  private resolveLocalFilePath(filePath: string): string {
    return isAbsolute(filePath) ? filePath : join(process.cwd(), filePath);
  }

  private async deleteLocalFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch {
      return;
    }
  }

  private mapOrders(orderEntities: OrderEntityWithRelations[]): OrderResDto[] {
    return orderEntities.map((order) => this.mapOrder(order));
  }

  private mapOrder(order: OrderEntityWithRelations): OrderResDto {
    return plainToInstance(
      OrderResDto,
      {
        ...order,
        items: this.buildOrderItemResponses(order.items),
        files: this.buildOrderFileResponses(order.files),
      },
      { excludeExtraneousValues: true },
    );
  }

  private mapProductionOrders(orderEntities: OrderEntityWithRelations[]): OrderProductionResDto[] {
    return orderEntities.map((order) => this.mapProductionOrder(order));
  }

  private mapProductionOrder(order: OrderEntityWithRelations): OrderProductionResDto {
    return plainToInstance(
      OrderProductionResDto,
      {
        id: order.id,
        client: order.client,
        code: order.code,
        prNumber: order.prNumber,
        dueDate: order.dueDate,
        note: order.note,
        status: order.status,
        items: this.buildOrderItemResponses(order.items),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
      { excludeExtraneousValues: true },
    );
  }

  private mapOrderFile(file: typeof orderFiles.$inferSelect): OrderFileResDto {
    return plainToInstance(OrderFileResDto, this.buildOrderFileResponse(file), {
      excludeExtraneousValues: true,
    });
  }

  private buildOrderItemResponses(items: OrderItemEntityWithRelations[]) {
    return items.map((item) => ({
      ...item,
      imageUrl: item.product?.imageUrl ?? null,
      technicalFiles: this.buildProductFileResponses(item.product?.files ?? []),
    }));
  }

  private buildOrderFileResponses(files: (typeof orderFiles.$inferSelect)[]) {
    return files.map((file) => this.buildOrderFileResponse(file));
  }

  private buildOrderFileResponse(file: typeof orderFiles.$inferSelect) {
    return {
      ...file,
      url: `/${file.filePath}`,
    };
  }

  private buildProductFileResponses(files: (typeof productFiles.$inferSelect)[]) {
    return plainToInstance(
      ProductFileResDto,
      files.map((file) => ({
        ...file,
        url: `/${file.filePath}`,
      })),
      { excludeExtraneousValues: true },
    );
  }
}

type OrderEntityWithRelations = typeof orders.$inferSelect & {
  client: typeof clients.$inferSelect;
  items: OrderItemEntityWithRelations[];
  files: (typeof orderFiles.$inferSelect)[];
};

type OrderItemEntityWithRelations = typeof orderItems.$inferSelect & {
  product: (typeof products.$inferSelect & { files: (typeof productFiles.$inferSelect)[] }) | null;
};

type PreparedOrderItem = {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
};

type OrderTotals = {
  subTotal: string;
  vatAmount: string;
  totalAfterVat: string;
};
