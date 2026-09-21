import {
  InventoryDocumentStatus,
  InventoryIssueType,
} from '../../../database/schemas';
import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetInventoryIssuesReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => InventoryIssueType)
  readonly issueType?: InventoryIssueType;

  @EnumFieldOptional(() => InventoryDocumentStatus)
  readonly status?: InventoryDocumentStatus;

  @UUIDFieldOptional()
  readonly productionOrderId?: string;

  @UUIDFieldOptional()
  readonly productionJobId?: string;

  @UUIDFieldOptional()
  readonly departmentId?: string;

  @DateFieldOptional({ description: 'Filter: issueDate >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: issueDate <= endDate' })
  readonly endDate?: Date;
}
