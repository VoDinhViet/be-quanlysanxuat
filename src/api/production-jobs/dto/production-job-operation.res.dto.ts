import { Exclude, Expose } from 'class-transformer';

import { OperationType } from '../../../database/schemas';
import {
  DateField,
  DateFieldOptional,
  EnumField,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

@Exclude()
export class ProductionJobOperationResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @UUIDFieldOptional({
    nullable: true,
    description: 'Liên kết tham khảo tới công đoạn gốc',
  })
  operationId!: string | null;

  @Expose()
  @StringField({ description: 'Mã công đoạn — snapshot lúc duyệt LSX' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên công đoạn — snapshot lúc duyệt LSX' })
  name!: string;

  @Expose()
  @EnumField(() => OperationType)
  type!: OperationType;

  @Expose()
  @NumberField({
    int: true,
    description: 'STT chạy — deterministic step ordering',
  })
  sortOrder!: number;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @NumberField({
    description: 'SL đã hoàn thành ở công đoạn này — tự nhập, ghi đè',
  })
  completedQuantity!: number;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description:
      'Ngày hoàn thành — server tự set khi SL hoàn thành chạm đủ SL kế hoạch của node cha',
  })
  completedDate!: Date | null;

  @Expose()
  @DateField()
  createdAt!: Date;
}
