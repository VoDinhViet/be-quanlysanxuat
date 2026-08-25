import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, eq, inArray, isNull, ne, or } from 'drizzle-orm';

import { extractPostgresError } from '../../common/utils/postgres-error.util';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  ItemType,
  items,
  productionJobUnits,
  UnitScope,
  units,
  unitScopes,
} from '../../database/schemas';
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
        reqDto.scope
          ? inArray(
              units.id,
              this.db
                .select({ id: unitScopes.unitId })
                .from(unitScopes)
                .where(eq(unitScopes.scope, reqDto.scope)),
            )
          : undefined,
      ),
      with: { scopes: true },
      // Alphabetical, because this list is rendered straight into a dropdown.
      orderBy: asc(units.name),
    });

    return plainToInstance(
      UnitResDto,
      entities.map((unit) => ({
        ...unit,
        scopes: unit.scopes.map(({ scope }) => scope),
      })),
      { excludeExtraneousValues: true },
    );
  }

  async getUnit(unitId: string): Promise<UnitResDto> {
    const unit = await this.ensureUnitExists(unitId);

    return plainToInstance(
      UnitResDto,
      { ...unit, scopes: unit.scopes.map(({ scope }) => scope) },
      { excludeExtraneousValues: true },
    );
  }

  async createUnit(reqDto: CreateUnitReqDto): Promise<void> {
    this.validateScopesNotEmpty(reqDto.scopes);
    await this.validateCodeUniqueness(reqDto.code);

    const { scopes, ...unitFields } = reqDto;

    try {
      // Một unit không có scope là unit chết — chèn `units`/`unit_scopes` phải cùng vào hoặc cùng
      // rollback, cùng lý lẽ `units.seed.ts`.
      await this.db.transaction(async (tx) => {
        const [unit] = await tx.insert(units).values(unitFields).returning();
        await this.replaceScopes(tx, unit.id, scopes);
      });
    } catch (error) {
      // Mã client tự gửi vẫn còn TOCTOU giữa `validateCodeUniqueness` và `INSERT` — bắt ở đây thay
      // vì để lỗi Postgres thô 500 lọt ra ngoài.
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
    if (reqDto.scopes) {
      this.validateScopesNotEmpty(reqDto.scopes);
      await this.ensureRemovedScopesNotInUse(unitId, reqDto.scopes);
    }

    const { scopes, ...unitFields } = reqDto;

    // Ghi `units` và (nếu có) xoá + chèn lại `unit_scopes` phải cùng transaction — cùng lý lẽ
    // `createUnit`. `updated_at` được bump bởi `$onUpdate` của cột.
    await this.db.transaction(async (tx) => {
      if (Object.keys(unitFields).length > 0) {
        await tx.update(units).set(unitFields).where(eq(units.id, unitId));
      }
      if (scopes) {
        await this.replaceScopes(tx, unitId, scopes);
      }
    });
  }

  async deleteUnit(unitId: string): Promise<void> {
    await this.ensureUnitExists(unitId);
    await this.ensureUnitNotInUse(unitId);

    await this.db.delete(units).where(eq(units.id, unitId));
  }

  async ensureUnitExists(unitId: string) {
    const existing = await this.db.query.units.findFirst({
      where: eq(units.id, unitId),
      with: { scopes: true },
    });

    if (!existing) {
      throw new AppException(ErrorCode.E011, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private validateScopesNotEmpty(scopes: UnitScope[]): void {
    if (scopes.length === 0) {
      throw new AppException(ErrorCode.E243, HttpStatus.BAD_REQUEST);
    }
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

  /** Gỡ scope không phá dữ liệu cũ nhưng làm mọi `PATCH /items` sau đó rơi vào `E043`
   * (scope_mismatch) — chặn trước ở đây thay vì để lộ lỗi khó truy đó. Map `UnitScope` sang
   * `ItemType` tương ứng: `MATERIAL` ↔ RM, `PRODUCT` ↔ FG/WIP. `SEMI_FINISHED` không chặn — chưa
   * module nào đọc scope này. */
  private async ensureRemovedScopesNotInUse(
    unitId: string,
    nextScopes: UnitScope[],
  ): Promise<void> {
    const { scopes: currentScopes } = await this.ensureUnitExists(unitId);
    const nextScopeSet = new Set(nextScopes);
    const removedScopes = currentScopes
      .map(({ scope }) => scope)
      .filter((scope) => !nextScopeSet.has(scope));

    for (const scope of removedScopes) {
      const itemTypes =
        scope === UnitScope.MATERIAL
          ? [ItemType.RM]
          : scope === UnitScope.PRODUCT
            ? [ItemType.FG, ItemType.WIP]
            : [];

      if (itemTypes.length === 0) {
        continue;
      }

      const [usedInItem] = await this.db
        .select({ id: items.id })
        .from(items)
        .where(
          and(
            eq(items.unitId, unitId),
            inArray(items.type, itemTypes),
            isNull(items.deletedAt),
          ),
        )
        .limit(1);

      if (usedInItem) {
        throw new AppException(ErrorCode.E244, HttpStatus.CONFLICT);
      }
    }
  }

  private async replaceScopes(
    tx: DbTransaction,
    unitId: string,
    scopes: UnitScope[],
  ): Promise<void> {
    await tx.delete(unitScopes).where(eq(unitScopes.unitId, unitId));
    await tx
      .insert(unitScopes)
      .values(scopes.map((scope) => ({ unitId, scope })));
  }
}
