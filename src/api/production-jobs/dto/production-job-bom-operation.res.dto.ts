import { Exclude, Expose } from 'class-transformer';

import {
  OperationType,
  ProductionJobBomItemType,
} from '../../../database/schemas';
import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import {
  ClassField,
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
  @UUIDFieldOptional({
    nullable: true,
    description:
      'Id công đoạn của Job — null khi Job PENDING (kế hoạch tạm tính, chưa lưu)',
  })
  id!: string | null;

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
  @DateFieldOptional({
    nullable: true,
    description:
      'Thời gian cập nhật gần nhất — server tự ghi mỗi lần báo cáo/OS-IN đổi tiến độ; null = chưa cập nhật',
  })
  lastReportedAt!: Date | null;

  @Expose()
  @DateFieldOptional({
    nullable: true,
    description:
      'Hạn cần hoàn thành công đoạn — đặt/sửa tay qua PATCH .../due-date',
  })
  dueDate!: Date | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  createdAt!: Date | null;
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
  @EnumField(() => ProductionJobBomItemType, {
    description:
      'FG = node Cấp 0 (lắp ráp/đóng gói thành phẩm, luôn đứng cuối); COMPONENT/DIRECT = node cây BOM',
  })
  itemType!: ProductionJobBomItemType;

  @Expose()
  @FileField('imageFile', 'Ảnh part snapshot (hoặc ảnh thành phẩm cho FG)')
  image!: FileResDto | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description:
      'Tên công đoạn liền sau công đoạn đang lọc (`operationId`) trong routing của Part này — null khi không lọc hoặc khi đó là bước cuối',
  })
  nextOperationName!: string | null;

  @Expose()
  @ClassField(() => ProductionJobBomOperationResDto, { each: true })
  operations!: ProductionJobBomOperationResDto[];
}
