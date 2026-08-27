import { Exclude, Expose } from 'class-transformer';

import { ItemType, OperationType } from '../../../database/schemas';
import {
  ClassField,
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
export class ProductionJobBomOperationResDto {
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
    description:
      'SL kế hoạch của node BOM chứa công đoạn — định mức nhân luỹ kế theo cây × SL Job; cũng là ' +
      'trần của completedQuantity (E256), không giới hạn rejectedQuantity',
  })
  plannedQuantity!: number;

  @Expose()
  @NumberField({
    description: 'SL đã hoàn thành (đạt) ở công đoạn này — tự nhập, ghi đè',
  })
  completedQuantity!: number;

  @Expose()
  @NumberField({
    description: 'SL không đạt (NG) ở công đoạn này — tự nhập, ghi đè',
  })
  rejectedQuantity!: number;

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

@Exclude()
export class ProductionJobBomItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã part (snapshot BOM của Job)' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên chi tiết (snapshot BOM của Job)' })
  name!: string;

  @Expose()
  @EnumField(() => ItemType, {
    description:
      'FG = node Cấp 0 (lắp ráp/đóng gói thành phẩm, luôn đứng cuối); WIP/RM = node cây BOM',
  })
  itemType!: ItemType;

  @Expose()
  @ClassField(() => ProductionJobBomOperationResDto, { each: true })
  operations!: ProductionJobBomOperationResDto[];
}
