import { Exclude, Expose } from 'class-transformer';

import { IqcStatus, OqcStatus, QcKind } from '../../../database/schemas';
import {
  DateField,
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

// 3 giá trị "mở" duy nhất OPEN_NCR (reports.service.ts) có thể trả — PENDING (cả 2 kind),
// WAITING_RETURN (chỉ IQC), REWORK (chỉ OQC). Không enum nào trong IqcStatus/OqcStatus một mình
// phủ đủ 3 giá trị này nên gộp riêng cho DTO này.
const OpenNcrStatus = {
  PENDING: IqcStatus.PENDING,
  WAITING_RETURN: IqcStatus.WAITING_RETURN,
  REWORK: OqcStatus.REWORK,
} as const;

@Exclude()
export class OpenNcrResDto {
  @Expose()
  @UUIDField({ description: 'QC request id' })
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu — IQC-{năm}-{5} hoặc OQC-{năm}-{5}' })
  code!: string;

  @Expose()
  @EnumField(() => QcKind, {
    description: 'Nguồn — INCOMING = IQC, OUTGOING = OQC',
  })
  kind!: QcKind;

  @Expose()
  @DateField({ description: 'Ngày tạo phiếu' })
  createdAt!: Date;

  @Expose()
  @EnumField(() => OpenNcrStatus, {
    description:
      'PENDING (chờ chọn xử lý) / WAITING_RETURN (IQC, chờ trả NCC) / REWORK (OQC, làm lại)',
  })
  status!: IqcStatus | OqcStatus;
}
