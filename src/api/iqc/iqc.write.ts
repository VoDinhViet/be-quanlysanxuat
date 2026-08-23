import { HttpStatus } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { ErrorCode } from '../../constants/error-code.constant';
import type { DbTransaction } from '../../database/database.type';
import {
  IqcStatus,
  QcFileKind,
  qcFiles,
  QcKind,
  qcRequests,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';

/** Hoàn tất phiếu IQC sau khi phiếu trả NCC liên kết được `post` — gọi bởi
 *  `SupplierReturnsService.postSupplierReturn`, trong CÙNG transaction với việc trừ tồn. Plain
 *  function nhận `tx`, không qua DI: `IqcModule` đã import `SupplierReturnsModule` (để
 *  `IqcService.confirmIqc` gọi `SupplierReturnsService.createFromIqcDisposition`), nên chiều
 *  ngược lại không thể đi qua DI mà không tạo vòng lặp module — repo hiện không dùng `forwardRef`
 *  ở đâu cả. Không đi qua `IqcService.resolveIqcStatus`/`confirmIqc` (guard của chúng không hợp
 *  với dòng đã `WAITING_RETURN`) — đây là transition riêng, chỉ hợp lệ đúng một lần, từ
 *  `WAITING_RETURN` sang `COMPLETED`. Chỉ đổi `status` của **request** — không phải một lần kiểm
 *  mới nên không sinh `qc_inspections`. Xem `docs/workflows/supplier-return.md`. */
export async function completeIqcAfterSupplierReturn(
  tx: DbTransaction,
  iqcId: string,
): Promise<void> {
  const request = await tx.query.qcRequests.findFirst({
    columns: { status: true },
    where: and(eq(qcRequests.kind, QcKind.INCOMING), eq(qcRequests.id, iqcId)),
  });

  if (!request) {
    throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
  }

  if (request.status !== IqcStatus.WAITING_RETURN) {
    throw new AppException(ErrorCode.E164, HttpStatus.CONFLICT);
  }

  await tx
    .update(qcRequests)
    .set({ status: IqcStatus.COMPLETED })
    .where(eq(qcRequests.id, iqcId));
}

/** Gắn bằng chứng cho MỘT attempt vừa tạo — attempt append-only nên đây luôn là insert vào một
 *  `inspectionId` chưa từng có dòng nào, không còn ý nghĩa "replace-all" như trên request cũ. Bắt
 *  buộc `tx` để tránh ghi ra ngoài transaction. Dùng chung `IqcService.confirmIqc`/
 *  `OqcService.confirmOqc` — plain function, không qua DI, cùng lý do `completeIqcAfterSupplierReturn`
 *  ở trên. */
export async function linkQcFiles(
  tx: DbTransaction,
  inspectionId: string,
  kind: QcFileKind,
  fileIds: string[],
): Promise<void> {
  if (!fileIds.length) {
    return;
  }

  await tx
    .insert(qcFiles)
    .values(fileIds.map((fileId) => ({ inspectionId, fileId, kind })));
}
