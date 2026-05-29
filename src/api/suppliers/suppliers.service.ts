import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, count, desc, eq, ilike, isNull, or } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OrderBy } from '../../constants/app.constant';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { suppliers } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateSupplierReqDto } from './dto/create-supplier.req.dto';
import { GetSuppliersReqDto } from './dto/get-suppliers.req.dto';
import { SupplierResDto } from './dto/supplier.res.dto';
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
            ilike(suppliers.code, keyword),
            ilike(suppliers.name, keyword),
            ilike(suppliers.email, keyword),
            ilike(suppliers.phoneNumber, keyword),
            ilike(suppliers.address, keyword),
          )
        : undefined,
    );
    const orderBy =
      reqDto.order === OrderBy.DESC ? desc(suppliers.createdAt) : asc(suppliers.createdAt);

    const [entities, totalRows] = await Promise.all([
      this.db.query.suppliers.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
      }),
      this.db.select({ total: count() }).from(suppliers).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(SupplierResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(totalRows[0]?.total ?? 0, reqDto),
    );
  }

  async createSupplier(reqDto: CreateSupplierReqDto): Promise<SupplierResDto> {
    const code = await this.generateSupplierCode();

    const [supplier] = await this.db
      .insert(suppliers)
      .values({
        code,
        name: reqDto.name,
        email: reqDto.email,
        phoneNumber: reqDto.phoneNumber,
        address: reqDto.address,
      })
      .returning();

    return this.mapSupplier(supplier);
  }

  async updateSupplier(supplierId: string, reqDto: UpdateSupplierReqDto): Promise<SupplierResDto> {
    await this.ensureSupplierExists(supplierId);

    const [supplier] = await this.db
      .update(suppliers)
      .set({
        name: reqDto.name,
        email: reqDto.email,
        phoneNumber: reqDto.phoneNumber,
        address: reqDto.address,
        updatedAt: new Date(),
      })
      .where(and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)))
      .returning();

    return this.mapSupplier(supplier);
  }

  async deleteSupplier(supplierId: string): Promise<SupplierResDto> {
    await this.ensureSupplierExists(supplierId);

    const deletedAt = new Date();
    const [supplier] = await this.db
      .update(suppliers)
      .set({
        deletedAt,
        updatedAt: deletedAt,
      })
      .where(and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)))
      .returning();

    return this.mapSupplier(supplier);
  }

  private async generateSupplierCode(): Promise<string> {
    const [totalRows] = await this.db.select({ total: count() }).from(suppliers);

    return `NCC${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }

  private async ensureSupplierExists(supplierId: string): Promise<void> {
    const existingSupplier = await this.db.query.suppliers.findFirst({
      columns: {
        id: true,
      },
      where: and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)),
    });

    if (!existingSupplier) {
      throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
    }
  }

  private mapSupplier(supplier: typeof suppliers.$inferSelect): SupplierResDto {
    return plainToInstance(SupplierResDto, supplier, {
      excludeExtraneousValues: true,
    });
  }
}
