import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  InventoryRequisitionStatus,
  InventoryRequisitionType,
} from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetInventoryRequisitionsReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => InventoryRequisitionType)
  readonly type?: InventoryRequisitionType;

  @EnumFieldOptional(() => InventoryRequisitionStatus)
  readonly status?: InventoryRequisitionStatus;

  @UUIDFieldOptional({ description: 'Filter theo người tạo (users.id)' })
  readonly createdBy?: string;

  @UUIDFieldOptional({ description: 'Filter theo LSX' })
  readonly productionOrderId?: string;

  @UUIDFieldOptional({ description: 'Filter theo Job' })
  readonly productionJobId?: string;

  @DateFieldOptional({ description: 'Filter: requisitionDate >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: requisitionDate <= endDate' })
  readonly endDate?: Date;
}
