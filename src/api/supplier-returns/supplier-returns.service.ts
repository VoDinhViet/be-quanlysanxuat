import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, eq, exists, or, sql } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  inventoryReceipts,
  iqcInspections,
  items,
  purchaseOrders,
  supplierReturns,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { GetSupplierReturnsReqDto } from './dto/get-supplier-returns.req.dto';
import { PageSupplierReturnResDto } from './dto/page-supplier-return.res.dto';
import { SupplierReturnResDto } from './dto/supplier-return.res.dto';

@Injectable()
export class SupplierReturnsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getSupplierReturns(
    reqDto: GetSupplierReturnsReqDto,
  ): Promise<OffsetPaginatedDto<PageSupplierReturnResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const materialKeyword = reqDto.materialKeyword
      ? `%${reqDto.materialKeyword}%`
      : undefined;
    const poKeyword = reqDto.poCode ? `%${reqDto.poCode}%` : undefined;
    const nkKeyword = reqDto.nkCode ? `%${reqDto.nkCode}%` : undefined;

    const where = and(
      keyword ? unaccentILike(supplierReturns.code, keyword) : undefined,
      reqDto.supplierId
        ? eq(supplierReturns.supplierId, reqDto.supplierId)
        : undefined,
      reqDto.status ? eq(supplierReturns.status, reqDto.status) : undefined,
      reqDto.iqcCode
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(iqcInspections)
              .where(
                and(
                  eq(iqcInspections.id, supplierReturns.iqcId),
                  unaccentILike(iqcInspections.code, `%${reqDto.iqcCode}%`),
                ),
              ),
          )
        : undefined,
      materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(items)
              .where(
                and(
                  eq(items.id, supplierReturns.itemId),
                  or(
                    unaccentILike(items.name, materialKeyword),
                    unaccentILike(items.code, materialKeyword),
                  ),
                ),
              ),
          )
        : undefined,
      poKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(purchaseOrders)
              .where(
                and(
                  eq(purchaseOrders.id, supplierReturns.purchaseOrderId),
                  unaccentILike(purchaseOrders.code, poKeyword),
                ),
              ),
          )
        : undefined,
      nkKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(inventoryReceipts)
              .where(
                and(
                  eq(inventoryReceipts.id, supplierReturns.inventoryReceiptId),
                  unaccentILike(inventoryReceipts.code, nkKeyword),
                ),
              ),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.supplierReturns.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(supplierReturns.createdAt),
        with: {
          item: { with: { unit: true } },
          supplier: true,
          warehouse: true,
          purchaseOrder: true,
          inventoryReceipt: true,
          iqc: true,
          creatorBy: true,
        },
      }),
      this.db.select({ total: count() }).from(supplierReturns).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageSupplierReturnResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getSupplierReturn(
    supplierReturnId: string,
  ): Promise<SupplierReturnResDto> {
    const row = await this.db.query.supplierReturns.findFirst({
      where: eq(supplierReturns.id, supplierReturnId),
      with: {
        item: { with: { unit: true } },
        supplier: true,
        warehouse: true,
        purchaseOrder: true,
        inventoryReceipt: true,
        iqc: true,
        creatorBy: true,
      },
    });

    if (!row) {
      throw new AppException(ErrorCode.E137, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(SupplierReturnResDto, row, {
      excludeExtraneousValues: true,
    });
  }
}
