import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { InventoryDocumentStatus } from '../../../database/schemas';
import {
  BooleanFieldOptional,
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetOutsourcingReceiptsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter theo phiếu gửi (OS-OUT)' })
  readonly outsourcingOrderId?: string;

  @StringFieldOptional({ description: 'Tìm theo tên hoặc mã vật tư' })
  readonly materialKeyword?: string;

  @UUIDFieldOptional({ description: 'Filter theo NCC' })
  readonly supplierId?: string;

  @UUIDFieldOptional({ description: 'Filter theo kho nhận' })
  readonly warehouseId?: string;

  @EnumFieldOptional(() => InventoryDocumentStatus)
  readonly status?: InventoryDocumentStatus;

  @BooleanFieldOptional({ description: 'Filter theo có yêu cầu QC hay không' })
  readonly requiresIqc?: boolean;

  @DateFieldOptional({ description: 'Ngày nhận từ' })
  readonly fromDate?: Date;

  @DateFieldOptional({ description: 'Ngày nhận đến' })
  readonly toDate?: Date;
}
