import { Exclude, Expose } from 'class-transformer';

import {
  NcrStatus,
  QualityInspectionDecision,
  QualityInspectionStatus,
} from '../../../database/schemas';
import {
  EnumField,
  EnumFieldOptional,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

/** Tham chiếu NCR để truy vết (NCR cha / NCR con / NCR sinh ra từ một phiếu OQC). */
@Exclude()
export class NcrRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã NCR' })
  code!: string;

  @Expose()
  @EnumField(() => NcrStatus)
  status!: NcrStatus;
}

/** Tham chiếu phiếu OQC để truy vết (OQC nguồn của NCR, OQC lại của NCR). */
@Exclude()
export class NcrOqcRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu OQC' })
  code!: string;

  @Expose()
  @EnumField(() => QualityInspectionStatus)
  status!: QualityInspectionStatus;

  @Expose()
  @EnumFieldOptional(() => QualityInspectionDecision, { nullable: true })
  result!: QualityInspectionDecision | null;

  @Expose()
  @NumberField({ description: 'SL lô kiểm' })
  quantity!: number;
}
