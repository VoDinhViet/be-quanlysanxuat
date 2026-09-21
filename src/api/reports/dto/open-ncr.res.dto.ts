import { Exclude, Expose } from 'class-transformer';

import { QcKind, QualityInspectionStatus } from '../../../database/schemas';
import {
  DateField,
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

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
  @EnumField(() => QualityInspectionStatus, {
    description:
      'PENDING (chờ chọn xử lý) / IN_PROGRESS (đang xử lý — IQC: chờ trả NCC, OQC: đang rework), phân biệt qua kind',
  })
  status!: QualityInspectionStatus;
}
