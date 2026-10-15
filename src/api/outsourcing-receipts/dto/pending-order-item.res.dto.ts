import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
  NumberField,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { OutsourcingOrderRefResDto } from '../../outsourcing-orders/dto/outsourcing-order-ref.res.dto';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';

/** Dòng popup "chọn hàng cần nhận". `id` là giá trị client gửi lại làm
 * `OutsourcingReceiptItemReqDto.outsourcingOrderItemId`; `weight`/`area` chỉ là mặc định gợi ý từ
 * dòng OS-OUT gốc, client có thể sửa. */
@Exclude()
export class PendingOrderItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => OutsourcingOrderRefResDto)
  outsourcingOrder!: OutsourcingOrderRefResDto;

  @Expose()
  @ClassField(() => SupplierRefResDto)
  supplier!: SupplierRefResDto;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Mã Job' })
  jobCode!: string | null;

  @Expose()
  @StringField({ description: 'Mã part (snapshot từ dòng OS-OUT)' })
  itemCode!: string;

  @Expose()
  @StringField({ description: 'Tên part (snapshot từ dòng OS-OUT)' })
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
    description: 'ĐVT vật tư — chỉ khi node là DIRECT',
  })
  unit!: UnitRefResDto | null;

  @Expose()
  @StringField({ description: 'Mã công đoạn' })
  operationCode!: string;

  @Expose()
  @StringField({ description: 'Tên công đoạn' })
  operationName!: string;

  @Expose()
  @NumberField({ description: 'SL đã gửi (dòng OS-OUT)' })
  quantity!: number;

  @Expose()
  @NumberField({ description: 'SL đã nhận (OS-IN POSTED trỏ tới dòng này)' })
  receivedQuantity!: number;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description: 'Trọng lượng (kg) của dòng OS-OUT gốc',
  })
  weight!: number | null;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description: 'Diện tích (m²) của dòng OS-OUT gốc',
  })
  area!: number | null;
}
