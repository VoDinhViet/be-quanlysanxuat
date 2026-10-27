import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, eq, ne, or } from 'drizzle-orm';

import { extractPostgresError } from '../../common/utils/postgres-error.util';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { itemCategories, items } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateItemCategoryReqDto } from './dto/create-item-category.req.dto';
import { GetItemCategoriesReqDto } from './dto/get-item-categories.req.dto';
import { ItemCategoryResDto } from './dto/item-category.res.dto';
import { UpdateItemCategoryReqDto } from './dto/update-item-category.req.dto';

@Injectable()
export class ItemCategoriesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getItemCategories(
    reqDto: GetItemCategoriesReqDto,
  ): Promise<ItemCategoryResDto[]> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const foundItemCategories = await this.db.query.itemCategories.findMany({
      where: keyword
        ? or(
            unaccentILike(itemCategories.code, keyword),
            unaccentILike(itemCategories.name, keyword),
          )
        : undefined,
      // Sắp theo tên vì danh sách này đổ thẳng vào dropdown.
      orderBy: asc(itemCategories.name),
    });

    return plainToInstance(ItemCategoryResDto, foundItemCategories, {
      excludeExtraneousValues: true,
    });
  }

  async getItemCategory(itemCategoryId: string): Promise<ItemCategoryResDto> {
    const itemCategory = await this.ensureItemCategoryExists(itemCategoryId);

    return plainToInstance(ItemCategoryResDto, itemCategory, {
      excludeExtraneousValues: true,
    });
  }

  async createItemCategory(reqDto: CreateItemCategoryReqDto): Promise<void> {
    await this.validateCodeUniqueness(reqDto.code);

    try {
      await this.db.insert(itemCategories).values(reqDto);
    } catch (error) {
      if (extractPostgresError(error)?.code === '23505') {
        throw new AppException(ErrorCode.E324, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async updateItemCategory(
    itemCategoryId: string,
    reqDto: UpdateItemCategoryReqDto,
  ): Promise<void> {
    await this.ensureItemCategoryExists(itemCategoryId);

    if (reqDto.code) {
      await this.validateCodeUniqueness(reqDto.code, itemCategoryId);
    }

    // Field khai báo mà không gửi vẫn là key (`undefined`) nên `Object.keys` luôn > 0; `updated_at`
    // được bump bởi `$onUpdate` của cột.
    if (Object.values(reqDto).some((value) => value !== undefined)) {
      try {
        await this.db
          .update(itemCategories)
          .set(reqDto)
          .where(eq(itemCategories.id, itemCategoryId));
      } catch (error) {
        if (extractPostgresError(error)?.code === '23505') {
          throw new AppException(ErrorCode.E324, HttpStatus.CONFLICT);
        }
        throw error;
      }
    }
  }

  async deleteItemCategory(itemCategoryId: string): Promise<void> {
    await this.ensureItemCategoryExists(itemCategoryId);
    await this.ensureItemCategoryNotInUse(itemCategoryId);

    try {
      await this.db
        .delete(itemCategories)
        .where(eq(itemCategories.id, itemCategoryId));
    } catch (error) {
      // Một vật tư vừa gắn nhóm này giữa lúc kiểm tra và `DELETE`.
      if (extractPostgresError(error)?.code === '23503') {
        throw new AppException(ErrorCode.E325, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async ensureItemCategoryExists(itemCategoryId: string) {
    const [itemCategory] = await this.db
      .select()
      .from(itemCategories)
      .where(eq(itemCategories.id, itemCategoryId))
      .limit(1);

    if (!itemCategory) {
      throw new AppException(ErrorCode.E323, HttpStatus.NOT_FOUND);
    }

    return itemCategory;
  }

  private async validateCodeUniqueness(
    code: string,
    ignoredItemCategoryId?: string,
  ): Promise<void> {
    const [duplicatedItemCategory] = await this.db
      .select({ id: itemCategories.id })
      .from(itemCategories)
      .where(
        and(
          eq(itemCategories.code, code),
          ignoredItemCategoryId
            ? ne(itemCategories.id, ignoredItemCategoryId)
            : undefined,
        ),
      )
      .limit(1);

    if (duplicatedItemCategory) {
      throw new AppException(ErrorCode.E324, HttpStatus.CONFLICT);
    }
  }

  /** Không lọc `isNull(items.deletedAt)` — item xoá mềm vẫn giữ FK `restrict` nên DB vẫn chặn
   * xoá; lọc sẽ biến 409 sạch ở đây thành lỗi FK constraint thô (500). */
  private async ensureItemCategoryNotInUse(
    itemCategoryId: string,
  ): Promise<void> {
    const [usedInItem] = await this.db
      .select({ id: items.id })
      .from(items)
      .where(eq(items.itemCategoryId, itemCategoryId))
      .limit(1);

    if (usedInItem) {
      throw new AppException(ErrorCode.E325, HttpStatus.CONFLICT);
    }
  }
}
