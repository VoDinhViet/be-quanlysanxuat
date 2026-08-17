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
import { ItemUnitRefResDto } from '../../items/dto/item-unit-ref.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';

@Exclude()
export class OutsourcingOrderItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => ItemUnitRefResDto)
  item!: ItemUnitRefResDto;

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
  @NumberField({ description: 'SL gửi dòng này' })
  quantity!: number;

  @Expose()
  @NumberField({ description: 'SL đã nhận (Σ dòng OS-IN POSTED trỏ dòng này)' })
  receivedQuantity!: number;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description:
      'SL định mức (theo Job) lúc tạo dòng — snapshot chỉ để hiển thị/in, không dùng để validate',
  })
  plannedQuantity!: number | null;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description:
      'SL đã gửi trước đó (OS-OUT trước) — snapshot chỉ để hiển thị/in',
  })
  sentBeforeQuantity!: number | null;

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
