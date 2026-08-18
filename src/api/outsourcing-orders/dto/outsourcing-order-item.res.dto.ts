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
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { UnitResDto } from '../../units/dto/unit.res.dto';

@Exclude()
export class OutsourcingOrderItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @ClassField(() => UnitResDto)
  unit!: UnitResDto;

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
  @NumberFieldOptional({ nullable: true, description: 'Trọng lượng (kg)' })
  weight!: number | null;

  @Expose()
  @NumberFieldOptional({ nullable: true, description: 'Diện tích (m²)' })
  area!: number | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú dòng' })
  note!: string | null;
}
