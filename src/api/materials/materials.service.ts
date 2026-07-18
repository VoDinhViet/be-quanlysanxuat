import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count as drizzleCount, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { PageOptionsDto } from '../../common/dto/offset-pagination/page-options.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  clients,
  materialAttachments,
  materialGroups,
  materialLogs,
  materials,
  MaterialStatus,
  MaterialType,
  suppliers,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateMaterialReqDto } from './dto/create-material.req.dto';
import { GetMaterialsReqDto } from './dto/get-materials.req.dto';
import { MaterialLogResDto } from './dto/material-log.res.dto';
import { MaterialResDto } from './dto/material.res.dto';
import { UpdateMaterialReqDto } from './dto/update-material.req.dto';

const MATERIAL_DETAIL_WITH = {
  unit: true,
  group: true,
  client: true,
  preferredSupplier: true,
  creator: true,
  attachments: true,
} as const;

@Injectable()
export class MaterialsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getMaterials(reqDto: GetMaterialsReqDto): Promise<OffsetPaginatedDto<MaterialResDto>> {
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
      reqDto.materialGroupId ? eq(materials.materialGroupId, reqDto.materialGroupId) : undefined,
      reqDto.clientId ? eq(materials.clientId, reqDto.clientId) : undefined,
      reqDto.status ? eq(materials.status, reqDto.status) : undefined,
    );

    const [entities, count] = await Promise.all([
      this.db.query.materials.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(materials.createdAt),
        with: { unit: true, group: true, client: true, creator: true },
      }),
      this.db.select({ total: drizzleCount() }).from(materials).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(MaterialResDto, entities, { excludeExtraneousValues: true }),
      new OffsetPaginationDto(count[0]?.total ?? 0, reqDto),
    );
  }

  async getMaterialDetail(materialId: string): Promise<MaterialResDto> {
    const material = await this.db.query.materials.findFirst({
      where: eq(materials.id, materialId),
      with: MATERIAL_DETAIL_WITH,
    });

    if (!material) {
      throw new AppException(ErrorCode.E035, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(MaterialResDto, material, { excludeExtraneousValues: true });
  }

  async getMaterialLogs(
    materialId: string,
    reqDto: PageOptionsDto,
  ): Promise<OffsetPaginatedDto<MaterialLogResDto>> {
    await this.ensureMaterialExists(materialId);

    const where = eq(materialLogs.materialId, materialId);
    const [entities, count] = await Promise.all([
      this.db.query.materialLogs.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(materialLogs.createdAt),
        with: { changer: true },
      }),
      this.db.select({ total: drizzleCount() }).from(materialLogs).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(MaterialLogResDto, entities, { excludeExtraneousValues: true }),
      new OffsetPaginationDto(count[0]?.total ?? 0, reqDto),
    );
  }

  async createMaterial(reqDto: CreateMaterialReqDto, userId: string): Promise<MaterialResDto> {
    let code = reqDto.code;
    if (code) {
      await this.validateCodeUniqueness(code);
    } else {
      code = await this.generateMaterialCode();
    }

    await this.ensureUnitExists(reqDto.unitId);
    await this.ensureMaterialGroupExists(reqDto.materialGroupId);
    if (reqDto.preferredSupplierId) {
      await this.ensurePreferredSupplierExists(reqDto.preferredSupplierId);
    }

    const type = reqDto.type ?? MaterialType.INTERNAL;
    const clientId = await this.resolveClientLink(type, reqDto.clientId ?? null);
    const status = reqDto.status ?? MaterialStatus.ACTIVE;

    const [material] = await this.db
      .insert(materials)
      .values({
        code,
        name: reqDto.name,
        unitId: reqDto.unitId,
        materialGroupId: reqDto.materialGroupId,
        type,
        clientId,
        imageUrl: reqDto.imageUrl,
        status,
        note: reqDto.note,
        materialGrade: reqDto.materialGrade,
        technicalStandard: reqDto.technicalStandard,
        dimensions: reqDto.dimensions,
        specificWeight: reqDto.specificWeight != null ? String(reqDto.specificWeight) : undefined,
        colorSurface: reqDto.colorSurface,
        description: reqDto.description,
        origin: reqDto.origin,
        preferredSupplierId: reqDto.preferredSupplierId,
        leadTime: reqDto.leadTime,
        createdBy: userId,
      })
      .returning();

    if (reqDto.attachments?.length) {
      await this.replaceAttachments(material.id, reqDto.attachments);
    }

    await this.recordLog(material.id, 'CREATE', { code, name: reqDto.name, type, status }, userId);

    return this.getMaterialDetail(material.id);
  }

  async updateMaterial(
    materialId: string,
    reqDto: UpdateMaterialReqDto,
    userId: string,
  ): Promise<MaterialResDto> {
    const existing = await this.ensureMaterialExists(materialId);

    if (reqDto.unitId) {
      await this.ensureUnitExists(reqDto.unitId);
    }
    if (reqDto.materialGroupId) {
      await this.ensureMaterialGroupExists(reqDto.materialGroupId);
    }
    if (reqDto.preferredSupplierId) {
      await this.ensurePreferredSupplierExists(reqDto.preferredSupplierId);
    }

    // Re-resolve the client link only when type or clientId is being touched.
    let typeUpdate: MaterialType | undefined;
    let clientIdUpdate: string | null | undefined;
    if (reqDto.type !== undefined || reqDto.clientId !== undefined) {
      const effectiveType = reqDto.type ?? existing.type;
      const candidate = reqDto.clientId !== undefined ? reqDto.clientId : existing.clientId;
      clientIdUpdate = await this.resolveClientLink(effectiveType, candidate ?? null);
      typeUpdate = effectiveType;
    }

    const materialUpdate = {
      name: reqDto.name,
      unitId: reqDto.unitId,
      materialGroupId: reqDto.materialGroupId,
      type: typeUpdate,
      clientId: clientIdUpdate,
      imageUrl: reqDto.imageUrl,
      status: reqDto.status,
      note: reqDto.note,
      materialGrade: reqDto.materialGrade,
      technicalStandard: reqDto.technicalStandard,
      dimensions: reqDto.dimensions,
      specificWeight:
        reqDto.specificWeight !== undefined
          ? reqDto.specificWeight === null
            ? null
            : String(reqDto.specificWeight)
          : undefined,
      colorSurface: reqDto.colorSurface,
      description: reqDto.description,
      origin: reqDto.origin,
      preferredSupplierId: reqDto.preferredSupplierId,
      leadTime: reqDto.leadTime,
    };

    const changes = this.computeChanges(existing, materialUpdate);

    if (Object.values(materialUpdate).some((value) => value !== undefined)) {
      await this.db.update(materials).set(materialUpdate).where(eq(materials.id, materialId));
    }

    if (reqDto.attachments) {
      await this.replaceAttachments(materialId, reqDto.attachments);
      changes.attachments = { replaced: reqDto.attachments.length };
    }

    if (Object.keys(changes).length > 0) {
      await this.recordLog(materialId, 'UPDATE', changes, userId);
    }

    return this.getMaterialDetail(materialId);
  }

  async deleteMaterial(materialId: string): Promise<void> {
    await this.ensureMaterialExists(materialId);
    await this.ensureNoTransactions();

    // Hard delete — attachments and logs cascade. No soft delete for materials.
    await this.db.delete(materials).where(eq(materials.id, materialId));
  }

  private computeChanges(
    existing: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Record<string, unknown> {
    const changes: Record<string, unknown> = {};

    for (const [key, next] of Object.entries(update)) {
      if (next === undefined) {
        continue;
      }
      const prev = existing[key] ?? null;
      const normalizedNext = next ?? null;
      if (JSON.stringify(prev) !== JSON.stringify(normalizedNext)) {
        changes[key] = { from: prev, to: normalizedNext };
      }
    }

    return changes;
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

  private async replaceAttachments(
    materialId: string,
    attachments: CreateMaterialReqDto['attachments'],
  ): Promise<void> {
    await this.db.delete(materialAttachments).where(eq(materialAttachments.materialId, materialId));

    if (attachments?.length) {
      await this.db.insert(materialAttachments).values(
        attachments.map((attachment) => ({
          materialId,
          url: attachment.url,
          filename: attachment.filename,
          mimetype: attachment.mimetype,
          size: attachment.size,
        })),
      );
    }
  }

  private async recordLog(
    materialId: string,
    action: 'CREATE' | 'UPDATE',
    changes: Record<string, unknown>,
    changedBy: string,
  ): Promise<void> {
    await this.db.insert(materialLogs).values({ materialId, action, changes, changedBy });
  }

  private async generateMaterialCode(): Promise<string> {
    const [totalRows] = await this.db.select({ total: drizzleCount() }).from(materials);
    return `VT${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }

  private async ensureMaterialExists(materialId: string) {
    const existing = await this.db.query.materials.findFirst({
      where: eq(materials.id, materialId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E035, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private async validateCodeUniqueness(code: string, ignoredMaterialId?: string): Promise<void> {
    const where = ignoredMaterialId
      ? and(eq(materials.code, code), ne(materials.id, ignoredMaterialId))
      : eq(materials.code, code);

    const existing = await this.db.query.materials.findFirst({ columns: { id: true }, where });

    if (existing) {
      throw new AppException(ErrorCode.E036, HttpStatus.CONFLICT);
    }
  }

  private async ensureUnitExists(unitId: string): Promise<void> {
    const existing = await this.db.query.units.findFirst({
      columns: { id: true },
      where: eq(units.id, unitId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E011, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureMaterialGroupExists(materialGroupId: string): Promise<void> {
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

  private async ensurePreferredSupplierExists(supplierId: string): Promise<void> {
    const existing = await this.db.query.suppliers.findFirst({
      columns: { id: true },
      where: and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E019, HttpStatus.NOT_FOUND);
    }
  }

  /**
   * Placeholder for the "delete only when no transaction exists" rule. No inventory/PO/BOM tables
   * reference materials yet, so there is nothing to check — this is where that guard (E041) will
   * be wired once those modules exist.
   */
  private async ensureNoTransactions(): Promise<void> {
    // No inventory/PO/BOM tables reference materials yet; when they do, check them here and
    // throw AppException(ErrorCode.E041, HttpStatus.CONFLICT) if the material is in use.
    return Promise.resolve();
  }
}
