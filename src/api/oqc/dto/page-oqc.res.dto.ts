import { Exclude, Expose } from 'class-transformer';

import {
  IqcResult,
  OqcDisposition,
  OqcStatus,
} from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  EnumField,
  EnumFieldOptional,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { ProductionJobOperationRefResDto } from '../../production-jobs/dto/production-job-operation-ref.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { UnitResDto } from '../../units/dto/unit.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { OqcBomItemResDto } from './oqc.res.dto';

@Exclude()
export class PageOqcResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã OQC' })
  code!: string;

  @Expose()
  @ClassField(() => ProductionJobRefResDto)
  productionJob!: ProductionJobRefResDto;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Mã đơn hàng (PO)' })
  orderCode!: string | null;

  @Expose()
  @ClassField(() => ProductionJobOperationRefResDto)
  operation!: ProductionJobOperationRefResDto;

  @Expose()
  @ClassField(() => OqcBomItemResDto)
  bomItem!: OqcBomItemResDto;

  @Expose()
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @ClassField(() => UnitResDto)
  unit!: UnitResDto;

  @Expose()
  @NumberField({ description: 'Lot size (SL sản xuất thực tế)' })
  quantity!: number;

  @Expose()
  @DateField({ description: 'Ngày kiểm' })
  inspectionDate!: Date;

  @Expose()
  @EnumFieldOptional(() => IqcResult, { nullable: true })
  result!: IqcResult | null;

  @Expose()
  @EnumField(() => OqcStatus)
  status!: OqcStatus;

  @Expose()
  @EnumFieldOptional(() => OqcDisposition, {
    nullable: true,
    description: 'Cách xử lý khi FAIL',
  })
  disposition!: OqcDisposition | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú' })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
