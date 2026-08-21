import {
  ClassField,
  DateField,
  DateFieldOptional,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { OutsourcingOrderItemReqDto } from './outsourcing-order-item.req.dto';

export class CreateOutsourcingOrderReqDto {
  @UUIDField({ description: 'NCC gia công' })
  readonly supplierId!: string;

  // Tuỳ chọn — không dùng để trừ/theo dõi tồn kho, không đọc lại ở response nào
  // (docs/decisions/wip-not-stocked.md).
  @UUIDFieldOptional({ nullable: true, description: 'Kho xuất hàng đi' })
  readonly warehouseId?: string | null;

  @DateField({ description: 'Ngày gửi' })
  readonly sendDate!: Date;

  @DateFieldOptional({ nullable: true, description: 'Ngày hẹn về' })
  readonly expectedReturnDate?: Date | null;

  @StringFieldOptional({
    nullable: true,
    maxLength: 1000,
    description: 'Ghi chú',
  })
  readonly note?: string | null;

  @ClassField(() => OutsourcingOrderItemReqDto, { each: true })
  readonly items!: OutsourcingOrderItemReqDto[];
}
