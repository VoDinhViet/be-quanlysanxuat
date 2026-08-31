import { Exclude, Expose } from 'class-transformer';

import {
  InventoryRequisitionStatus,
  InventoryRequisitionType,
} from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { DepartmentResDto } from '../../departments/dto/department.res.dto';
import { InventoryIssueRefResDto } from '../../inventory-issues/dto/inventory-issue-ref.res.dto';
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { InventoryRequisitionItemResDto } from './inventory-requisition-item.res.dto';
import { RequisitionProductionOrderResDto } from './requisition-production-order.res.dto';

@Exclude()
export class InventoryRequisitionResDto {
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
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => InventoryIssueRefResDto, {
    nullable: true,
    description: 'Phiếu xuất kho tự sinh lúc issue',
  })
  inventoryIssue!: InventoryIssueRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

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
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  issuerBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  issuedAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => InventoryRequisitionItemResDto, { each: true })
  items!: InventoryRequisitionItemResDto[];

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
