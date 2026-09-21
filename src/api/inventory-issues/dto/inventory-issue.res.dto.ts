import { Exclude, Expose } from 'class-transformer';

import {
  InventoryDocumentStatus,
  InventoryIssueType,
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
import { ProductionJobRefResDto } from '../../production-jobs/dto/production-job-ref.res.dto';
import { ProductionOrderRefResDto } from '../../production-orders/dto/production-order-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { InventoryIssueItemResDto } from './inventory-issue-item.res.dto';

@Exclude()
export class InventoryIssueResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu' })
  code!: string;

  @Expose()
  @EnumField(() => InventoryIssueType)
  issueType!: InventoryIssueType;

  @Expose()
  @EnumField(() => InventoryDocumentStatus)
  status!: InventoryDocumentStatus;

  @Expose()
  @DateField({ description: 'Ngày chứng từ' })
  issueDate!: Date;

  @Expose()
  @ClassFieldOptional(() => ProductionOrderRefResDto, { nullable: true })
  productionOrder!: ProductionOrderRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => ProductionJobRefResDto, { nullable: true })
  productionJob!: ProductionJobRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => DepartmentResDto, { nullable: true })
  department!: DepartmentResDto | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  requesterBy!: UserRefResDto | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => InventoryIssueItemResDto, { each: true })
  items!: InventoryIssueItemResDto[];

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  posterBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  postedAt!: Date | null;

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
