import { InventoryIssueType } from '../../../database/schemas';
import {
  ClassField,
  DateField,
  EnumField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { InventoryIssueItemReqDto } from './inventory-issue-item.req.dto';

export class CreateInventoryIssueReqDto {
  @UUIDField({ description: 'Kho xuất' })
  readonly warehouseId!: string;

  @EnumField(() => InventoryIssueType)
  readonly issueType!: InventoryIssueType;

  @DateField({ description: 'Ngày chứng từ' })
  readonly issueDate!: Date;

  @UUIDFieldOptional({ description: 'LSX liên quan (tuỳ chọn)' })
  readonly productionOrderId?: string;

  @UUIDFieldOptional({ description: 'Job liên quan (issueType=PRODUCTION)' })
  readonly productionJobId?: string;

  @UUIDFieldOptional({ description: 'Bộ phận yêu cầu xuất' })
  readonly departmentId?: string;

  @UUIDFieldOptional({ description: 'Người yêu cầu xuất' })
  readonly requestedBy?: string;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;

  @ClassField(() => InventoryIssueItemReqDto, { each: true, minItems: 1 })
  readonly items!: InventoryIssueItemReqDto[];
}
