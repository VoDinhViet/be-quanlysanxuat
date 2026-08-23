import { InventoryRequisitionType } from '../../../database/schemas';
import {
  ClassField,
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { CreateInventoryRequisitionItemReqDto } from './create-inventory-requisition-item.req.dto';

export class UpdateInventoryRequisitionReqDto {
  @DateFieldOptional()
  readonly requisitionDate?: Date;

  @EnumFieldOptional(() => InventoryRequisitionType)
  readonly type?: InventoryRequisitionType;

  @UUIDFieldOptional()
  readonly departmentId?: string;

  @UUIDFieldOptional()
  readonly productionOrderId?: string;

  @UUIDFieldOptional()
  readonly productionJobId?: string;

  @StringFieldOptional({ maxLength: 500 })
  readonly reason?: string;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;

  @ClassField(() => CreateInventoryRequisitionItemReqDto, {
    each: true,
    minItems: 1,
    description:
      'Dòng vật tư — replace-all, phải gửi lại toàn bộ; kho của phiếu không sửa được',
  })
  readonly items!: CreateInventoryRequisitionItemReqDto[];
}
