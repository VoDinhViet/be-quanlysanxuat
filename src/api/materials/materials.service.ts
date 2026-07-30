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
  bomItems,
  clients,
  materialAttachments,
  materialGroups,
  materials,
  MaterialStatus,
  MaterialType,
  suppliers,
  units,
  UnitScope,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { CreateMaterialReqDto } from './dto/create-material.req.dto';
import { GetMaterialsReqDto } from './dto/get-materials.req.dto';
import { MaterialResDto } from './dto/material.res.dto';
import { UpdateMaterialReqDto } from './dto/update-material.req.dto';

const MATERIAL_DETAIL_WITH = {
  unit: true,
  group: true,
  client: true,
  supplier: true,
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
      reqDto.supplierId
        ? eq(materials.supplierId, reqDto.supplierId)
        : undefined,
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
          supplier: true,
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

  /** Reads back a material with everything a `MaterialResDto` needs. */
  async getMaterialDetail(materialId: string): Promise<MaterialResDto> {
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
    if (reqDto.supplierId) {
      await this.ensureSupplierExists(reqDto.supplierId);
    }

    const type = reqDto.type ?? MaterialType.INTERNAL;
    const clientId = await this.resolveClientLink(
      type,
      reqDto.clientId ?? null,
    );
    const status = reqDto.status ?? MaterialStatus.ACTIVE;

    // `attachmentFileIds` lives in its own table, not a column on `materials` — peel it off so
    // the rest of the DTO spreads straight onto the row. `specificWeight` needs no transform:
    // the column is declared `mode: 'number'`, so drizzle converts it to/from `numeric` itself.
    const { attachmentFileIds, ...materialFields } = reqDto;

    await this.linkMaterialFiles(reqDto);

    // The material row and its attachments must land together: without this transaction a
    // failing attachment insert would leave a committed material with no documents.
    const materialId = await this.db.transaction(async (tx) => {
      const [material] = await tx
        .insert(materials)
        .values({
          ...materialFields,
          code,
          type,
          clientId,
          status,
          createdBy: userId,
        })
        .returning();

      if (attachmentFileIds?.length) {
        await this.createAttachments(tx, material.id, attachmentFileIds);
      }

      return material.id;
    });

    return this.getMaterialDetail(materialId);
  }

  async updateMaterial(
    materialId: string,
    reqDto: UpdateMaterialReqDto,
  ): Promise<MaterialResDto> {
    const existing = await this.ensureMaterialExists(materialId);

    if (reqDto.unitId) {
      await this.ensureUnitExists(reqDto.unitId);
    }
    if (reqDto.materialGroupId) {
      await this.ensureMaterialGroupExists(reqDto.materialGroupId);
    }
    if (reqDto.supplierId) {
      await this.ensureSupplierExists(reqDto.supplierId);
    }

    // `attachmentFileIds` replace-all lives in its own table; `clientId` needs re-validating
    // against the *effective* type before it can be written — peel both off so the rest of the
    // DTO spreads straight onto the row. `specificWeight` needs no transform (see `createMaterial`).
    const {
      attachmentFileIds,
      clientId: requestedClientId,
      ...materialFields
    } = reqDto;

    // Re-validate the (type, clientId) pair whenever either side changes — including when only
    // one of the two is sent, against the other's *effective* value (the new one if sent, else
    // the material's current one). Same idea as `UsersService.updateUser`'s (department,
    // position) re-validation.
    let clientId: string | null | undefined;
    if (reqDto.type || requestedClientId !== undefined) {
      clientId = await this.resolveClientLink(
        reqDto.type ?? existing.type,
        requestedClientId !== undefined ? requestedClientId : existing.clientId,
      );
    }

    await this.linkMaterialFiles(reqDto);

    await this.db.transaction(async (tx) => {
      // `updated_at` is bumped by the column's own `$onUpdate`.
      await tx
        .update(materials)
        .set({
          ...materialFields,
          ...(clientId !== undefined ? { clientId } : {}),
        })
        .where(eq(materials.id, materialId));

      if (attachmentFileIds !== undefined) {
        await this.replaceAttachments(tx, materialId, attachmentFileIds);
      }
    });

    return this.getMaterialDetail(materialId);
  }

  /**
   * Hard delete — `materials` has no soft delete (see schema comment: a material is either
   * ACTIVE or INACTIVE, never "deleted"). Blocked when the material is still referenced by a BOM
   * node (E041); the FK is `onDelete: 'restrict'`, so an unchecked delete would otherwise surface
   * as a raw 500 instead of a clean 409.
   */
  async deleteMaterial(materialId: string): Promise<void> {
    await this.ensureMaterialExists(materialId);
    await this.ensureMaterialNotInUse(materialId);

    await this.db.delete(materials).where(eq(materials.id, materialId));
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
   * Validates every file id the request carries and marks them linked, so the orphan sweeper
   * leaves them alone. Runs **before** the transaction on purpose — see `FilesService.linkFiles`.
   */
  private async linkMaterialFiles(
    reqDto: CreateMaterialReqDto | UpdateMaterialReqDto,
  ): Promise<void> {
    const fileIds = [
      reqDto.imageFileId,
      ...(reqDto.attachmentFileIds ?? []),
    ].filter((fileId): fileId is string => !!fileId);

    await this.filesService.linkFiles(fileIds);
  }

  /**
   * Writes the attachment rows. Takes `tx` (not `this.db`) so it can only ever be called from
   * inside an open transaction — passing the pooled connection is a compile error.
   */
  private async createAttachments(
    tx: DbTransaction,
    materialId: string,
    fileIds: string[],
  ): Promise<void> {
    await tx
      .insert(materialAttachments)
      .values(fileIds.map((fileId) => ({ materialId, fileId })));
  }

  /** Replace-all. `tx` is required so a caller cannot accidentally write outside the transaction. */
  private async replaceAttachments(
    tx: DbTransaction,
    materialId: string,
    fileIds: string[],
  ): Promise<void> {
    await tx
      .delete(materialAttachments)
      .where(eq(materialAttachments.materialId, materialId));

    if (fileIds.length) {
      await this.createAttachments(tx, materialId, fileIds);
    }
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

  private async ensureSupplierExists(supplierId: string): Promise<void> {
    const existing = await this.db.query.suppliers.findFirst({
      columns: { id: true },
      where: and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E019, HttpStatus.NOT_FOUND);
    }
  }

  /** Returns the columns callers need right after (`type`/`clientId`, to compute the "effective"
   * pair on a partial update) instead of a second re-fetch. */
  private async ensureMaterialExists(materialId: string): Promise<{
    id: string;
    type: MaterialType;
    clientId: string | null;
  }> {
    const existing = await this.db.query.materials.findFirst({
      columns: { id: true, type: true, clientId: true },
      where: eq(materials.id, materialId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E035, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  /**
   * Blocks hard-delete when the material is referenced by at least one BOM node — the FK is
   * `onDelete: 'restrict'` (see `bom_items.materialId`), so an unchecked delete would otherwise
   * surface as a raw 500 instead of a clean 409.
   */
  private async ensureMaterialNotInUse(materialId: string): Promise<void> {
    const used = await this.db.query.bomItems.findFirst({
      columns: { id: true },
      where: eq(bomItems.materialId, materialId),
    });

    if (used) {
      throw new AppException(ErrorCode.E041, HttpStatus.CONFLICT);
    }
  }
}
