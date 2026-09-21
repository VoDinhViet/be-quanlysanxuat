import { Exclude, Expose } from 'class-transformer';

import { PurchaseRequestStatus } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { DepartmentResDto } from '../../departments/dto/department.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { ProductionOrderRefResDto } from '../../production-orders/dto/production-order-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';

@Exclude()
export class PagePurchaseRequestResDto {
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
  requesterBy!: UserRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  senderBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  sentAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  approverBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  approvedAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  rejecterBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  rejectedAt!: Date | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  rejectionReason!: string | null;

  @Expose()
  @ClassFieldOptional(() => ProductionOrderRefResDto, { nullable: true })
  productionOrder!: ProductionOrderRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => ProductionJobRefResDto, { nullable: true })
  productionJob!: ProductionJobRefResDto | null;
}
