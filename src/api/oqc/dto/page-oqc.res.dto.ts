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
import { ItemUnitRefResDto } from '../../items/dto/item-unit-ref.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { OqcBomItemResDto, OqcOperationResDto } from './oqc.res.dto';

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
  @ClassField(() => OqcOperationResDto)
  operation!: OqcOperationResDto;

  @Expose()
  @ClassField(() => OqcBomItemResDto)
  bomItem!: OqcBomItemResDto;

  @Expose()
  @ClassField(() => ItemUnitRefResDto)
  item!: ItemUnitRefResDto;

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
