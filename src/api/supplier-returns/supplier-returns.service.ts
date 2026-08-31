import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, eq, exists, or, sql } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import {
  DocumentType,
  generateDocumentSequence,
} from '../../common/utils/document-sequence.util';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  inventoryReceipts,
  InventoryReferenceType,
  InventoryTransactionType,
  items,
  purchaseOrders,
  QualityInspectionType,
  qualityInspections,
  supplierReturnFiles,
  supplierReturns,
  type SupplierReturnSelect,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { InventoryPostingService } from '../inventory/inventory-posting.service';
import { completeIqcAfterSupplierReturn } from '../iqc/iqc.write';
import { GetSupplierReturnsReqDto } from './dto/get-supplier-returns.req.dto';
import { PageSupplierReturnResDto } from './dto/page-supplier-return.res.dto';
import { PostSupplierReturnReqDto } from './dto/post-supplier-return.req.dto';
import { SupplierReturnResDto } from './dto/supplier-return.res.dto';

@Injectable()
export class SupplierReturnsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly inventoryPostingService: InventoryPostingService,
    private readonly filesService: FilesService,
  ) {}

  async getSupplierReturns(
    reqDto: GetSupplierReturnsReqDto,
  ): Promise<OffsetPaginatedDto<PageSupplierReturnResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const materialKeyword = reqDto.materialKeyword
      ? `%${reqDto.materialKeyword}%`
      : undefined;
    const poKeyword = reqDto.poCode ? `%${reqDto.poCode}%` : undefined;
    const nkKeyword = reqDto.nkCode ? `%${reqDto.nkCode}%` : undefined;

    const where = and(
      keyword ? unaccentILike(supplierReturns.code, keyword) : undefined,
      reqDto.supplierId
        ? eq(supplierReturns.supplierId, reqDto.supplierId)
        : undefined,
      reqDto.status ? eq(supplierReturns.status, reqDto.status) : undefined,
      reqDto.iqcCode
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(qualityInspections)
              .where(
                and(
                  eq(
                    qualityInspections.inspectionType,
                    QualityInspectionType.IQC,
                  ),
                  eq(
                    qualityInspections.id,
                    supplierReturns.qualityInspectionId,
                  ),
                  unaccentILike(
                    qualityInspections.inspectionNo,
                    `%${reqDto.iqcCode}%`,
                  ),
                ),
              ),
          )
        : undefined,
      materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(items)
              .where(
                and(
                  eq(items.id, supplierReturns.itemId),
                  or(
                    unaccentILike(items.name, materialKeyword),
                    unaccentILike(items.code, materialKeyword),
                  ),
                ),
              ),
          )
        : undefined,
      poKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(purchaseOrders)
              .where(
                and(
                  eq(purchaseOrders.id, supplierReturns.purchaseOrderId),
                  unaccentILike(purchaseOrders.code, poKeyword),
                ),
              ),
          )
        : undefined,
      nkKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(inventoryReceipts)
              .where(
                and(
                  eq(inventoryReceipts.id, supplierReturns.inventoryReceiptId),
                  unaccentILike(inventoryReceipts.code, nkKeyword),
                ),
              ),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.supplierReturns.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(supplierReturns.createdAt),
        with: {
          item: { with: { unit: true } },
          supplier: true,
          purchaseOrder: true,
          inventoryReceipt: true,
          outsourcingReceipt: true,
          qualityInspection: true,
          creatorBy: true,
        },
      }),
      this.db.select({ total: count() }).from(supplierReturns).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(
        PageSupplierReturnResDto,
        entities.map((entity) => ({
          ...entity,
          iqc: this.toIqcRef(entity.qualityInspection),
        })),
        { excludeExtraneousValues: true },
      ),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** `SupplierReturnBaseResDto.iqc` giữ tên/field cũ (`{id, code}`, xem `IqcRefResDto`) cho FE dù
   * bảng nguồn đã đổi tên — `code` lấy từ `inspectionNo` của `quality_inspections`. */
  private toIqcRef(
    qualityInspection: { id: string; inspectionNo: string } | null,
  ): { id: string; code: string } | null {
    return qualityInspection
      ? { id: qualityInspection.id, code: qualityInspection.inspectionNo }
      : null;
  }

  async getSupplierReturn(
    supplierReturnId: string,
  ): Promise<SupplierReturnResDto> {
    const supplierReturn = await this.db.query.supplierReturns.findFirst({
      where: eq(supplierReturns.id, supplierReturnId),
      with: {
        item: { with: { unit: true } },
        supplier: true,
        purchaseOrder: true,
        inventoryReceipt: true,
        outsourcingReceipt: true,
        qualityInspection: true,
        creatorBy: true,
        posterBy: true,
        qualityInspectionResult: true,
        files: { with: { file: true } },
      },
    });

    if (!supplierReturn) {
      throw new AppException(ErrorCode.E137, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(
      SupplierReturnResDto,
      {
        ...supplierReturn,
        iqc: this.toIqcRef(supplierReturn.qualityInspection),
        returnReason:
          supplierReturn.qualityInspectionResult?.dispositionNote ?? null,
        files: supplierReturn.files.map((row) => row.file),
      },
      { excludeExtraneousValues: true },
    );
  }

  /** Tự sinh DRAFT — gọi bởi `IqcService.confirmIqc` khi QC chọn disposition SORT/RETURN, ngay
   *  sau khi dòng IQC chuyển `WAITING_RETURN`, cùng transaction với việc khoá dòng đó lại (bắt
   *  buộc `tx`, không mở transaction riêng). Xem `docs/workflows/supplier-return.md`. */
  async createFromIqcDisposition(
    tx: DbTransaction,
    params: {
      qualityInspectionId: string;
      qualityInspectionResultId: string;
      supplierId: string;
      itemId: string;
      quantity: number;
      purchaseOrderId: string | null;
      inventoryReceiptId: string | null;
      outsourcingReceiptId: string | null;
      returnDate: Date;
      userId: string;
    },
  ): Promise<void> {
    const code = await this.generateReturnCode(tx, params.returnDate);

    await tx.insert(supplierReturns).values({
      code,
      supplierId: params.supplierId,
      itemId: params.itemId,
      quantity: params.quantity,
      purchaseOrderId: params.purchaseOrderId,
      inventoryReceiptId: params.inventoryReceiptId,
      outsourcingReceiptId: params.outsourcingReceiptId,
      qualityInspectionId: params.qualityInspectionId,
      qualityInspectionResultId: params.qualityInspectionResultId,
      qcInspectionType: QualityInspectionType.IQC,
      returnDate: params.returnDate,
      status: InventoryDocumentStatus.DRAFT,
      createdBy: params.userId,
    });
  }

  /** `DRAFT → POSTED` — kho xác nhận đã thật sự xuất hàng trả NCC. Trừ tồn qua
   *  `InventoryPostingService` (bỏ qua nếu phiếu nhập gốc chưa `POSTED` hoặc sinh từ OS-IN — xem
   *  `shouldPostStock`), rồi hoàn tất luôn dòng IQC liên kết (`completeIqcAfterSupplierReturn`)
   *  trong cùng transaction. `reqDto.note`/`fileIds` tuỳ chọn — bằng chứng xuất trả, không ảnh
   *  hưởng transition. Xem `docs/workflows/supplier-return.md`. */
  async postSupplierReturn(
    supplierReturnId: string,
    reqDto: PostSupplierReturnReqDto,
    userId: string,
  ): Promise<void> {
    if (reqDto.fileIds?.length) {
      await this.filesService.linkFiles(reqDto.fileIds);
    }

    await this.db.transaction(async (tx) => {
      const supplierReturn = await this.getSupplierReturnForUpdate(
        tx,
        supplierReturnId,
      );

      if (supplierReturn.status !== InventoryDocumentStatus.DRAFT) {
        throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
      }

      if (await this.shouldPostStock(tx, supplierReturn)) {
        await this.inventoryPostingService.postDocument(tx, {
          referenceType: InventoryReferenceType.SUPPLIER_RETURN,
          referenceId: supplierReturn.id,
          transactionDate: supplierReturn.returnDate,
          createdBy: userId,
          lines: [
            {
              itemId: supplierReturn.itemId,
              // Xuất trả luôn trừ tồn — dấu âm.
              signedQuantity: -supplierReturn.quantity,
              type: InventoryTransactionType.ISSUE,
            },
          ],
        });
      }

      await tx
        .update(supplierReturns)
        .set({
          status: InventoryDocumentStatus.POSTED,
          postedBy: userId,
          postedAt: new Date(),
          postNote: reqDto.note ?? null,
        })
        .where(eq(supplierReturns.id, supplierReturnId));

      if (reqDto.fileIds?.length) {
        await tx.insert(supplierReturnFiles).values(
          reqDto.fileIds.map((fileId) => ({
            supplierReturnId,
            fileId,
          })),
        );
      }

      if (supplierReturn.qualityInspectionId) {
        await completeIqcAfterSupplierReturn(
          tx,
          supplierReturn.qualityInspectionId,
          userId,
        );
      }
    });
  }

  /** Hai ca bỏ qua trừ tồn, còn lại luôn trừ:
   *  1. Phiếu nhập gốc chưa `POSTED` — IQC chạy trước khi phiếu nhập ghi tồn (`PENDING_IQC` chưa
   *     đụng `inventory_balances`), trừ vào đó sẽ ra âm giả (`E106`) hoặc trừ nhầm tồn của lô khác.
   *     `postInventoryReceipt` tự bù trừ số lượng đã trả `POSTED` trước khi ghi bút toán `RECEIPT`
   *     (`getReturnedQuantityByReceiptItemId`), nên không ghi thiếu tồn.
   *  2. Sinh từ IQC của OS-IN (`outsourcingReceiptId` có giá trị) — hàng đó chưa từng vào tồn
   *     (`docs/decisions/wip-not-stocked.md`, gia công ngoài không ghi `inventory_balances`), trừ
   *     vào cũng ra âm giả.
   *  Không có phiếu nhập/OS-IN liên quan (IQC tạo tay) → luôn trừ tồn bình thường. */
  private async shouldPostStock(
    tx: DbTransaction,
    supplierReturn: Pick<
      SupplierReturnSelect,
      'inventoryReceiptId' | 'outsourcingReceiptId'
    >,
  ): Promise<boolean> {
    if (supplierReturn.outsourcingReceiptId) {
      return false;
    }

    if (!supplierReturn.inventoryReceiptId) {
      return true;
    }

    const inventoryReceipt = await tx.query.inventoryReceipts.findFirst({
      columns: { status: true },
      where: eq(inventoryReceipts.id, supplierReturn.inventoryReceiptId),
    });

    return inventoryReceipt?.status === InventoryDocumentStatus.POSTED;
  }

  /** Khoá dòng phiếu (`FOR UPDATE`) rồi trả về — chỉ gọi bên trong transaction, cùng lý do
   *  `InventoryIssuesService.getInventoryIssueForUpdate`: chặn `post` trùng lên cùng phiếu trừ tồn
   *  hai lần. */
  private async getSupplierReturnForUpdate(
    tx: DbTransaction,
    supplierReturnId: string,
  ) {
    const [supplierReturn] = await tx
      .select()
      .from(supplierReturns)
      .where(eq(supplierReturns.id, supplierReturnId))
      .for('update');

    if (!supplierReturn) {
      throw new AppException(ErrorCode.E137, HttpStatus.NOT_FOUND);
    }

    return supplierReturn;
  }

  private async generateReturnCode(
    tx: DbTransaction,
    returnDate: Date,
  ): Promise<string> {
    const year = returnDate.getFullYear();
    const sequence = await generateDocumentSequence(
      tx,
      DocumentType.SUPPLIER_RETURN,
      year,
    );

    return `PTNCC-${year}-${String(sequence).padStart(5, '0')}`;
  }
}
