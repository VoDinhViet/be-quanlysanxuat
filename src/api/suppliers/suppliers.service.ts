import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count as drizzleCount, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
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
import { CreateSupplierReqDto } from './dto/create-supplier.req.dto';
import { GetSuppliersReqDto } from './dto/get-suppliers.req.dto';
import { SupplierResDto } from './dto/supplier.res.dto';
import { SupplierStatsResDto } from './dto/supplier-stats.res.dto';
import { UpdateSupplierReqDto } from './dto/update-supplier.req.dto';

@Injectable()
export class SuppliersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getSuppliers(reqDto: GetSuppliersReqDto): Promise<OffsetPaginatedDto<SupplierResDto>> {
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
      reqDto.supplierGroupId ? eq(suppliers.supplierGroupId, reqDto.supplierGroupId) : undefined,
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
          attachments: true,
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

    const byStatus = Object.fromEntries(rows.map((row) => [row.status, row.total]));

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
        attachments: true,
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

  async createSupplier(reqDto: CreateSupplierReqDto, userId: string): Promise<SupplierResDto> {
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

    const [supplier] = await this.db
      .insert(suppliers)
      .values({
        code,
        name: reqDto.name,
        supplierGroupId: reqDto.supplierGroupId,
        type: reqDto.type,
        taxCode: reqDto.taxCode,
        phoneNumber: reqDto.phoneNumber,
        email: reqDto.email,
        address: reqDto.address,
        note: reqDto.note,
        logoUrl: reqDto.logoUrl,
        countryId: reqDto.countryId,
        rating: reqDto.rating,
        status: reqDto.status ?? SupplierStatus.ACTIVE,
        internalNote: reqDto.internalNote,
        createdBy: userId,
      })
      .returning();

    // Every supplier always has exactly one payment info row, created right away.
    await this.db.insert(supplierPaymentInfo).values({
      supplierId: supplier.id,
      bankName: reqDto.payment?.bankName,
      bankAccountNumber: reqDto.payment?.bankAccountNumber,
      bankAccountHolder: reqDto.payment?.bankAccountHolder,
      bankBranch: reqDto.payment?.bankBranch,
      defaultPaymentMethod: reqDto.payment?.defaultPaymentMethod,
      defaultPaymentTerm: reqDto.payment?.defaultPaymentTerm,
      creditLimit: reqDto.payment?.creditLimit,
      creditLimitStartDate: reqDto.payment?.creditLimitStartDate,
    });

    if (reqDto.attachments?.length) {
      await this.replaceAttachments(supplier.id, reqDto.attachments);
    }

    if (reqDto.representatives?.length) {
      await this.replaceRepresentatives(supplier.id, reqDto.representatives);
    }

    return this.getSupplierDetail(supplier.id);
  }

  async updateSupplier(supplierId: string, reqDto: UpdateSupplierReqDto): Promise<SupplierResDto> {
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

    // drizzle's `.set()` throws "No values to set" if every key resolves to `undefined` (e.g. a
    // PATCH that only touches `payment`/`attachments`), so only issue each UPDATE when at least
    // one of its own fields was actually sent.
    const supplierUpdate = {
      code: reqDto.code,
      name: reqDto.name,
      supplierGroupId: reqDto.supplierGroupId,
      type: reqDto.type,
      taxCode: reqDto.taxCode,
      phoneNumber: reqDto.phoneNumber,
      email: reqDto.email,
      address: reqDto.address,
      note: reqDto.note,
      logoUrl: reqDto.logoUrl,
      countryId: reqDto.countryId,
      rating: reqDto.rating,
      status: reqDto.status,
      internalNote: reqDto.internalNote,
    };
    if (Object.values(supplierUpdate).some((value) => value !== undefined)) {
      await this.db.update(suppliers).set(supplierUpdate).where(eq(suppliers.id, supplierId));
    }

    if (reqDto.payment) {
      // The payment info row always exists (created in createSupplier); only the fields
      // actually sent are overwritten, everything else keeps its current value.
      const paymentUpdate = {
        bankName: reqDto.payment.bankName,
        bankAccountNumber: reqDto.payment.bankAccountNumber,
        bankAccountHolder: reqDto.payment.bankAccountHolder,
        bankBranch: reqDto.payment.bankBranch,
        defaultPaymentMethod: reqDto.payment.defaultPaymentMethod,
        defaultPaymentTerm: reqDto.payment.defaultPaymentTerm,
        creditLimit: reqDto.payment.creditLimit,
        creditLimitStartDate: reqDto.payment.creditLimitStartDate,
      };
      if (Object.values(paymentUpdate).some((value) => value !== undefined)) {
        await this.db
          .update(supplierPaymentInfo)
          .set(paymentUpdate)
          .where(eq(supplierPaymentInfo.supplierId, supplierId));
      }
    }

    if (reqDto.attachments) {
      await this.replaceAttachments(supplierId, reqDto.attachments);
    }

    if (reqDto.representatives) {
      await this.replaceRepresentatives(supplierId, reqDto.representatives);
    }

    return this.getSupplierDetail(supplierId);
  }

  async deleteSupplier(supplierId: string): Promise<void> {
    await this.ensureSupplierExists(supplierId);

    await this.db
      .update(suppliers)
      .set({ deletedAt: new Date() })
      .where(eq(suppliers.id, supplierId));
  }

  private async replaceAttachments(
    supplierId: string,
    attachments: CreateSupplierReqDto['attachments'],
  ): Promise<void> {
    await this.db.delete(supplierAttachments).where(eq(supplierAttachments.supplierId, supplierId));

    if (attachments?.length) {
      await this.db.insert(supplierAttachments).values(
        attachments.map((attachment) => ({
          supplierId,
          url: attachment.url,
          filename: attachment.filename,
          mimetype: attachment.mimetype,
          size: attachment.size,
        })),
      );
    }
  }

  private async replaceRepresentatives(
    supplierId: string,
    representatives: CreateSupplierReqDto['representatives'],
  ): Promise<void> {
    await this.db
      .delete(supplierRepresentatives)
      .where(eq(supplierRepresentatives.supplierId, supplierId));

    if (representatives?.length) {
      await this.db.insert(supplierRepresentatives).values(
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

  private async validateCodeUniqueness(code: string, ignoredSupplierId?: string): Promise<void> {
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

  private async ensureSupplierGroupExists(supplierGroupId: string): Promise<void> {
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
    const [totalRows] = await this.db.select({ total: drizzleCount() }).from(suppliers);
    return `NCC${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }
}
