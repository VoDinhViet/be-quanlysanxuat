import { HttpStatus, Inject, Injectable, StreamableFile } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import type { ErrorDetailDto } from '../../common/dto/error-detail.dto';
import { buildXlsxBuffer, XLSX_MIME } from '../../common/utils/excel.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  InventoryAdjustmentReason,
  InventoryAdjustmentType,
  inventoryBalances,
  items,
  ItemStatus,
  ItemType,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { InventoryAdjustmentsService } from '../inventory-adjustments/inventory-adjustments.service';
import { ImportInventoryDirectRowReqDto } from './dto/import-inventory-direct-row.req.dto';
import { ImportInventoryDirectReqDto } from './dto/import-inventory-direct.req.dto';
import { InventoryDirectImportResDto } from './dto/inventory-direct-import.res.dto';
import {
  INVENTORY_IMPORT_MAX_ROWS,
  INVENTORY_IMPORT_TEMPLATE_COLUMNS,
  INVENTORY_IMPORT_TEMPLATE_NAME,
  parseActualQuantity,
  roundQuantity,
} from './inventory-direct.import';

type ImportCandidateItem = {
  id: string;
  code: string;
  revision: string;
  type: ItemType;
  status: ItemStatus;
  unitId: string;
};

type ResolvedImportRow = {
  importRow: ImportInventoryDirectRowReqDto;
  item: ImportCandidateItem | null;
  actualQuantity: number | null;
  errors: string[];
};

/** Nhập tồn thực tế vật tư (DIRECT) từ Excel: số trong file là tồn đúng sau kiểm kê, hệ thống tự
 * sinh phiếu điều chỉnh (PDC, lý do `STOCKTAKE`) cho phần chênh lệch và ghi sổ ngay.
 *
 * Rules:
 * - Web đọc file Excel, BE chỉ nhận các dòng đã tách và tự kiểm lại từng dòng.
 * - Tất cả hoặc không: còn một dòng lỗi thì không ghi sổ dòng nào (`E321`).
 * - Chênh lệch tính trên tồn đã khoá `FOR UPDATE` trong cùng transaction ghi sổ.
 *
 * See `docs/CODEMAPS/inventory.md`. */
