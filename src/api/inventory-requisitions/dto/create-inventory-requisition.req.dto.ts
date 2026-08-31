import { InventoryRequisitionType } from '../../../database/schemas';
import {
  ClassField,
  DateField,
  EnumField,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { CreateInventoryRequisitionItemReqDto } from './create-inventory-requisition-item.req.dto';

export class CreateInventoryRequisitionReqDto {
  @DateField({ description: 'Ngày lập phiếu' })
  readonly requisitionDate!: Date;

  @EnumField(() => InventoryRequisitionType)
  readonly type!: InventoryRequisitionType;

  @UUIDFieldOptional({ description: 'Bộ phận lãnh' })
  readonly departmentId?: string;

  @UUIDFieldOptional({ description: 'LSX liên quan (tuỳ chọn)' })
  readonly productionOrderId?: string;

  @UUIDFieldOptional({
    description: 'Job liên quan — bắt buộc khi type = PRODUCTION',
  })
  readonly productionJobId?: string;

  @StringFieldOptional({
    maxLength: 500,
    description: 'Lý do lãnh — chỉ dùng khi type = OTHER',
  })
  readonly reason?: string;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;

  @ClassField(() => CreateInventoryRequisitionItemReqDto, {
    each: true,
    minItems: 1,
    description: 'Dòng vật tư — tối thiểu 1 dòng, không trùng itemId, luôn RM',
  })
  readonly items!: CreateInventoryRequisitionItemReqDto[];
}
