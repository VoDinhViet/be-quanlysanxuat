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
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';

@Exclude()
export class OutsourcingReceiptItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => OutsourcingOrderRefResDto)
  outsourcingOrder!: OutsourcingOrderRefResDto;

  @Expose()
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @ClassField(() => UnitRefResDto)
  unit!: UnitRefResDto;

  @Expose()
  @StringField({ description: 'Mã công đoạn (theo dòng OS-OUT nguồn)' })
  operationCode!: string;

  @Expose()
  @StringField({ description: 'Tên công đoạn (theo dòng OS-OUT nguồn)' })
  operationName!: string;

  @Expose()
  @NumberField({ description: 'SL nhận dòng này' })
  quantity!: number;

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
