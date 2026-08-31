import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  inventoryBalances,
  InventoryReferenceType,
  inventoryTransactions,
  InventoryTransactionType,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';

export interface InventoryPostingLine {
  itemId: string;
  /** Có dấu — dương cộng tồn, âm trừ tồn. Nơi gọi (`InventoryReceiptsService`/
   * `InventoryIssuesService`) chịu trách nhiệm gắn dấu theo loại phiếu. */
  signedQuantity: number;
  type: InventoryTransactionType;
  orderItemId?: string | null;
}

/** Ngữ cảnh chứng từ đang ghi bút toán — dùng chung giữa `postDocument`/`applyLine`. */
export interface InventoryPostingContext {
  referenceType: InventoryReferenceType;
  referenceId: string;
  transactionDate: Date;
  createdBy: string;
}

export interface PostDocumentInput extends InventoryPostingContext {
  lines: InventoryPostingLine[];
}

export type ReverseDocumentInput = InventoryPostingContext;

/** Nơi duy nhất ghi `inventory_transactions`/`inventory_balances` — cả phiếu nhập lẫn phiếu xuất
 * đều đi qua đây lúc `post`/`cancel`, tránh chép công thức tồn ra hai chỗ (bug đã có ở thiết kế cũ:
 * `InventoryService.materialStockSubquery` và `StockReceiptsService.ensureSufficientStock` từng
 * lệch nhau). Xem `docs/domains/inventory.md`, `docs/workflows/stock-movement.md`. */
@Injectable()
export class InventoryPostingService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Ghi mọi dòng của một phiếu trong transaction của nơi gọi — khoá từng dòng
   * `inventory_balances` bằng `FOR UPDATE` trước khi cộng/trừ, chặn tồn âm bằng `E106`. */
  async postDocument(
    tx: DbTransaction,
    document: PostDocumentInput,
  ): Promise<void> {
    for (const line of document.lines) {
      await this.applyLine(tx, {
        referenceType: document.referenceType,
        referenceId: document.referenceId,
        transactionDate: document.transactionDate,
        createdBy: document.createdBy,
        ...line,
      });
    }
  }

  /** Đọc lại mọi bút toán đã sinh cho phiếu này lúc `post`, ghi bút toán **đảo dấu** (append-only —
   * không sửa/xoá bút toán cũ) để trả `inventory_balances` về như trước khi post. Dùng
   * `ADJUSTMENT_IN`/`ADJUSTMENT_OUT` cho bút toán đảo bất kể loại gốc — huỷ phiếu là một bút toán
   * điều chỉnh, không phải một lượt nhập/xuất/sản xuất thật lần hai. */
  async reverseDocument(
    tx: DbTransaction,
    document: ReverseDocumentInput,
  ): Promise<void> {
    const originalTransactions = await tx.query.inventoryTransactions.findMany({
      where: and(
        eq(inventoryTransactions.referenceType, document.referenceType),
        eq(inventoryTransactions.referenceId, document.referenceId),
      ),
    });

    for (const originalTransaction of originalTransactions) {
      const signedQuantity = -originalTransaction.quantity;
      await this.applyLine(tx, {
        referenceType: document.referenceType,
        referenceId: document.referenceId,
        transactionDate: document.transactionDate,
        createdBy: document.createdBy,
        itemId: originalTransaction.itemId,
        signedQuantity,
        type:
          signedQuantity > 0
            ? InventoryTransactionType.ADJUSTMENT_IN
            : InventoryTransactionType.ADJUSTMENT_OUT,
        orderItemId: originalTransaction.orderItemId,
      });
    }
  }

  private async applyLine(
    tx: DbTransaction,
    line: InventoryPostingLine & InventoryPostingContext,
  ): Promise<void> {
    const [existing] = await tx
      .select()
      .from(inventoryBalances)
      .where(eq(inventoryBalances.itemId, line.itemId))
      .for('update');

    const newQuantity = (existing?.quantity ?? 0) + line.signedQuantity;
    if (newQuantity < 0) {
      throw new AppException(ErrorCode.E106, HttpStatus.CONFLICT);
    }

    if (existing) {
      await tx
        .update(inventoryBalances)
        .set({ quantity: newQuantity })
        .where(eq(inventoryBalances.id, existing.id));
    } else {
      await tx.insert(inventoryBalances).values({
        itemId: line.itemId,
        quantity: newQuantity,
      });
    }

    await tx.insert(inventoryTransactions).values({
      itemId: line.itemId,
      type: line.type,
      quantity: line.signedQuantity,
      referenceType: line.referenceType,
      referenceId: line.referenceId,
      orderItemId: line.orderItemId,
      transactionDate: line.transactionDate,
      createdBy: line.createdBy,
    });
  }
}
