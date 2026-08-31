import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { extractPostgresError } from '../../common/utils/postgres-error.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { itemUnits, items, units } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateItemUnitReqDto } from './dto/create-item-unit.req.dto';
import { ItemUnitResDto } from './dto/item-unit.res.dto';
import { UpdateItemUnitReqDto } from './dto/update-item-unit.req.dto';

/** Đơn vị phụ khai báo riêng theo từng item — thuần thông tin tham khảo, không module nào đọc lại để
 * tính toán (`docs/decisions/unit-conversion.md`). */
@Injectable()
export class ItemUnitsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getItemUnits(itemId: string): Promise<ItemUnitResDto[]> {
    await this.ensureItemExists(itemId);

    const rows = await this.db.query.itemUnits.findMany({
      where: eq(itemUnits.itemId, itemId),
      with: { unit: true },
      orderBy: asc(itemUnits.createdAt),
    });

    return rows.map((row) =>
      plainToInstance(ItemUnitResDto, row, { excludeExtraneousValues: true }),
    );
  }

  async createItemUnit(
    itemId: string,
    reqDto: CreateItemUnitReqDto,
  ): Promise<void> {
    const item = await this.ensureItemExists(itemId);
    await this.ensureUnitExists(reqDto.unitId);

    if (reqDto.unitId === item.unitId) {
      throw new AppException(ErrorCode.E263, HttpStatus.CONFLICT);
    }

    try {
      await this.db.insert(itemUnits).values({ itemId, ...reqDto });
    } catch (error) {
      if (extractPostgresError(error)?.code === '23505') {
        throw new AppException(ErrorCode.E263, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async updateItemUnit(
    itemId: string,
    unitId: string,
    reqDto: UpdateItemUnitReqDto,
  ): Promise<void> {
    await this.ensureItemExists(itemId);
    await this.ensureItemUnitExists(itemId, unitId);

    await this.db
      .update(itemUnits)
      .set(reqDto)
      .where(and(eq(itemUnits.itemId, itemId), eq(itemUnits.unitId, unitId)));
  }

  async deleteItemUnit(itemId: string, unitId: string): Promise<void> {
    await this.ensureItemExists(itemId);
    await this.ensureItemUnitExists(itemId, unitId);

    await this.db
      .delete(itemUnits)
      .where(and(eq(itemUnits.itemId, itemId), eq(itemUnits.unitId, unitId)));
  }

  private async ensureItemExists(itemId: string): Promise<{ unitId: string }> {
    const existing = await this.db.query.items.findFirst({
      columns: { unitId: true },
      where: and(eq(items.id, itemId), isNull(items.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  /** Trùng check tồn tại với `UnitsService` — cố ý không inject qua DI để module này đứng độc lập,
   * cùng khuôn `RoutingsService.ensureOperationExists`. */
  private async ensureUnitExists(unitId: string): Promise<void> {
    const existing = await this.db.query.units.findFirst({
      columns: { id: true },
      where: eq(units.id, unitId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E011, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureItemUnitExists(
    itemId: string,
    unitId: string,
  ): Promise<void> {
    const existing = await this.db.query.itemUnits.findFirst({
      columns: { itemId: true },
      where: and(eq(itemUnits.itemId, itemId), eq(itemUnits.unitId, unitId)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E262, HttpStatus.NOT_FOUND);
    }
  }
}
