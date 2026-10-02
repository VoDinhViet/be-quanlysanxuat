import { Exclude, Expose } from 'class-transformer';

import { OperationType } from '../../../database/schemas';
import {
  EnumField,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class ProductionExecutionOperationResDto {
  @Expose()
  @UUIDField({ description: 'Công đoạn id (operations.id)' })
  operationId!: string;

  @Expose()
  @StringField({ description: 'Mã công đoạn' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên hiển thị trên thẻ' })
  name!: string;

  @Expose()
  @EnumField(() => OperationType, { description: 'Loại công đoạn' })
  type!: OperationType;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Số Job khớp bộ lọc hiện tại còn công đoạn này chưa xong (operationStatus khác DONE)',
  })
  remainingJobCount!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Số Job có công đoạn này đang thực hiện (operationStatus = IN_PROGRESS)',
  })
  inProgressJobCount!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Số Job có công đoạn này quá hạn chưa xong (operationStatus = OVERDUE)',
  })
  overdueJobCount!: number;
}
