import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class OpenIqcFailureResDto {
  @Expose()
  @UUIDField({ description: 'Id phiếu IQC, dùng cho quality_iqc_get' })
  id!: string;

  @Expose()
  @StringField({ description: 'Số phiếu kiểm không đạt' })
  inspectionNo!: string;

  @Expose()
  @StringField({ description: 'Loại phiếu kiểm, luôn là IQC' })
  inspectionType!: string;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Mã vật tư/sản phẩm' })
  itemCode!: string | null;

  @Expose()
  @NumberField({ description: 'Số lượng kiểm' })
  quantity!: number;

  @Expose()
  @StringField({ description: 'Trạng thái phiếu kiểm' })
  status!: string;

  @Expose()
  @NumberField({ int: true, description: 'Số ngày phiếu đã tồn đọng' })
  ageDays!: number;
}
