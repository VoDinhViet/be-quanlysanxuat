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
    description: 'Số Job khớp bộ lọc hiện tại có ít nhất 1 dòng công đoạn này',
  })
  jobCount!: number;
}
