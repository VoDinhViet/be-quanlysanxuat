import { Exclude, Expose } from 'class-transformer';

import {
  DateFieldOptional,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

/** Một phiếu lãnh `APPROVED` đang giữ chỗ vật tư — một dòng của "Chi tiết số lượng đã giữ". */
@Exclude()
export class HeldRequisitionResDto {
  @Expose()
  @UUIDField({ description: 'Phiếu lãnh vật tư id' })
  requisitionId!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu lãnh' })
  code!: string;

  @Expose()
  @DateFieldOptional({ nullable: true, description: 'Ngày duyệt phiếu' })
  approvedAt!: Date | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Mã Job; phiếu loại OTHER không có Job',
  })
  jobCode!: string | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description:
      'Số PO của đơn hàng (phiếu PRODUCTION) hoặc lý do lãnh (phiếu OTHER)',
  })
  poOrReason!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Bộ phận lãnh' })
  departmentName!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Người lập phiếu' })
  creatorName!: string | null;

  @Expose()
  @NumberField({ description: 'Số lượng phiếu này đang giữ' })
  quantity!: number;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Ghi chú dòng vật tư, không có thì lấy ghi chú phiếu',
  })
  note!: string | null;
}
