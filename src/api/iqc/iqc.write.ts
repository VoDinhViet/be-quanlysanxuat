import { HttpStatus } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { ErrorCode } from '../../constants/error-code.constant';
import type { DbTransaction } from '../../database/database.type';
import { IqcStatus, QcKind, qualityInspections } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';

/** Hoàn tất phiếu IQC sau khi phiếu trả NCC liên kết được `post` — gọi bởi
 *  `SupplierReturnsService.postSupplierReturn`, trong CÙNG transaction với việc trừ tồn. Plain
 *  function nhận `tx`, không qua DI: `IqcModule` đã import `SupplierReturnsModule` (để
 *  `IqcService.confirmIqc` gọi `SupplierReturnsService.createFromIqcDisposition`), nên chiều
 *  ngược lại không thể đi qua DI mà không tạo vòng lặp module — repo hiện không dùng `forwardRef`
 *  ở đâu cả. Không đi qua `IqcService.resolveIqcStatus`/`confirmIqc` (guard của chúng không hợp
 *  với dòng đã `WAITING_RETURN`) — đây là transition riêng, chỉ hợp lệ đúng một lần, từ
 *  `WAITING_RETURN` sang `COMPLETED`. Xem `docs/workflows/supplier-return.md`. */
export async function completeIqcAfterSupplierReturn(
  tx: DbTransaction,
  iqcId: string,
): Promise<void> {
  const inspection = await tx.query.qualityInspections.findFirst({
    columns: { id: true, status: true },
    where: and(
      eq(qualityInspections.kind, QcKind.INCOMING),
      eq(qualityInspections.id, iqcId),
    ),
  });

  if (!inspection) {
    throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
  }

  if (inspection.status !== IqcStatus.WAITING_RETURN) {
    throw new AppException(ErrorCode.E164, HttpStatus.CONFLICT);
  }

  await tx
    .update(qualityInspections)
    .set({ status: IqcStatus.COMPLETED })
    .where(eq(qualityInspections.id, iqcId));
}
