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
  bomItemMaterials,
  clients,
  materialAttachments,
  materialGroups,
  materials,
  MaterialStatus,
  MaterialType,
  productionJobMaterials,
  suppliers,
  units,
  UnitScope,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { CreateMaterialReqDto } from './dto/create-material.req.dto';
import { GetMaterialsReqDto } from './dto/get-materials.req.dto';
import { MaterialDetailResDto } from './dto/material-detail.res.dto';
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

  async getMaterialDetail(materialId: string): Promise<MaterialDetailResDto> {
    const material = await this.db.query.materials.findFirst({
      where: eq(materials.id, materialId),
      with: MATERIAL_DETAIL_WITH,
    });

    if (!material) {
      throw new AppException(ErrorCode.E035, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(MaterialDetailResDto, material, {
      excludeExtraneousValues: true,
    });
  }

  async createMaterial(
    reqDto: CreateMaterialReqDto,
    userId: string,
  ): Promise<MaterialDetailResDto> {
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

    // `specificWeight` không cần transform: cột khai `mode: 'number'`, drizzle tự đổi qua lại
    // `numeric`.
    const { attachmentFileIds, ...materialFields } = reqDto;

    await this.linkMaterialFiles(reqDto);

    // Material và attachment phải vào cùng lúc — nếu không, insert attachment lỗi sẽ để lại một
    // material đã commit nhưng thiếu tài liệu.
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
  ): Promise<MaterialDetailResDto> {
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

    const {
      attachmentFileIds,
      clientId: requestedClientId,
      ...materialFields
    } = reqDto;

    // Validate lại cặp (type, clientId) mỗi khi một trong hai đổi — kể cả khi chỉ gửi một field,
    // so với giá trị *hiệu lực* của field còn lại (giá trị mới nếu gửi, không thì giá trị hiện
    // tại). Cùng cách làm với (department, position) ở `UsersService.updateUser`.
    let clientId: string | null | undefined;
    if (reqDto.type || requestedClientId !== undefined) {
      clientId = await this.resolveClientLink(
        reqDto.type ?? existing.type,
        requestedClientId !== undefined ? requestedClientId : existing.clientId,
      );
    }

    await this.linkMaterialFiles(reqDto);

    await this.db.transaction(async (tx) => {
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

  /** Hard delete — `materials` không có soft delete. Chặn khi vật tư còn được tham chiếu bởi một
   * node BOM hoặc một `production_job_materials` (`E041`) — cả hai FK `restrict`, không kiểm
   * trước sẽ lộ 500 thô thay vì 409 sạch. */
  async deleteMaterial(materialId: string): Promise<void> {
    await this.ensureMaterialExists(materialId);
    await this.ensureMaterialNotInUse(materialId);

    await this.db.delete(materials).where(eq(materials.id, materialId));
  }

  /** `type=CLIENT` bắt buộc có client tồn tại (E040); `type=INTERNAL` luôn xoá `clientId` dù có
   * gửi lên. Trả về `clientId` hiệu lực để ghi. */
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

  /** Xem `FilesService.linkFiles` — phải gọi trước khi mở transaction. */
  private async linkMaterialFiles(
    reqDto: CreateMaterialReqDto | UpdateMaterialReqDto,
  ): Promise<void> {
    const fileIds = [
      reqDto.imageFileId,
      ...(reqDto.attachmentFileIds ?? []),
    ].filter((fileId): fileId is string => !!fileId);

    await this.filesService.linkFiles(fileIds);
  }

  /** Nhận `tx` (không phải `this.db`) nên chỉ gọi được từ trong một transaction đang mở — truyền
   * connection pool thường sẽ là lỗi compile. */
  private async createAttachments(
    tx: DbTransaction,
    materialId: string,
    fileIds: string[],
  ): Promise<void> {
    await tx
      .insert(materialAttachments)
      .values(fileIds.map((fileId) => ({ materialId, fileId })));
  }

  /** Replace-all. Bắt buộc truyền `tx` để tránh ghi ra ngoài transaction. */
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

  /** Unit phải tồn tại *và* được đánh dấu dùng được cho materials — lọc dropdown qua
   * `GET /units?scope=MATERIAL` chỉ là cosmetic, client vẫn post được unit id bất kỳ. */
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

  private async ensureMaterialNotInUse(materialId: string): Promise<void> {
    const [usedInBom, usedInJob] = await Promise.all([
      this.db.query.bomItemMaterials.findFirst({
        columns: { id: true },
        where: eq(bomItemMaterials.materialId, materialId),
      }),
      this.db.query.productionJobMaterials.findFirst({
        columns: { id: true },
        where: eq(productionJobMaterials.materialId, materialId),
      }),
    ]);

    if (usedInBom || usedInJob) {
      throw new AppException(ErrorCode.E041, HttpStatus.CONFLICT);
    }
  }
}
