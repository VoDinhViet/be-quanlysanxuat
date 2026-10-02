import { ClassField } from '../../../decorators/field.decorators';
import { CreatePurchaseRequestItemReqDto } from './create-purchase-request-item.req.dto';

export class CreatePurchaseRequestItemsReqDto {
  @ClassField(() => CreatePurchaseRequestItemReqDto, {
    each: true,
    description:
      'Dòng vật tư thêm vào — tối thiểu 1 dòng, không trùng itemId, không trùng dòng đã có trong phiếu',
  })
  readonly items!: CreatePurchaseRequestItemReqDto[];
}
