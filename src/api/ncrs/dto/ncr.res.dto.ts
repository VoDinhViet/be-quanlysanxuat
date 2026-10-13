import { Exclude, Expose } from 'class-transformer';

import { NcrOriginType, NcrStatus, NcrType } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ClientRefResDto } from '../../clients/dto/client-ref.res.dto';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';

@Exclude()
export class NcrDepartmentResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @StringField()
  name!: string;
}

@Exclude()
export class NcrOrderResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  code!: string;
}

@Exclude()
export class NcrResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã NCR' })
  code!: string;

  @Expose()
  @EnumField(() => NcrType)
  type!: NcrType;

  @Expose()
  @EnumField(() => NcrOriginType)
  originType!: NcrOriginType;

  @Expose()
  @EnumField(() => NcrStatus)
  status!: NcrStatus;

  @Expose()
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @ClassFieldOptional(() => ClientRefResDto, { nullable: true })
  client!: ClientRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => NcrOrderResDto, { nullable: true })
  order!: NcrOrderResDto | null;

  @Expose()
  @ClassFieldOptional(() => ProductionJobRefResDto, { nullable: true })
  productionJob!: ProductionJobRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => NcrDepartmentResDto, { nullable: true })
  department!: NcrDepartmentResDto | null;

  @Expose()
  @NumberField({ description: 'SL hàng lỗi' })
  ngQty!: number;

  @Expose()
  @NumberField({ description: 'SL sửa chữa' })
  reworkQty!: number;

  @Expose()
  @NumberField({ description: 'SL làm mới' })
  remakeQty!: number;

  @Expose()
  @StringFieldOptional({ nullable: true })
  defectDescription!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  rootCause!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  correctiveAction!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  preventiveAction!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  rejectionReason!: string | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  approvedAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  approverBy!: UserRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;
}
