import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, count, eq, getTableColumns, or } from 'drizzle-orm';

import { BomsService } from '../boms/boms.service';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { bomMaterials, files, materials, units } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { BomMaterialResDto } from './dto/bom-material.res.dto';
import { CreateBomMaterialReqDto } from './dto/create-bom-material.req.dto';
import { GetBomMaterialsReqDto } from './dto/get-bom-materials.req.dto';
import { UpdateBomMaterialReqDto } from './dto/update-bom-material.req.dto';

@Injectable()
export class BomMaterialsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly bomsService: BomsService,
  ) {}

  async getBomMaterials(
    productId: string,
    bomItemId: string,
    reqDto: GetBomMaterialsReqDto,
  ): Promise<OffsetPaginatedDto<BomMaterialResDto>> {
    await this.bomsService.ensureProductExists(productId);
    await this.bomsService.ensureBomItemInBom(productId, bomItemId);

    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      eq(bomMaterials.bomItemId, bomItemId),
      keyword
        ? or(
            unaccentILike(materials.code, keyword),
            unaccentILike(materials.name, keyword),
          )
        : undefined,
    );

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          id: bomMaterials.id,
          materialId: materials.id,
          code: materials.code,
          name: materials.name,
          unit: getTableColumns(units),
          image: getTableColumns(files),
          quantity: bomMaterials.quantity,
          sortOrder: bomMaterials.sortOrder,
          note: bomMaterials.note,
        })
        .from(bomMaterials)
        .innerJoin(materials, eq(bomMaterials.materialId, materials.id))
        .innerJoin(units, eq(materials.unitId, units.id))
        .leftJoin(files, eq(materials.imageFileId, files.id))
        .where(where)
        .orderBy(asc(bomMaterials.sortOrder), asc(bomMaterials.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db.select({ total: count() }).from(bomMaterials).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(BomMaterialResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async addBomMaterial(
    productId: string,
    bomItemId: string,
    reqDto: CreateBomMaterialReqDto,
    userId: string,
  ): Promise<BomMaterialResDto> {
    await this.bomsService.ensureProductExists(productId);
    await this.bomsService.ensureBomItemInBom(productId, bomItemId);
    await this.ensureMaterialExists(reqDto.materialId);

    const [row] = await this.db
      .insert(bomMaterials)
      .values({
        bomItemId,
        materialId: reqDto.materialId,
        quantity: reqDto.quantity,
        sortOrder: reqDto.sortOrder ?? 0,
        note: reqDto.note,
        createdBy: userId,
      })
      .returning({ id: bomMaterials.id });

    return this.getBomMaterialDetail(row.id);
  }

  /** Chỉ sửa SL/sortOrder/note — `materialId` bất biến, đổi thì xoá + thêm lại. */
  async updateBomMaterial(
    productId: string,
    bomItemId: string,
    materialLineId: string,
    reqDto: UpdateBomMaterialReqDto,
  ): Promise<BomMaterialResDto> {
    await this.bomsService.ensureProductExists(productId);
    await this.bomsService.ensureBomItemInBom(productId, bomItemId);
    await this.ensureBomMaterialExists(bomItemId, materialLineId);

    await this.db
      .update(bomMaterials)
      .set(reqDto)
      .where(
        and(
          eq(bomMaterials.id, materialLineId),
          eq(bomMaterials.bomItemId, bomItemId),
        ),
      );

    return this.getBomMaterialDetail(materialLineId);
  }

  async deleteBomMaterial(
    productId: string,
    bomItemId: string,
    materialLineId: string,
  ): Promise<void> {
    await this.bomsService.ensureProductExists(productId);
    await this.bomsService.ensureBomItemInBom(productId, bomItemId);
    await this.ensureBomMaterialExists(bomItemId, materialLineId);

    await this.db
      .delete(bomMaterials)
      .where(
        and(
          eq(bomMaterials.id, materialLineId),
          eq(bomMaterials.bomItemId, bomItemId),
        ),
      );
  }

  private async getBomMaterialDetail(id: string): Promise<BomMaterialResDto> {
    const [row] = await this.db
      .select({
        id: bomMaterials.id,
        materialId: materials.id,
        code: materials.code,
        name: materials.name,
        unit: getTableColumns(units),
        image: getTableColumns(files),
        quantity: bomMaterials.quantity,
        sortOrder: bomMaterials.sortOrder,
        note: bomMaterials.note,
      })
      .from(bomMaterials)
      .innerJoin(materials, eq(bomMaterials.materialId, materials.id))
      .innerJoin(units, eq(materials.unitId, units.id))
      .leftJoin(files, eq(materials.imageFileId, files.id))
      .where(eq(bomMaterials.id, id));

    if (!row) {
      throw new AppException(ErrorCode.E108, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(BomMaterialResDto, row, {
      excludeExtraneousValues: true,
    });
  }

  /** `materials` không có soft delete (không cột `deletedAt`) — chỉ cần tra id thuần. */
  private async ensureMaterialExists(materialId: string): Promise<void> {
    const material = await this.db.query.materials.findFirst({
      columns: { id: true },
      where: eq(materials.id, materialId),
    });

    if (!material) {
      throw new AppException(ErrorCode.E035, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureBomMaterialExists(
    bomItemId: string,
    materialLineId: string,
  ): Promise<void> {
    const existing = await this.db.query.bomMaterials.findFirst({
      columns: { id: true },
      where: and(
        eq(bomMaterials.id, materialLineId),
        eq(bomMaterials.bomItemId, bomItemId),
      ),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E108, HttpStatus.NOT_FOUND);
    }
  }
}
