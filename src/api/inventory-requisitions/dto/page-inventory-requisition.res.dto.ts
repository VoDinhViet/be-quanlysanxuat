import { Exclude, Expose } from 'class-transformer';

import {
  InventoryRequisitionStatus,
  InventoryRequisitionType,
} from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateField,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { DepartmentResDto } from '../../departments/dto/department.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { RequisitionProductionOrderResDto } from './requisition-production-order.res.dto';

@Exclude()
export class PageInventoryRequisitionResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu' })
  code!: string;

  @Expose()
  @DateField({ description: 'Ngày lập phiếu' })
  requisitionDate!: Date;

  @Expose()
  @EnumField(() => InventoryRequisitionType)
  type!: InventoryRequisitionType;

  @Expose()
  @EnumField(() => InventoryRequisitionStatus)
  status!: InventoryRequisitionStatus;

  @Expose()
  @ClassFieldOptional(() => DepartmentResDto, { nullable: true })
  department!: DepartmentResDto | null;

  @Expose()
  @ClassFieldOptional(() => RequisitionProductionOrderResDto, {
    nullable: true,
    description: 'LSX liên quan — productionOrder.order.code là mã PO',
  })
  productionOrder!: RequisitionProductionOrderResDto | null;

  @Expose()
  @ClassFieldOptional(() => ProductionJobRefResDto, { nullable: true })
  productionJob!: ProductionJobRefResDto | null;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Lý do lãnh — chỉ có ý nghĩa khi type = OTHER',
  })
  reason!: string | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @DateField({ description: 'Ngày tạo phiếu' })
  createdAt!: Date;
}
