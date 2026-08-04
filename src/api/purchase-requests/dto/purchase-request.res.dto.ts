import { Exclude, Expose } from 'class-transformer';

import { PurchaseRequestStatus } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { DepartmentResDto } from '../../departments/dto/department.res.dto';
import { ProductionOrderRefResDto } from '../../production-orders/dto/production-order-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';

@Exclude()
export class PurchaseRequestResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu đề xuất' })
  code!: string;

  @Expose()
  @DateField({ description: 'Ngày cần' })
  neededDate!: Date;

  @Expose()
  @EnumField(() => PurchaseRequestStatus)
  status!: PurchaseRequestStatus;

  @Expose()
  @DateField({ description: 'Ngày tạo phiếu' })
  createdAt!: Date;

  @Expose()
  @ClassField(() => DepartmentResDto)
  department!: DepartmentResDto;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  requester!: UserRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => ProductionOrderRefResDto, { nullable: true })
  productionOrder!: ProductionOrderRefResDto | null;
}
