import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, eq, ne, or } from 'drizzle-orm';

import { extractPostgresError } from '../../common/utils/postgres-error.util';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { items, productionJobUnits, units } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateUnitReqDto } from './dto/create-unit.req.dto';
import { GetUnitsReqDto } from './dto/get-units.req.dto';
import { UnitResDto } from './dto/unit.res.dto';
import { UpdateUnitReqDto } from './dto/update-unit.req.dto';

@Injectable()
export class UnitsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getUnits(reqDto: GetUnitsReqDto): Promise<UnitResDto[]> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const entities = await this.db.query.units.findMany({
      where: and(
        keyword
          ? or(
              unaccentILike(units.code, keyword),
              unaccentILike(units.name, keyword),
            )
          : undefined,
        reqDto.type ? eq(units.type, reqDto.type) : undefined,
        reqDto.status ? eq(units.status, reqDto.status) : undefined,
      ),
      // Alphabetical, because this list is rendered straight into a dropdown.
      orderBy: asc(units.name),
    });

    return plainToInstance(UnitResDto, entities, {
      excludeExtraneousValues: true,
    });
  }

  async getUnit(unitId: string): Promise<UnitResDto> {
    const unit = await this.ensureUnitExists(unitId);

    return plainToInstance(UnitResDto, unit, {
      excludeExtraneousValues: true,
    });
  }

  async createUnit(reqDto: CreateUnitReqDto): Promise<void> {
    await this.validateCodeUniqueness(reqDto.code);

    try {
      await this.db.insert(units).values(reqDto);
    } catch (error) {
      // Bắt xung đột unique code nếu có race condition
      if (extractPostgresError(error)?.code === '23505') {
        throw new AppException(ErrorCode.E241, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async updateUnit(unitId: string, reqDto: UpdateUnitReqDto): Promise<void> {
    await this.ensureUnitExists(unitId);

    if (reqDto.code) {
      await this.validateCodeUniqueness(reqDto.code, unitId);
    }

    // `updated_at` được bump bởi `$onUpdate` của cột.
    if (Object.keys(reqDto).length > 0) {
      await this.db.update(units).set(reqDto).where(eq(units.id, unitId));
    }
  }

  async deleteUnit(unitId: string): Promise<void> {
    await this.ensureUnitExists(unitId);
    await this.ensureUnitNotInUse(unitId);

    await this.db.delete(units).where(eq(units.id, unitId));
  }

  async ensureUnitExists(unitId: string) {
    const existing = await this.db.query.units.findFirst({
      where: eq(units.id, unitId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E011, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private async validateCodeUniqueness(
    code: string,
    ignoredUnitId?: string,
  ): Promise<void> {
    const [existing] = await this.db
      .select({ id: units.id })
      .from(units)
      .where(
        and(
          eq(units.code, code),
          ignoredUnitId ? ne(units.id, ignoredUnitId) : undefined,
        ),
      )
      .limit(1);

    if (existing) {
      throw new AppException(ErrorCode.E241, HttpStatus.CONFLICT);
    }
  }

  /** Kiểm trực tiếp hai bảng có `unitId` FK `restrict` (`items`, `production_job_units`), không lọc
   * `isNull(items.deletedAt)` — item xoá mềm vẫn giữ FK nên DB vẫn chặn xoá; lọc sẽ biến 409 sạch
   * ở đây thành lỗi FK constraint thô (500). */
  private async ensureUnitNotInUse(unitId: string): Promise<void> {
    const [[usedInItem], [usedInProductionJobUnit]] = await Promise.all([
      this.db
        .select({ id: items.id })
        .from(items)
        .where(eq(items.unitId, unitId))
        .limit(1),
      this.db
        .select({ id: productionJobUnits.id })
        .from(productionJobUnits)
        .where(eq(productionJobUnits.unitId, unitId))
        .limit(1),
    ]);

    if (usedInItem || usedInProductionJobUnit) {
      throw new AppException(ErrorCode.E242, HttpStatus.CONFLICT);
    }
  }
}
