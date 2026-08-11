import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  count,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  lt,
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
  items,
  PurchaseRequestStatus,
  purchaseRequestItems,
  purchaseRequests,
  purchaseQuotationItems,
  purchaseQuotations,
  suppliers,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateQuotationItemReqDto } from './dto/create-quotation-item.req.dto';
import { CreateQuotationReqDto } from './dto/create-quotation.req.dto';
import { GetQuotationsReqDto } from './dto/get-quotations.req.dto';
import { PageQuotationResDto } from './dto/page-quotation.res.dto';
import { QuotationResDto } from './dto/quotation.res.dto';

@Injectable()
export class PurchaseQuotationsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getQuotations(
    reqDto: GetQuotationsReqDto,
  ): Promise<OffsetPaginatedDto<PageQuotationResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const materialKeyword = reqDto.materialKeyword
      ? `%${reqDto.materialKeyword}%`
      : undefined;

    const where = and(
      keyword ? unaccentILike(purchaseQuotations.code, keyword) : undefined,
      reqDto.status ? eq(purchaseQuotations.status, reqDto.status) : undefined,
      reqDto.purchaseRequestId || reqDto.supplierId || materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(purchaseQuotationItems)
              .innerJoin(
                purchaseRequestItems,
                eq(
                  purchaseRequestItems.id,
                  purchaseQuotationItems.purchaseRequestItemId,
                ),
              )
              .innerJoin(items, eq(items.id, purchaseRequestItems.itemId))
              .where(
                and(
                  eq(purchaseQuotationItems.quotationId, purchaseQuotations.id),
                  reqDto.purchaseRequestId
                    ? eq(
                        purchaseRequestItems.purchaseRequestId,
                        reqDto.purchaseRequestId,
                      )
                    : undefined,
                  reqDto.supplierId
                    ? eq(purchaseQuotationItems.supplierId, reqDto.supplierId)
                    : undefined,
                  materialKeyword
                    ? or(
                        unaccentILike(items.name, materialKeyword),
                        unaccentILike(items.code, materialKeyword),
                      )
                    : undefined,
                ),
              ),
          )
        : undefined,
      reqDto.fromDate
        ? gte(purchaseQuotations.quotationDate, reqDto.fromDate)
        : undefined,
      reqDto.toDate
        ? lt(
            purchaseQuotations.quotationDate,
            new Date(reqDto.toDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.purchaseQuotations.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(purchaseQuotations.createdAt),
        with: {
          creatorBy: true,
          items: {
            with: {
              purchaseRequestItem: {
                with: { purchaseRequest: true, item: { with: { unit: true } } },
              },
              supplier: true,
            },
          },
        },
      }),
      this.db.select({ total: count() }).from(purchaseQuotations).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageQuotationResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getQuotation(quotationId: string): Promise<QuotationResDto> {
    const quotation = await this.db.query.purchaseQuotations.findFirst({
      where: eq(purchaseQuotations.id, quotationId),
      with: {
        senderBy: true,
        receiverBy: true,
        cancellerBy: true,
        creatorBy: true,
        items: {
          with: {
            purchaseRequestItem: {
              with: { purchaseRequest: true, item: { with: { unit: true } } },
            },
            supplier: true,
            selectorBy: true,
          },
        },
      },
    });

    if (!quotation) {
      throw new AppException(ErrorCode.E117, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(QuotationResDto, quotation, {
      excludeExtraneousValues: true,
    });
  }

  async createQuotation(
    reqDto: CreateQuotationReqDto,
    userId: string,
  ): Promise<void> {
    await this.ensureSuppliersExist(
      reqDto.items.map((item) => item.supplierId),
    );
    await this.validateRequestItems(reqDto.items);

    const { items: quotationItems, ...quotationFields } = reqDto;

    await this.db.transaction(async (tx) => {
      const code = await this.generateQuotationCode(tx);
      const [quotation] = await tx
        .insert(purchaseQuotations)
        .values({ ...quotationFields, code, createdBy: userId })
        .returning({ id: purchaseQuotations.id });

      await tx.insert(purchaseQuotationItems).values(
        quotationItems.map((item) => ({
          ...item,
          quotationId: quotation.id,
        })),
      );
    });
  }

  private async ensureSuppliersExist(supplierIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(supplierIds)];

    const [{ total }] = await this.db
      .select({ total: count() })
      .from(suppliers)
      .where(
        and(inArray(suppliers.id, uniqueIds), isNull(suppliers.deletedAt)),
      );

    if (total !== uniqueIds.length) {
      throw new AppException(ErrorCode.E019, HttpStatus.NOT_FOUND);
    }
  }

  /** Mỗi dòng phải trỏ đúng một dòng ĐXMH `APPROVED` chưa hủy tay, và không trùng dòng nào trong
   * cùng payload — trùng sẽ nhân đôi `quotedQuantity` của dòng đó trên sổ cái mua hàng. */
  private async validateRequestItems(
    itemsReq: CreateQuotationItemReqDto[],
  ): Promise<void> {
    const requestItemIds = itemsReq.map((item) => item.purchaseRequestItemId);
    const uniqueIds = [...new Set(requestItemIds)];

    if (uniqueIds.length !== requestItemIds.length) {
      throw new AppException(ErrorCode.E128, HttpStatus.CONFLICT);
    }

    const [{ total }] = await this.db
      .select({ total: count() })
      .from(purchaseRequestItems)
      .innerJoin(
        purchaseRequests,
        eq(purchaseRequests.id, purchaseRequestItems.purchaseRequestId),
      )
      .where(
        and(
          inArray(purchaseRequestItems.id, uniqueIds),
          eq(purchaseRequests.status, PurchaseRequestStatus.APPROVED),
          isNull(purchaseRequestItems.cancelledAt),
        ),
      );

    if (total !== uniqueIds.length) {
      throw new AppException(ErrorCode.E125, HttpStatus.CONFLICT);
    }
  }

  private async generateQuotationCode(tx: DbTransaction): Promise<string> {
    const [totalRows] = await tx
      .select({ total: count() })
      .from(purchaseQuotations);
    return `RFQ${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }
}
