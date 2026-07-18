import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count as drizzleCount, desc, eq, ne, or } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { materialGroups, materials } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateMaterialGroupReqDto } from './dto/create-material-group.req.dto';
import { GetMaterialGroupsReqDto } from './dto/get-material-groups.req.dto';
import { MaterialGroupResDto } from './dto/material-group.res.dto';
import { UpdateMaterialGroupReqDto } from './dto/update-material-group.req.dto';

@Injectable()
export class MaterialGroupsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getMaterialGroups(
    reqDto: GetMaterialGroupsReqDto,
  ): Promise<OffsetPaginatedDto<MaterialGroupResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = keyword
      ? or(unaccentILike(materialGroups.code, keyword), unaccentILike(materialGroups.name, keyword))
      : undefined;

    const [entities, count] = await Promise.all([
      this.db.query.materialGroups.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(materialGroups.createdAt),
      }),
      this.db.select({ total: drizzleCount() }).from(materialGroups).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(MaterialGroupResDto, entities, { excludeExtraneousValues: true }),
      new OffsetPaginationDto(count[0]?.total ?? 0, reqDto),
    );
  }

  async getMaterialGroupDetail(groupId: string): Promise<MaterialGroupResDto> {
    const group = await this.db.query.materialGroups.findFirst({
      where: eq(materialGroups.id, groupId),
    });

    if (!group) {
      throw new AppException(ErrorCode.E037, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(MaterialGroupResDto, group, { excludeExtraneousValues: true });
  }

  async createMaterialGroup(reqDto: CreateMaterialGroupReqDto): Promise<MaterialGroupResDto> {
    await this.validateCodeUniqueness(reqDto.code);

    const [group] = await this.db
      .insert(materialGroups)
      .values({ code: reqDto.code, name: reqDto.name, description: reqDto.description })
      .returning();

    return this.getMaterialGroupDetail(group.id);
  }

  async updateMaterialGroup(
    groupId: string,
    reqDto: UpdateMaterialGroupReqDto,
  ): Promise<MaterialGroupResDto> {
    await this.ensureMaterialGroupExists(groupId);

    const groupUpdate = { name: reqDto.name, description: reqDto.description };
    if (Object.values(groupUpdate).some((value) => value !== undefined)) {
      await this.db.update(materialGroups).set(groupUpdate).where(eq(materialGroups.id, groupId));
    }

    return this.getMaterialGroupDetail(groupId);
  }

  async deleteMaterialGroup(groupId: string): Promise<void> {
    await this.ensureMaterialGroupExists(groupId);
    await this.ensureNotInUse(groupId);

    await this.db.delete(materialGroups).where(eq(materialGroups.id, groupId));
  }

  private async ensureMaterialGroupExists(groupId: string) {
    const existing = await this.db.query.materialGroups.findFirst({
      columns: { id: true },
      where: eq(materialGroups.id, groupId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E037, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private async validateCodeUniqueness(code: string, ignoredGroupId?: string): Promise<void> {
    const where = ignoredGroupId
      ? and(eq(materialGroups.code, code), ne(materialGroups.id, ignoredGroupId))
      : eq(materialGroups.code, code);

    const existing = await this.db.query.materialGroups.findFirst({ columns: { id: true }, where });

    if (existing) {
      throw new AppException(ErrorCode.E038, HttpStatus.CONFLICT);
    }
  }

  private async ensureNotInUse(groupId: string): Promise<void> {
    const inUse = await this.db.query.materials.findFirst({
      columns: { id: true },
      where: eq(materials.materialGroupId, groupId),
    });

    if (inUse) {
      throw new AppException(ErrorCode.E039, HttpStatus.CONFLICT);
    }
  }
}
