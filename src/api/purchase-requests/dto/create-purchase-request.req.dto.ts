import {
  ClassField,
  DateField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { CreatePurchaseRequestItemReqDto } from './create-purchase-request-item.req.dto';

export class CreatePurchaseRequestReqDto {
  @DateField({ description: 'Ngày cần vật tư' })
  readonly neededDate!: Date;

  @UUIDField({
    description:
      'Bộ phận đề xuất — không suy từ người gọi, cho phép lập hộ bộ phận khác',
  })
  readonly departmentId!: string;

  @ClassField(() => CreatePurchaseRequestItemReqDto, {
    each: true,
    description: 'Dòng vật tư — tối thiểu 1 dòng, không trùng itemId',
  })
  readonly items!: CreatePurchaseRequestItemReqDto[];
}
