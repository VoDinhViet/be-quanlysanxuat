import { Exclude, Expose } from 'class-transformer';

import {
  EnumField,
  NumberFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { TraceStep } from '../traces.constant';

@Exclude()
export class TraceStepResDto {
  @Expose()
  @EnumField(() => TraceStep, { description: 'Loại chứng từ ở bước truy vết' })
  step!: TraceStep;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Mã chứng từ' })
  code!: string | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Trạng thái của chứng từ',
  })
  status!: string | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Hạn của chứng từ (YYYY-MM-DD)',
  })
  dueDate!: string | null;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description: 'Số lượng của chứng từ; null khi không có nghĩa',
  })
  quantity!: number | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Mã chứng từ cha mà bước này nối vào',
  })
  parentCode!: string | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Ghi chú của bước (khách hàng, nhà cung cấp, kết quả kiểm...)',
  })
  note!: string | null;
}
