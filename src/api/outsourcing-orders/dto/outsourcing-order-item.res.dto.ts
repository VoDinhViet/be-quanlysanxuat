import { Exclude, Expose } from 'class-transformer';

import {
  ClassFieldOptional,
  NumberField,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';

@Exclude()
export class OutsourcingOrderItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @UUIDFieldOptional({
    nullable: true,
    description: 'Công đoạn as-used của Job — null với dòng không gắn Job',
  })
  productionJobOperationId!: string | null;

  @Expose()
  @UUIDFieldOptional({
    nullable: true,
    description: 'Node BOM của Job — null với dòng không gắn Job',
  })
  productionJobBomItemId!: string | null;

  @Expose()
  @UUIDFieldOptional({
    nullable: true,
    description: 'Công đoạn danh mục — null nếu snapshot mất liên kết',
  })
  operationId!: string | null;

  @Expose()
  @StringField({ description: 'Mã part (snapshot lúc gửi)' })
  itemCode!: string;

  @Expose()
  @StringField({ description: 'Tên part (snapshot lúc gửi)' })
  itemName!: string;

  @Expose()
  @ClassFieldOptional(() => ItemRefResDto, {
    nullable: true,
    description:
      'Vật tư tham khảo — chỉ khi node là DIRECT; null với node COMPONENT',
  })
  item!: ItemRefResDto | null;

  @Expose()
  @FileField('imageFile', 'Ảnh hình minh họa (node BOM của Job)')
  image!: FileResDto | null;

  @Expose()
  @ClassFieldOptional(() => UnitRefResDto, {
    nullable: true,
    description:
      'ĐVT của dòng: đơn vị đã nhập (phiếu thủ công) hoặc ĐVT vật tư khi node là DIRECT',
  })
  unit!: UnitRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => ProductionJobRefResDto, { nullable: true })
  productionJob!: ProductionJobRefResDto | null;

  @Expose()
  @StringField({ description: 'Mã công đoạn (snapshot lúc gửi)' })
  operationCode!: string;

  @Expose()
  @StringField({ description: 'Tên công đoạn (snapshot lúc gửi)' })
  operationName!: string;

  @Expose()
  @NumberField({ description: 'SL gửi' })
  quantity!: number;

  @Expose()
  @NumberField({ description: 'SL đã nhận (OS-IN POSTED trỏ tới dòng này)' })
  receivedQuantity!: number;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description: 'SL định mức của node BOM — null với dòng không gắn Job',
  })
  plannedQuantity!: number | null;

  @Expose()
  @NumberField({
    description:
      'SL công đoạn này đã gửi ở các phiếu khác chưa hủy, để tính còn được gửi khi sửa phiếu',
  })
  sentByOtherOrdersQuantity!: number;

  @Expose()
  @NumberFieldOptional({ nullable: true, description: 'Trọng lượng (kg)' })
  weight!: number | null;

  @Expose()
  @NumberFieldOptional({ nullable: true, description: 'Diện tích (m²)' })
  area!: number | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú dòng' })
  note!: string | null;
}
