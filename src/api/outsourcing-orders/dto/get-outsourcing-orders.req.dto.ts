import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { InventoryDocumentStatus } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { OutsourcingOrderProgress } from '../outsourcing-orders.constant';

export class GetOutsourcingOrdersReqDto extends PageOptionsDto {
  @StringFieldOptional({ description: 'Tìm theo tên hoặc mã vật tư' })
  readonly materialKeyword?: string;

  @UUIDFieldOptional({ description: 'Filter theo NCC' })
  readonly supplierId?: string;

  @UUIDFieldOptional({ description: 'Filter theo kho gửi' })
  readonly warehouseId?: string;

  @UUIDFieldOptional({ description: 'Filter theo Job (LSX)' })
  readonly productionJobId?: string;

  @UUIDFieldOptional({ description: 'Filter theo công đoạn (danh mục sống)' })
  readonly operationId?: string;

  @EnumFieldOptional(() => InventoryDocumentStatus)
  readonly status?: InventoryDocumentStatus;

  @EnumFieldOptional(() => OutsourcingOrderProgress, {
    description:
      'Tiến độ nhận hàng, suy từ status + SL đã nhận — không phải cột DB',
  })
  readonly progress?: OutsourcingOrderProgress;

  @DateFieldOptional({ description: 'Ngày gửi từ' })
  readonly fromDate?: Date;

  @DateFieldOptional({ description: 'Ngày gửi đến' })
  readonly toDate?: Date;
}
