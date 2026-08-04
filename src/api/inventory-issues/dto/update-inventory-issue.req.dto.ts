import { InventoryIssueType } from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { InventoryIssueItemReqDto } from './inventory-issue-item.req.dto';

/** Chỉ hợp lệ khi phiếu còn `DRAFT` (`E098`). `warehouseId` bất biến — đổi kho là lập phiếu mới. */
export class UpdateInventoryIssueReqDto {
  @EnumFieldOptional(() => InventoryIssueType)
  readonly issueType?: InventoryIssueType;

  @DateFieldOptional()
  readonly issueDate?: Date;

  @UUIDFieldOptional()
  readonly productionOrderId?: string;

  @UUIDFieldOptional()
  readonly productionJobId?: string;

  @UUIDFieldOptional()
  readonly departmentId?: string;

  @UUIDFieldOptional()
  readonly requestedBy?: string;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;

  @ClassFieldOptional(() => InventoryIssueItemReqDto, { each: true })
  readonly items?: InventoryIssueItemReqDto[];
}
