import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, eq, inArray, isNull, or } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  clients,
  materialAttachments,
  materialGroups,
  materials,
  MaterialStatus,
  MaterialType,
  units,
  UnitScope,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { CreateMaterialReqDto } from './dto/create-material.req.dto';
import { GetMaterialsReqDto } from './dto/get-materials.req.dto';
import { MaterialResDto } from './dto/material.res.dto';

const MATERIAL_DETAIL_WITH = {
  unit: true,
  group: true,
  client: true,
  creator: true,
  imageFile: true,
  attachments: { with: { file: true } },
} as const;

@Injectable()
export class MaterialsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly filesService: FilesService,
  ) {}

  async getMaterials(
    reqDto: GetMaterialsReqDto,
  ): Promise<OffsetPaginatedDto<MaterialResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      keyword
        ? or(
            unaccentILike(materials.code, keyword),
            unaccentILike(materials.name, keyword),
            inArray(
              materials.materialGroupId,
              this.db
                .select({ id: materialGroups.id })
                .from(materialGroups)
                .where(unaccentILike(materialGroups.name, keyword)),
            ),
          )
        : undefined,
      reqDto.type ? eq(materials.type, reqDto.type) : undefined,
      reqDto.materialGroupId
        ? eq(materials.materialGroupId, reqDto.materialGroupId)
        : undefined,
      reqDto.clientId ? eq(materials.clientId, reqDto.clientId) : undefined,
      reqDto.status ? eq(materials.status, reqDto.status) : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.materials.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(materials.createdAt),
        with: {
          unit: true,
          group: true,
          client: true,
          creator: true,
          imageFile: true,
        },
      }),
      this.db.select({ total: count() }).from(materials).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(MaterialResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async createMaterial(
    reqDto: CreateMaterialReqDto,
    userId: string,
  ): Promise<MaterialResDto> {
    // Every check below is a read, so it runs before the transaction opens — the transaction
    // only has to keep the writes together.
    let code = reqDto.code;
    if (code) {
      await this.validateCodeUniqueness(code);
    } else {
      code = await this.generateMaterialCode();
    }

    await this.ensureUnitExists(reqDto.unitId);
    await this.ensureMaterialGroupExists(reqDto.materialGroupId);

    const type = reqDto.type ?? MaterialType.INTERNAL;
    const clientId = await this.resolveClientLink(
      type,
      reqDto.clientId ?? null,
    );
    const status = reqDto.status ?? MaterialStatus.ACTIVE;

    await this.filesService.linkFiles(
      [reqDto.imageFileId, ...(reqDto.attachmentFileIds ?? [])].filter(
        (fileId): fileId is string => !!fileId,
      ),
    );

    // The material row and its attachments must land together: without this transaction a
    // failing attachment insert would leave a committed material with no documents.
    const materialId = await this.db.transaction(async (tx) => {
      const [material] = await tx
        .insert(materials)
        .values({
          code,
          name: reqDto.name,
          unitId: reqDto.unitId,
          materialGroupId: reqDto.materialGroupId,
          type,
          clientId,
          imageFileId: reqDto.imageFileId,
          status,
          note: reqDto.note,
          materialGrade: reqDto.materialGrade,
          technicalStandard: reqDto.technicalStandard,
          dimensions: reqDto.dimensions,
          specificWeight:
            reqDto.specificWeight != null
              ? String(reqDto.specificWeight)
              : undefined,
          colorSurface: reqDto.colorSurface,
          description: reqDto.description,
          origin: reqDto.origin,
          leadTime: reqDto.leadTime,
          createdBy: userId,
        })
        .returning();

      if (reqDto.attachmentFileIds?.length) {
        await this.insertAttachments(tx, material.id, reqDto.attachmentFileIds);
      }

      return material.id;
    });

    return this.getMaterialDetail(materialId);
  }

  /**
   * Reads back a material with everything a `MaterialResDto` needs. Private for now — there is no
   * `GET /materials/:id` route yet; create() uses it to return the freshly written row.
   */
  private async getMaterialDetail(materialId: string): Promise<MaterialResDto> {
    const material = await this.db.query.materials.findFirst({
      where: eq(materials.id, materialId),
      with: MATERIAL_DETAIL_WITH,
    });

    if (!material) {
      throw new AppException(ErrorCode.E035, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(MaterialResDto, material, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * type=CLIENT requires a client (E040) that must exist; type=INTERNAL never carries a
   * client (any provided clientId is cleared). Returns the effective clientId to persist.
   */
  private async resolveClientLink(
    type: MaterialType,
    clientId: string | null,
  ): Promise<string | null> {
    if (type === MaterialType.CLIENT) {
      if (!clientId) {
        throw new AppException(ErrorCode.E040, HttpStatus.BAD_REQUEST);
      }
      await this.ensureClientExists(clientId);
      return clientId;
    }

    return null;
  }

  /**
   * Writes the attachment rows. Takes `tx` (not `this.db`) so it can only ever be called from
   * inside an open transaction — passing the pooled connection is a compile error.
   */
  private async insertAttachments(
    tx: DbTransaction,
    materialId: string,
    fileIds: string[],
  ): Promise<void> {
    await tx
      .insert(materialAttachments)
      .values(fileIds.map((fileId) => ({ materialId, fileId })));
  }

  private async generateMaterialCode(): Promise<string> {
    const [totalRows] = await this.db
      .select({ total: count() })
      .from(materials);
    return `VT${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }

  private async validateCodeUniqueness(code: string): Promise<void> {
    const existing = await this.db.query.materials.findFirst({
      columns: { id: true },
      where: eq(materials.code, code),
    });

    if (existing) {
      throw new AppException(ErrorCode.E036, HttpStatus.CONFLICT);
    }
  }

  /**
   * The unit must exist *and* be flagged as usable on materials — filtering the dropdown with
   * `GET /units?scope=MATERIAL` is cosmetic on its own, a client can still post any unit id.
   */
  private async ensureUnitExists(unitId: string): Promise<void> {
    const existing = await this.db.query.units.findFirst({
      columns: { id: true },
      with: { scopes: { columns: { scope: true } } },
      where: eq(units.id, unitId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E011, HttpStatus.NOT_FOUND);
    }
    if (!existing.scopes.some(({ scope }) => scope === UnitScope.MATERIAL)) {
      throw new AppException(ErrorCode.E043, HttpStatus.BAD_REQUEST);
    }
  }

  private async ensureMaterialGroupExists(
    materialGroupId: string,
  ): Promise<void> {
    const existing = await this.db.query.materialGroups.findFirst({
      columns: { id: true },
      where: eq(materialGroups.id, materialGroupId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E037, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureClientExists(clientId: string): Promise<void> {
    const existing = await this.db.query.clients.findFirst({
      columns: { id: true },
      where: and(eq(clients.id, clientId), isNull(clients.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E009, HttpStatus.NOT_FOUND);
    }
  }
}