@Injectable()
export class InventoryDirectImportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly inventoryAdjustmentsService: InventoryAdjustmentsService,
  ) {}

  /** File mẫu điền sẵn mọi vật tư đang dùng kèm tồn hiện tại để kho chỉ cần gõ cột "Tồn thực tế". */
  async downloadImportTemplate(): Promise<StreamableFile> {
    const activeDirects = await this.db
      .select({
        code: items.code,
        revision: items.revision,
        name: items.name,
        unitName: units.name,
        balanceQuantity: inventoryBalances.quantity,
      })
      .from(items)
      .innerJoin(units, eq(units.id, items.unitId))
      .leftJoin(inventoryBalances, eq(inventoryBalances.itemId, items.id))
      .where(
        and(
          isNull(items.deletedAt),
          eq(items.status, ItemStatus.ACTIVE),
          eq(items.type, ItemType.DIRECT),
        ),
      )
      .orderBy(asc(items.code), asc(items.revision));

    const buffer = await buildXlsxBuffer(
      'Tồn kho vật tư',
      INVENTORY_IMPORT_TEMPLATE_COLUMNS,
      activeDirects.map((direct) => ({
        ...direct,
        onHand: direct.balanceQuantity ?? 0,
      })),
    );

    return new StreamableFile(buffer, {
      type: XLSX_MIME,
      disposition: `attachment; filename="${INVENTORY_IMPORT_TEMPLATE_NAME}"`,
    });
  }

  /** Mọi delta bằng 0 (kiểm kê khớp sổ) là kết quả hợp lệ: trả `documents` rỗng, không sinh phiếu. */
  async importStock(
    reqDto: ImportInventoryDirectReqDto,
    userId: string,
  ): Promise<InventoryDirectImportResDto> {
    const resolvedRows = await this.resolveRows(reqDto.rows);
    this.ensureNoRowErrors(resolvedRows);

    // Khoá theo thứ tự `itemId` để hai lượt nhập chạy cùng lúc không chờ chéo nhau. Phiếu nhập/xuất
    // khoá theo thứ tự dòng phiếu nên vẫn có thể deadlock với chúng (Postgres huỷ một bên, thử lại).
    const stockTargets = resolvedRows
      .flatMap(({ item, actualQuantity, importRow }) =>
        item && actualQuantity !== null
          ? [
              {
                itemId: item.id,
                unitId: item.unitId,
                actualQuantity,
                note: importRow.note,
              },
            ]
          : [],
      )
      .sort((left, right) => (left.itemId < right.itemId ? -1 : 1));
    const itemIds = stockTargets.map((target) => target.itemId);

    const importResult = await this.db.transaction(async (tx) => {
      // Tạo sẵn dòng tồn 0 cho vật tư chưa từng phát sinh kho để `FOR UPDATE` bên dưới khoá được.
      await tx
        .insert(inventoryBalances)
        .values(itemIds.map((itemId) => ({ itemId, quantity: 0 })))
        .onConflictDoNothing({ target: inventoryBalances.itemId });

      const lockedBalances = await tx
        .select({
          itemId: inventoryBalances.itemId,
          quantity: inventoryBalances.quantity,
        })
        .from(inventoryBalances)
        .where(inArray(inventoryBalances.itemId, itemIds))
        .orderBy(asc(inventoryBalances.itemId))
        .for('update');
      const onHandByItemId = new Map(
        lockedBalances.map((balance) => [balance.itemId, balance.quantity]),
      );

      const stockChanges = stockTargets.map((target) => ({
        itemId: target.itemId,
        unitId: target.unitId,
        note: target.note,
        delta: roundQuantity(
          target.actualQuantity - (onHandByItemId.get(target.itemId) ?? 0),
        ),
      }));
      const adjustmentGroups = [
        {
          adjustmentType: InventoryAdjustmentType.INCREASE,
          lines: stockChanges.filter((change) => change.delta > 0),
        },
        {
          adjustmentType: InventoryAdjustmentType.DECREASE,
          lines: stockChanges.filter((change) => change.delta < 0),
        },
      ].filter(({ lines }) => lines.length > 0);

      const documents: InventoryDirectImportResDto['documents'] = [];
      for (const { adjustmentType, lines } of adjustmentGroups) {
        const adjustment =
          await this.inventoryAdjustmentsService.createPostedAdjustment(
            tx,
            {
              adjustmentType,
              reason: InventoryAdjustmentReason.STOCKTAKE,
              adjustmentDate: reqDto.adjustmentDate,
              note: reqDto.note ?? null,
              lines: lines.map((change) => ({
                itemId: change.itemId,
                unitId: change.unitId,
                quantity: Math.abs(change.delta),
                note: change.note,
              })),
            },
            userId,
          );
        documents.push({
          ...adjustment,
          adjustmentType,
          itemCount: lines.length,
        });
      }

      return {
        documents,
        unchangedCount: stockChanges.filter((change) => change.delta === 0)
          .length,
      };
    });

    return plainToInstance(InventoryDirectImportResDto, importResult, {
      excludeExtraneousValues: true,
    });
  }

  /** Tra item theo mã cho mọi dòng rồi kiểm từng dòng, gom lỗi thay vì dừng ở lỗi đầu tiên. */
  private async resolveRows(
    importRows: ImportInventoryDirectRowReqDto[],
  ): Promise<ResolvedImportRow[]> {
    if (importRows.length > INVENTORY_IMPORT_MAX_ROWS) {
      throw new AppException(
        ErrorCode.E321,
        HttpStatus.UNPROCESSABLE_ENTITY,
        `Tối đa ${INVENTORY_IMPORT_MAX_ROWS} dòng mỗi lần nhập`,
      );
    }

    const itemCodes = [
      ...new Set(
        importRows.flatMap((importRow) => importRow.itemCode?.trim() || []),
      ),
    ];
    const candidateItems = itemCodes.length
      ? await this.db
          .select({
            id: items.id,
            code: items.code,
            revision: items.revision,
            type: items.type,
            status: items.status,
            unitId: items.unitId,
          })
          .from(items)
          .where(and(isNull(items.deletedAt), inArray(items.code, itemCodes)))
      : [];

    const candidatesByCode = new Map<string, ImportCandidateItem[]>();
    for (const item of candidateItems) {
      candidatesByCode.set(item.code, [
        ...(candidatesByCode.get(item.code) ?? []),
        item,
      ]);
    }

    const firstRowByItemId = new Map<string, number>();
    return importRows.map((importRow) => {
      const errors: string[] = [];
      const item = this.matchItem(importRow, candidatesByCode, errors);
      const actualQuantity = parseActualQuantity(importRow.actualQuantity);
      if (actualQuantity === null) {
        errors.push('Tồn thực tế phải là số không âm, tối đa 3 số lẻ');
      }

      const firstRow = item ? firstRowByItemId.get(item.id) : undefined;
      if (firstRow !== undefined) {
        errors.push(`Trùng vật tư với dòng ${firstRow}`);
      } else if (item) {
        firstRowByItemId.set(item.id, importRow.rowNumber);
      }

      return { importRow, item, actualQuantity, errors };
    });
  }

  /** Bỏ trống phiên bản chỉ hợp lệ khi mã có đúng một bản chưa xoá. Vẫn trả item khi nó không phải
   * vật tư hoặc đã ngừng dùng để vẫn bắt được dòng trùng. */
  private matchItem(
    importRow: ImportInventoryDirectRowReqDto,
    candidatesByCode: Map<string, ImportCandidateItem[]>,
    errors: string[],
  ): ImportCandidateItem | null {
    const itemCode = importRow.itemCode?.trim();
    if (!itemCode) {
      errors.push('Thiếu mã vật tư');
      return null;
    }

    const candidates = candidatesByCode.get(itemCode) ?? [];
    const revision = importRow.revision?.trim();
    if (candidates.length === 0) {
      errors.push('Mã vật tư không tồn tại');
      return null;
    }
    if (!revision && candidates.length > 1) {
      errors.push('Mã có nhiều phiên bản, cần ghi rõ phiên bản');
      return null;
    }

    const item = revision
      ? candidates.find((candidate) => candidate.revision === revision)
      : candidates[0];
    if (!item) {
      errors.push(`Không có phiên bản ${revision}`);
      return null;
    }

    if (item.type !== ItemType.DIRECT) errors.push('Không phải vật tư');
    if (item.status !== ItemStatus.ACTIVE) {
      errors.push('Vật tư đã ngừng sử dụng');
    }
    return item;
  }

  private ensureNoRowErrors(resolvedRows: ResolvedImportRow[]): void {
    const rowErrors: ErrorDetailDto[] = resolvedRows.flatMap(
      ({ importRow, errors }) =>
        errors.map((message) => ({
          property: `Dòng ${importRow.rowNumber}`,
          code: 'invalid',
          message,
        })),
    );
    if (rowErrors.length === 0) return;

    const invalidRowCount = resolvedRows.filter(
      ({ errors }) => errors.length > 0,
    ).length;
    throw new AppException(
      ErrorCode.E321,
      HttpStatus.UNPROCESSABLE_ENTITY,
      `File có ${invalidRowCount} dòng lỗi, chưa ghi sổ dòng nào`,
      rowErrors,
    );
  }
}
