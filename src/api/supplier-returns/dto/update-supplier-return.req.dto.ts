import { StringFieldOptional } from '../../../decorators/field.decorators';

export class UpdateSupplierReturnReqDto {
  @StringFieldOptional({
    nullable: true,
    maxLength: 1000,
    description: 'Lý do trả hàng',
  })
  readonly returnReason?: string | null;
}
