import {
  ClassField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { CreatePurchaseOrderItemReqDto } from './create-purchase-order-item.req.dto';

export class CreatePurchaseOrderReqDto {
  @UUIDField({ description: 'Id nhà cung cấp' })
  readonly supplierId!: string;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;

  @ClassField(() => CreatePurchaseOrderItemReqDto, {
    each: true,
    minItems: 1,
    description: 'Các dòng đặt mua — mỗi dòng trỏ một dòng ĐXMH đã duyệt',
  })
  readonly items!: CreatePurchaseOrderItemReqDto[];
}
