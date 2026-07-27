import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  count as drizzleCount,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  or,
} from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  countries,
  supplierAttachments,
  supplierGroups,
  supplierPaymentInfo,
  supplierRepresentatives,
  suppliers,
  SupplierStatus,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { CreateSupplierReqDto } from './dto/create-supplier.req.dto';
import { GetSuppliersReqDto } from './dto/get-suppliers.req.dto';
import { SupplierResDto } from './dto/supplier.res.dto';
import { SupplierStatsResDto } from './dto/supplier-stats.res.dto';
import { UpdateSupplierReqDto } from './dto/update-supplier.req.dto';

@Injectable()
export class SuppliersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly filesService: FilesService,
  ) {}

  async getSuppliers(
    reqDto: GetSuppliersReqDto,
  ): Promise<OffsetPaginatedDto<SupplierResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      isNull(suppliers.deletedAt),
      keyword
        ? or(
            unaccentILike(suppliers.code, keyword),
            unaccentILike(suppliers.name, keyword),
            unaccentILike(suppliers.taxCode, keyword),
            inArray(
              suppliers.id,
              this.db
                .select({ id: supplierRepresentatives.supplierId })
                .from(supplierRepresentatives)
                .where(unaccentILike(supplierRepresentatives.name, keyword)),
            ),
          )
        : undefined,
      reqDto.status ? eq(suppliers.status, reqDto.status) : undefined,
      reqDto.supplierGroupId
        ? eq(suppliers.supplierGroupId, reqDto.supplierGroupId)
        : undefined,
      reqDto.countryId ? eq(suppliers.countryId, reqDto.countryId) : undefined,
    );
    const orderBy = desc(suppliers.createdAt);

    const [entities, count] = await Promise.all([
      this.db.query.suppliers.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
        with: {
          group: true,
          creator: true,
          attachments: { with: { file: true } },
          logoFile: true,
          representatives: true,
          country: true,
          payment: true,
        },
      }),
      this.db.select({ total: drizzleCount() }).from(suppliers).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(SupplierResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(count[0]?.total ?? 0, reqDto),
    );
  }

  async getSupplierStats(): Promise<SupplierStatsResDto> {
    const rows = await this.db
      .select({ status: suppliers.status, total: drizzleCount() })
      .from(suppliers)
      .where(isNull(suppliers.deletedAt))
      .groupBy(suppliers.status);

    const byStatus = Object.fromEntries(
      rows.map((row) => [row.status, row.total]),
    );

    return plainToInstance(
      SupplierStatsResDto,
      {
        total: rows.reduce((sum, row) => sum + row.total, 0),
        active: byStatus[SupplierStatus.ACTIVE] ?? 0,
        paused: byStatus[SupplierStatus.PAUSED] ?? 0,
        stopped: byStatus[SupplierStatus.STOPPED] ?? 0,
      },
      { excludeExtraneousValues: true },
    );
  }

  async getSupplierDetail(supplierId: string): Promise<SupplierResDto> {
    const supplier = await this.db.query.suppliers.findFirst({
      where: and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)),
      with: {
        group: true,
        creator: true,
        attachments: { with: { file: true } },
        logoFile: true,
        representatives: true,
        country: true,
        payment: true,
      },
    });

    if (!supplier) {
      throw new AppException(ErrorCode.E019, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(SupplierResDto, supplier, {
      excludeExtraneousValues: true,
    });
  }

  async createSupplier(
    reqDto: CreateSupplierReqDto,
    userId: string,
  ): Promise<SupplierResDto> {
    let code = reqDto.code;
    if (code) {
      await this.validateCodeUniqueness(code);
    } else {
      code = await this.generateSupplierCode();
    }

    await this.validateTaxCodeUniqueness(reqDto.taxCode);
    await this.ensureSupplierGroupExists(reqDto.supplierGroupId);
    if (reqDto.countryId) {
      await this.ensureCountryExists(reqDto.countryId);
    }
    await this.linkSuppliedFiles(reqDto);

    // `payment` / `representatives` / `attachmentFileIds` live in their own tables — peel them off
    // so the rest of the DTO spreads straight onto the `suppliers` row.
    const { payment, representatives, attachmentFileIds, ...supplierFields } =
      reqDto;

    const supplierId = await this.db.transaction(async (tx) => {
      const [supplier] = await tx
        .insert(suppliers)
        .values({
          ...supplierFields,
          code,
          status: reqDto.status ?? SupplierStatus.ACTIVE,
          createdBy: userId,
        })
        .returning();

      // Every supplier always has exactly one payment info row, created right away.
      await tx
        .insert(supplierPaymentInfo)
        .values({ supplierId: supplier.id, ...payment });

      if (attachmentFileIds?.length) {
        await this.replaceAttachments(tx, supplier.id, attachmentFileIds);
      }

      if (representatives?.length) {
        await this.replaceRepresentatives(tx, supplier.id, representatives);
      }

      return supplier.id;
    });

    return this.getSupplierDetail(supplierId);
  }

  async updateSupplier(
    supplierId: string,
    reqDto: UpdateSupplierReqDto,
  ): Promise<SupplierResDto> {
    await this.ensureSupplierExists(supplierId);

    if (reqDto.code) {
      await this.validateCodeUniqueness(reqDto.code, supplierId);
    }
    if (reqDto.taxCode) {
      await this.validateTaxCodeUniqueness(reqDto.taxCode, supplierId);
    }
    if (reqDto.supplierGroupId) {
      await this.ensureSupplierGroupExists(reqDto.supplierGroupId);
    }
    if (reqDto.countryId) {
      await this.ensureCountryExists(reqDto.countryId);
    }
    await this.linkSuppliedFiles(reqDto);

    const { payment, representatives, attachmentFileIds, ...supplierFields } =
      reqDto;

    await this.db.transaction(async (tx) => {
      // `updated_at` is bumped by the column's own `$onUpdate`.
      await tx
        .update(suppliers)
        .set(supplierFields)
        .where(eq(suppliers.id, supplierId));

      if (payment) {
        // The payment info row always exists (created in createSupplier); only the fields
        // actually sent are overwritten, everything else keeps its current value.
        await tx
          .update(supplierPaymentInfo)
          .set(payment)
          .where(eq(supplierPaymentInfo.supplierId, supplierId));
      }

      if (attachmentFileIds) {
        await this.replaceAttachments(tx, supplierId, attachmentFileIds);
      }

      if (representatives) {
        await this.replaceRepresentatives(tx, supplierId, representatives);
      }
    });

    return this.getSupplierDetail(supplierId);
  }

  async deleteSupplier(supplierId: string): Promise<void> {
    await this.ensureSupplierExists(supplierId);

    await this.db
      .update(suppliers)
      .set({ deletedAt: new Date() })
      .where(eq(suppliers.id, supplierId));
  }

  /**
   * Validates every file id the request carries and marks them linked, so the orphan sweeper
   * leaves them alone. Runs **before** the transaction on purpose — see `FilesService.linkFiles`.
   */
  private async linkSuppliedFiles(
    reqDto: CreateSupplierReqDto | UpdateSupplierReqDto,
  ): Promise<void> {
    const fileIds = [
      reqDto.logoFileId,
      ...(reqDto.attachmentFileIds ?? []),
    ].filter((id): id is string => Boolean(id));

    await this.filesService.linkFiles(fileIds);
  }

  /** Replace-all. `tx` is required so a caller cannot accidentally write outside the transaction. */
  private async replaceAttachments(
    tx: DbTransaction,
    supplierId: string,
    attachmentFileIds: string[],
  ): Promise<void> {
    await tx
      .delete(supplierAttachments)
      .where(eq(supplierAttachments.supplierId, supplierId));

    if (attachmentFileIds.length) {
      await tx
        .insert(supplierAttachments)
        .values(attachmentFileIds.map((fileId) => ({ supplierId, fileId })));
    }
  }

  private async replaceRepresentatives(
    tx: DbTransaction,
    supplierId: string,
    representatives: CreateSupplierReqDto['representatives'],
  ): Promise<void> {
    await tx
      .delete(supplierRepresentatives)
      .where(eq(supplierRepresentatives.supplierId, supplierId));

    if (representatives?.length) {
      await tx.insert(supplierRepresentatives).values(
        representatives.map((representative) => ({
          supplierId,
          name: representative.name,
          phoneNumber: representative.phoneNumber,
          isPrimary: representative.isPrimary ?? false,
        })),
      );
    }
  }

  private async ensureSupplierExists(supplierId: string) {
    const existing = await this.db.query.suppliers.findFirst({
      where: and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E019, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private async validateCodeUniqueness(
    code: string,
    ignoredSupplierId?: string,
  ): Promise<void> {
    const where = ignoredSupplierId
      ? and(eq(suppliers.code, code), ne(suppliers.id, ignoredSupplierId))
      : eq(suppliers.code, code);

    const existing = await this.db.query.suppliers.findFirst({
      columns: { id: true },
      where,
    });

    if (existing) {
      throw new AppException(ErrorCode.E020, HttpStatus.CONFLICT);
    }
  }

  private async validateTaxCodeUniqueness(
    taxCode: string,
    ignoredSupplierId?: string,
  ): Promise<void> {
    const where = ignoredSupplierId
      ? and(eq(suppliers.taxCode, taxCode), ne(suppliers.id, ignoredSupplierId))
      : eq(suppliers.taxCode, taxCode);

    const existing = await this.db.query.suppliers.findFirst({
      columns: { id: true },
      where,
    });

    if (existing) {
      throw new AppException(ErrorCode.E022, HttpStatus.CONFLICT);
    }
  }

  private async ensureSupplierGroupExists(
    supplierGroupId: string,
  ): Promise<void> {
    const existing = await this.db.query.supplierGroups.findFirst({
      columns: { id: true },
      where: eq(supplierGroups.id, supplierGroupId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E021, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureCountryExists(countryId: string): Promise<void> {
    const existing = await this.db.query.countries.findFirst({
      columns: { id: true },
      where: eq(countries.id, countryId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E023, HttpStatus.NOT_FOUND);
    }
  }

  private async generateSupplierCode(): Promise<string> {
    const [totalRows] = await this.db
      .select({ total: drizzleCount() })
      .from(suppliers);
    return `NCC${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }
}
