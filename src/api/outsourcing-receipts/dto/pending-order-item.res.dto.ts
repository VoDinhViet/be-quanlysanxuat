import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  NumberField,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { OutsourcingOrderRefResDto } from '../../outsourcing-orders/dto/outsourcing-order-ref.res.dto';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UnitResDto } from '../../units/dto/unit.res.dto';

/** Một dòng popup "Tìm kiếm & chọn hàng cần nhận" — `id` là id thật sự cần gửi lại khi tạo dòng
 * OS-IN (`OutsourcingReceiptItemReqDto.outsourcingOrderItemId`). `weight`/`area` là giá trị mặc
 * định gợi ý cho form nhập, lấy nguyên theo dòng OS-OUT gốc — client có thể sửa. */
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
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @ClassField(() => UnitResDto)
  unit!: UnitResDto;

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
