import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, count, eq, or } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  inventoryBalances,
  inventoryIssues,
  inventoryReceipts,
  inventoryTransactions,
  warehouses,
  WarehouseStatus,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateWarehouseReqDto } from './dto/create-warehouse.req.dto';
import { GetWarehousesReqDto } from './dto/get-warehouses.req.dto';
import { UpdateWarehouseReqDto } from './dto/update-warehouse.req.dto';
import { WarehouseResDto } from './dto/warehouse.res.dto';

@Injectable()
export class WarehousesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getWarehouses(
    reqDto: GetWarehousesReqDto,
  ): Promise<OffsetPaginatedDto<WarehouseResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      keyword
        ? or(
            unaccentILike(warehouses.code, keyword),
            unaccentILike(warehouses.name, keyword),
          )
        : undefined,
      reqDto.type ? eq(warehouses.type, reqDto.type) : undefined,
      reqDto.status ? eq(warehouses.status, reqDto.status) : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.warehouses.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: asc(warehouses.code),
      }),
      this.db.select({ total: count() }).from(warehouses).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(WarehouseResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Không phân trang — luôn trả cả danh sách cho dropdown, giới hạn 100, chỉ kho `ACTIVE`. */
  async getWarehouseOptions(): Promise<WarehouseResDto[]> {
    const entities = await this.db.query.warehouses.findMany({
      where: eq(warehouses.status, WarehouseStatus.ACTIVE),
      orderBy: asc(warehouses.name),
      limit: 100,
    });

    return plainToInstance(WarehouseResDto, entities, {
      excludeExtraneousValues: true,
    });
  }

  async getWarehouseDetail(warehouseId: string): Promise<WarehouseResDto> {
    const warehouse = await this.ensureWarehouseExists(warehouseId);

    return plainToInstance(WarehouseResDto, warehouse, {
      excludeExtraneousValues: true,
    });
  }

  async createWarehouse(
    reqDto: CreateWarehouseReqDto,
  ): Promise<WarehouseResDto> {
    let code = reqDto.code;
    if (code) {
      await this.validateCodeUniqueness(code);
    } else {
      code = await this.generateWarehouseCode();
    }

    const [warehouse] = await this.db
      .insert(warehouses)
      .values({ ...reqDto, code })
      .returning();

    return plainToInstance(WarehouseResDto, warehouse, {
      excludeExtraneousValues: true,
    });
  }

  async updateWarehouse(
    warehouseId: string,
    reqDto: UpdateWarehouseReqDto,
  ): Promise<WarehouseResDto> {
    await this.ensureWarehouseExists(warehouseId);

    const [warehouse] = await this.db
      .update(warehouses)
      .set(reqDto)
      .where(eq(warehouses.id, warehouseId))
      .returning();

    return plainToInstance(WarehouseResDto, warehouse, {
      excludeExtraneousValues: true,
    });
  }

  /** Hard delete — `warehouses` không soft delete. Chặn khi kho còn phiếu/bút toán/tồn tham chiếu
   * tới (`E095`) — cả ba FK đều `restrict`, không kiểm trước sẽ lộ 500 thô thay vì 409 sạch. */
  async deleteWarehouse(warehouseId: string): Promise<void> {
    await this.ensureWarehouseExists(warehouseId);
    await this.ensureWarehouseNotInUse(warehouseId);

    await this.db.delete(warehouses).where(eq(warehouses.id, warehouseId));
  }

  async ensureWarehouseExists(warehouseId: string) {
    const existing = await this.db.query.warehouses.findFirst({
      where: eq(warehouses.id, warehouseId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E092, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  /** Dùng bởi `InventoryReceiptsService`/`InventoryIssuesService` trước khi lập/post phiếu —
   * throw `E094` nếu kho không `ACTIVE`, không kiểm ràng buộc loại hàng (`docs/domains/inventory.md`). */
  async ensureWarehouseActive(warehouseId: string): Promise<void> {
    const warehouse = await this.ensureWarehouseExists(warehouseId);

    if (warehouse.status !== WarehouseStatus.ACTIVE) {
      throw new AppException(ErrorCode.E094, HttpStatus.BAD_REQUEST);
    }
  }

  private async generateWarehouseCode(): Promise<string> {
    const [totalRows] = await this.db
      .select({ total: count() })
      .from(warehouses);
    return `KHO${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }

  private async validateCodeUniqueness(code: string): Promise<void> {
    const existing = await this.db.query.warehouses.findFirst({
      columns: { id: true },
      where: eq(warehouses.code, code),
    });

    if (existing) {
      throw new AppException(ErrorCode.E093, HttpStatus.CONFLICT);
    }
  }

  private async ensureWarehouseNotInUse(warehouseId: string): Promise<void> {
    const [usedInReceipt, usedInIssue, usedInTransaction, usedInBalance] =
      await Promise.all([
        this.db.query.inventoryReceipts.findFirst({
          columns: { id: true },
          where: eq(inventoryReceipts.warehouseId, warehouseId),
        }),
        this.db.query.inventoryIssues.findFirst({
          columns: { id: true },
          where: eq(inventoryIssues.warehouseId, warehouseId),
        }),
        this.db.query.inventoryTransactions.findFirst({
          columns: { id: true },
          where: eq(inventoryTransactions.warehouseId, warehouseId),
        }),
        this.db.query.inventoryBalances.findFirst({
          columns: { id: true },
          where: eq(inventoryBalances.warehouseId, warehouseId),
        }),
      ]);

    if (usedInReceipt || usedInIssue || usedInTransaction || usedInBalance) {
      throw new AppException(ErrorCode.E095, HttpStatus.CONFLICT);
    }
  }
}
